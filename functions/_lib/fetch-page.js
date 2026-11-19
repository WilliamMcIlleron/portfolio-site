/* ==========================================================================
   Fetches one home page for the site checker, safely.

   - Redirects are followed by hand, at most 3, and every hop goes back through
     the full URL guard (scheme, host shape, DNS).
   - 8 s per request, 15 s for the whole fetch.
   - The body is read as a stream and cut off at 1.5 MB.
   - Only HTML is accepted. Nothing inside the page is ever fetched.
   - An honest User-Agent. A 403 or a bot challenge is reported as "blocked"
     and never retried.
   ========================================================================== */

import { checkTarget } from './url-guard.js';

export const UA = 'WilliamMcIlleron-SiteCheck/1.0 (+https://williammcilleron.com/#audit)';
export const MAX_BYTES = 1.5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
const PER_REQUEST_MS = 8000;
const TOTAL_MS = 15000;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

function isTimeout(e) {
    return e && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

async function readCapped(res) {
    const reader = res.body?.getReader?.();
    if (!reader) return { text: await res.text(), bytes: 0, truncated: false };
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = '';
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) {
                const keep = value.byteLength - (bytes - MAX_BYTES);
                text += decoder.decode(value.subarray(0, Math.max(0, keep)), { stream: true });
                bytes = MAX_BYTES;
                truncated = true;
                await reader.cancel().catch(() => {});
                break;
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } catch (e) {
        // A trickling or stalled server: audit what arrived, if anything did.
        timedOut = true;
        await reader.cancel().catch(() => {});
    }
    return { text, bytes, truncated, timedOut };
}

/**
 * @param {string} input   already-typed address (normalised again here)
 * @param {object} [deps]  { fetch, guard, now } for tests
 */
export async function fetchPage(input, deps = {}) {
    const f = deps.fetch ?? fetch;
    const guard = deps.guard ?? ((u) => checkTarget(u, { fetch: f }));
    const now = deps.now ?? (() => Date.now());
    const perRequestMs = deps.perRequestMs ?? PER_REQUEST_MS;
    const totalMs = deps.totalMs ?? TOTAL_MS;
    const t0 = now();
    let url = input;
    const hops = [];

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const g = await guard(url);
        if (!g.ok) return { ok: false, reason: g.reason, host: safeHost(url) };
        url = g.url;

        const remaining = totalMs - (now() - t0);
        if (remaining <= 0) return { ok: false, reason: 'timeout', host: g.host };

        let res;
        try {
            res = await f(url, {
                method: 'GET',
                redirect: 'manual',
                headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': UA },
                signal: AbortSignal.timeout(Math.min(perRequestMs, remaining)),
            });
        } catch (e) {
            return { ok: false, reason: isTimeout(e) ? 'timeout' : 'unreachable', host: g.host };
        }

        if (REDIRECT_STATUS.has(res.status)) {
            const loc = res.headers.get('location');
            await res.body?.cancel?.().catch?.(() => {});
            if (!loc) return { ok: false, reason: 'http', status: res.status, host: g.host };
            if (i === MAX_REDIRECTS) return { ok: false, reason: 'redirects', host: g.host };
            hops.push(url);
            try { url = new URL(loc, url).toString(); } catch { return { ok: false, reason: 'invalid', host: g.host }; }
            continue;
        }

        const challenged = res.headers.get('cf-mitigated') === 'challenge';
        if (challenged || res.status === 403 || res.status === 429 || res.status === 503) {
            await res.body?.cancel?.().catch?.(() => {});
            return { ok: false, reason: 'blocked-by-site', status: res.status, host: g.host };
        }
        if (res.status >= 400) {
            await res.body?.cancel?.().catch?.(() => {});
            return { ok: false, reason: 'http', status: res.status, host: g.host };
        }

        const type = (res.headers.get('content-type') || '').toLowerCase();
        if (!type.includes('text/html') && !type.includes('application/xhtml')) {
            await res.body?.cancel?.().catch?.(() => {});
            return { ok: false, reason: 'not-html', type: type.split(';')[0] || 'unknown', host: g.host };
        }

        const body = await readCapped(res);
        if (!body.text && body.timedOut) return { ok: false, reason: 'timeout', host: g.host };

        return {
            ok: true,
            host: g.host,
            finalUrl: url,
            status: res.status,
            headers: { 'content-type': type, 'strict-transport-security': res.headers.get('strict-transport-security') || '' },
            html: body.text,
            bytes: body.bytes,
            truncated: body.truncated,
            partial: !!body.timedOut,
            hops,
        };
    }
    return { ok: false, reason: 'redirects' };
}

/**
 * Does http://host/ send visitors to https? One request, redirect not followed.
 * Returns true, false, or null when it could not be tested.
 */
export async function httpRedirectsToHttps(host, deps = {}) {
    const f = deps.fetch ?? fetch;
    const guard = deps.guard ?? ((u) => checkTarget(u, { fetch: f }));
    const url = `http://${host}/`;
    const g = await guard(url);
    if (!g.ok) return null;
    try {
        const res = await f(g.url, {
            method: 'GET',
            redirect: 'manual',
            headers: { accept: 'text/html', 'user-agent': UA },
            signal: AbortSignal.timeout(5000),
        });
        await res.body?.cancel?.().catch?.(() => {});
        const loc = res.headers.get('location') || '';
        return (res.status === 301 || res.status === 308 || res.status === 302 || res.status === 307) && /^https:\/\//i.test(loc);
    } catch {
        return null;
    }
}

function safeHost(u) {
    try { return new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u).hostname; } catch { return ''; }
}
