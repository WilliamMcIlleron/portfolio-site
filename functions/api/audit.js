/**
 * Cloudflare Pages Function: POST /api/audit
 *
 * Body: {"url": "yourbusiness.co.za", "turnstileToken": "..."} (JSON, max 4 KB)
 *
 * Order: Turnstile -> rate limit -> URL shape -> (host cache) -> DNS guard and
 * fetch (fetchPage re-runs the full guard on every redirect hop) -> checks ->
 * optional Google speed test -> report.
 *
 * The answer is NDJSON (one JSON object per line), so the page can show real
 * progress:
 *   {"type":"step","id":"open"|"phone"|"buttons"|"google"|"speed","label":"..."}
 *   {"type":"report","report":{...,"reportId":"..."},"shareUrl":"/check/<id>"}
 *   {"type":"error","code":"...","message":"...","status":<n|null>}
 * A malformed body is a plain HTTP 400 JSON answer instead. Errors found before
 * the stream starts (bindings, Turnstile, rate limit) use a real HTTP status
 * (500, 403, 429) but the same one-line NDJSON body, so the client can always
 * parse the body the same way.
 *
 * Bindings (Pages project > Settings > Functions / Variables):
 *   AUDITS            KV namespace. Required. Rate counters, 1 h cache, 30-day reports.
 *   TURNSTILE_SECRET  secret. Required.
 *   RL_SALT           secret. Required. Salt for the hashed IP in rate-limit keys.
 *   PSI_KEY           secret. Optional. Turns on the Google speed step.
 *
 * Data kept: the report JSON only (never the fetched HTML), rate counters.
 * Logged: hostname, outcome code, duration, check ids, hashed IP prefix. Never
 * the full URL, page content, raw IP or the Turnstile token.
 */

import { normalizeInput } from '../_lib/url-guard.js';
import { fetchPage, httpRedirectsToHttps } from '../_lib/fetch-page.js';
import { runChecks } from '../_lib/checks.js';
import { buildReport } from '../_lib/report.js';
import { verifyTurnstile } from '../_lib/turnstile.js';
import { checkRateLimit, getCachedReport, storeReport, newReportId, ipHash } from '../_lib/ratelimit.js';
import { fetchLcp } from '../_lib/psi.js';
import { STEPS, errorMessage } from '../_lib/audit-copy.js';
import { json, methodNotAllowed, readJsonBody, clientIp, truncate } from '../_lib/http.js';

const MAX_BODY = 4096;

const NDJSON_HEADERS = {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
};

function errorEvent(code, d = {}) {
    const ev = { type: 'error', code, message: errorMessage(code, d), status: typeof d.status === 'number' ? d.status : null };
    if (d.retryAt) ev.retryAt = d.retryAt;
    return ev;
}

/** One NDJSON line, as a whole Response (used before the stream starts). */
function ndjsonOnce(event, status) {
    return new Response(JSON.stringify(event) + '\n', { status, headers: NDJSON_HEADERS });
}

function log(fields) {
    // Only safe fields reach here: hostname, outcome, duration, check ids, hashed IP.
    console.log(JSON.stringify({ evt: 'audit', ...fields }));
}

/** fetchPage reasons -> the public error codes. */
function mapFetchFailure(page, host) {
    switch (page.reason) {
        case 'invalid': return ['invalid', {}];
        case 'blocked': return ['blocked', {}];
        case 'dns':
        case 'unreachable': return ['dns', { host }];
        case 'timeout': return ['timeout', { host }];
        case 'redirects': return ['http', { host, redirects: true }];
        case 'http': return ['http', { host, status: page.status }];
        case 'blocked-by-site': return ['blocked-by-site', { host, status: page.status }];
        case 'not-html': return ['not-html', { host, type: page.type }];
        default: return ['internal', {}];
    }
}

export async function onRequestPost(context) {
    const { request } = context;
    const env = context.env || {};
    const t0 = Date.now();

    const parsed = await readJsonBody(request, MAX_BODY);
    if (!parsed.ok) {
        return json({ ok: false, error: parsed.error }, parsed.error === 'too-large' ? 413 : 400);
    }
    const { url, turnstileToken } = parsed.data;
    if (typeof url !== 'string' || !url.trim()) return json({ ok: false, error: 'malformed' }, 400);

    const missing = ['AUDITS', 'TURNSTILE_SECRET', 'RL_SALT'].filter((k) => !env[k]);
    if (missing.length) {
        console.error('audit: missing bindings: ' + missing.join(', '));
        return ndjsonOnce(errorEvent('internal'), 500);
    }

    const ip = clientIp(request);
    const ipPrefix = await ipHash(ip, env.RL_SALT);

    // 1. Bot check. Fails closed.
    const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: turnstileToken, ip });
    if (!ts.ok) {
        log({ outcome: 'turnstile', ms: Date.now() - t0, ip: ipPrefix, codes: ts.codes });
        return ndjsonOnce(errorEvent('turnstile'), 403);
    }

    // 2. Volume.
    let rl;
    try {
        rl = await checkRateLimit({ kv: env.AUDITS, ip, salt: env.RL_SALT });
    } catch (e) {
        console.error('audit: rate limit store failed: ' + truncate(e));
        return ndjsonOnce(errorEvent('internal'), 500);
    }
    if (!rl.ok) {
        log({ outcome: 'rate', scope: rl.scope, ms: Date.now() - t0, ip: ipPrefix });
        return ndjsonOnce(errorEvent('rate', { retryAt: rl.retryAt, scope: rl.scope }), 429);
    }

    // 3. From here the answer streams.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const send = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n')).catch(() => {});

    const work = runAudit({ url, env, send, t0, ipPrefix })
        .catch((e) => {
            console.error('audit: crashed: ' + truncate(e));
            log({ outcome: 'internal', ms: Date.now() - t0, ip: ipPrefix });
            return send(errorEvent('internal'));
        })
        .finally(() => writer.close().catch(() => {}));
    if (typeof context.waitUntil === 'function') context.waitUntil(work);

    return new Response(readable, { status: 200, headers: NDJSON_HEADERS });
}

async function runAudit({ url, env, send, t0, ipPrefix }) {
    const done = (outcome, extra = {}) => log({ outcome, ms: Date.now() - t0, ip: ipPrefix, ...extra });

    const n = normalizeInput(url);
    if (!n.ok) {
        done(n.reason);
        return send(errorEvent(n.reason));
    }
    const host = n.host;
    const typedScheme = /^https?:\/\//i.test(url.trim());
    const u = new URL(n.url);
    const isHome = u.pathname === '/' && !u.search;

    // A home page checked in the last hour is served from the cache: one fetch per site per hour.
    if (isHome) {
        const cached = await getCachedReport(env.AUDITS, host);
        if (cached) {
            done('cached', { host });
            return send({ type: 'report', report: cached, shareUrl: '/check/' + cached.reportId, cached: true });
        }
    }

    // Opening: DNS guard plus the fetch (the guard runs again on every redirect).
    await send({ type: 'step', id: 'open', label: STEPS.open });
    const page = await fetchPage(n.url);
    if (!page.ok) {
        const [code, d] = mapFetchFailure(page, host);
        done(code, { host, status: page.status ?? null });
        return send(errorEvent(code, d));
    }
    // Spec check 1: a bare domain must also send http:// visitors to https.
    const httpRedirects = !typedScheme && /^https:/i.test(page.finalUrl)
        ? await httpRedirectsToHttps(host)
        : null;

    // The checks are pure and in memory, so these three steps land within milliseconds.
    await send({ type: 'step', id: 'phone', label: STEPS.phone });
    const { facts, jsHeavy } = runChecks({ html: page.html, finalUrl: page.finalUrl, httpRedirects, bytes: page.bytes });
    page.html = ''; // the page itself is never kept or stored
    await send({ type: 'step', id: 'buttons', label: STEPS.buttons });
    await send({ type: 'step', id: 'google', label: STEPS.google });

    // Optional: Google's phone speed test. Undefined = not asked, null = no answer in time.
    let speed;
    if (env.PSI_KEY) {
        await send({ type: 'step', id: 'speed', label: STEPS.speed });
        const lcp = await fetchLcp(page.finalUrl, { key: env.PSI_KEY });
        speed = lcp === null ? null : { lcp };
    }

    const report = {
        ...buildReport({
            host, facts, jsHeavy, truncated: page.truncated, partial: page.partial, speed,
            checkedAt: new Date().toISOString(),
        }),
        reportId: newReportId(),
    };

    let shareUrl = '/check/' + report.reportId;
    try {
        await storeReport(env.AUDITS, host, report, { cache: isHome });
    } catch (e) {
        console.error('audit: report store failed: ' + truncate(e));
        shareUrl = null; // the report still shows; it just has no link
    }

    done('ok', {
        host,
        pass: report.working.map((x) => x.id),
        fail: report.worth.map((x) => x.id),
        speed: speed === undefined ? 'off' : speed === null ? 'none' : 'ok',
    });
    return send({ type: 'report', report, shareUrl });
}

export function onRequest() {
    return methodNotAllowed('POST');
}
