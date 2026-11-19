import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequest } from '../functions/api/audit.js';
import { STEPS } from '../functions/_lib/audit-copy.js';
import { fetchLcp, PSI_ENDPOINT } from '../functions/_lib/psi.js';
import {
    mockKV, brokenKV, mockFetch, startsWith, turnstileOk, turnstileFail, dohPublic, dohPrivate,
    htmlResponse, withFetch, captureLogs,
} from './_mocks.mjs';

const PAGE = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blue Pools Pretoria</title><meta name="description" content="Pool care">
</head><body><a href="tel:+27821234567">Call 082 123 4567</a>
<p>secret-page-text-should-never-be-logged</p></body></html>`;

const IP = '203.0.113.50';
const env = (over = {}) => ({ AUDITS: mockKV(), TURNSTILE_SECRET: 'secret', RL_SALT: 'salt', ...over });

function req(body, { method = 'POST', raw = false } = {}) {
    return new Request('https://williammcilleron.com/api/audit', {
        method,
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': IP },
        body: method === 'GET' ? undefined : raw ? body : JSON.stringify(body),
    });
}

async function events(res) {
    const text = await res.text();
    return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const siteRoutes = (page = () => htmlResponse(PAGE)) => [
    turnstileOk,
    dohPublic,
    [(u) => u === 'http://example.co.za/', () => new Response(null, { status: 301, headers: { location: 'https://example.co.za/' } })],
    [(u) => u === 'https://example.co.za/', page],
];

async function audit(body, e = env(), routes = siteRoutes()) {
    const f = mockFetch(routes);
    const { result, lines } = await captureLogs(() => withFetch(f, async () => {
        const res = await onRequestPost({ request: req(body), env: e });
        return { res, evs: await events(res) };
    }));
    return { ...result, f, lines, env: e };
}

const pageFetched = (f) => f.calls.some((c) => c.url.includes('example.co.za') && !c.url.includes('cloudflare-dns'));

/* ---- happy path --------------------------------------------------------- */

test('streams real steps in order, then a report with a shareable id', async () => {
    const { res, evs, env: e } = await audit({ url: 'example.co.za', turnstileToken: 'tok' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/x-ndjson/);
    const steps = evs.filter((x) => x.type === 'step');
    assert.deepEqual(steps.map((s) => s.id), ['open', 'phone', 'buttons', 'google']);
    assert.deepEqual(steps.map((s) => s.label), [STEPS.open, STEPS.phone, STEPS.buttons, STEPS.google]);
    const last = evs.at(-1);
    assert.equal(last.type, 'report');
    assert.match(last.report.reportId, /^[A-Za-z0-9]{12}$/);
    assert.equal(last.shareUrl, '/check/' + last.report.reportId);
    assert.equal(last.report.host, 'example.co.za');
    assert.ok(last.report.working.some((w) => w.id === 'one_tap'));
    assert.ok(last.report.working.some((w) => w.id === 'secure'));

    const stored = e.AUDITS.store.get('report:' + last.report.reportId);
    assert.equal(stored.opts.expirationTtl, 30 * 24 * 3600);
    assert.equal(e.AUDITS.ttl('cache:example.co.za'), 3600);
    assert.deepEqual(JSON.parse(stored.value), last.report);
    // The fetched HTML is never stored.
    for (const [, v] of e.AUDITS.store) assert.ok(!v.value.includes('secret-page-text'), 'page text leaked into KV');
});

test('with PSI_KEY the speed step runs and the LCP lands in the report', async () => {
    const routes = [...siteRoutes(), [startsWith(PSI_ENDPOINT), () => Response.json({
        lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 3412 } } },
    })]];
    const { evs, f } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env({ PSI_KEY: 'k' }), routes);
    assert.deepEqual(evs.filter((x) => x.type === 'step').map((s) => s.id), ['open', 'phone', 'buttons', 'google', 'speed']);
    const report = evs.at(-1).report;
    const speed = report.worth.find((w) => w.id === 'speed');
    assert.match(speed.text, /3\.4 s/);
    const psiCall = f.calls.find((c) => c.url.startsWith(PSI_ENDPOINT));
    const q = new URL(psiCall.url).searchParams;
    assert.equal(q.get('strategy'), 'mobile');
    assert.equal(q.get('url'), 'https://example.co.za/');
});

test('a PSI failure gives a partial report with the "didn\'t answer in time" note', async () => {
    const routes = [...siteRoutes(), [startsWith(PSI_ENDPOINT), () => new Response('quota', { status: 429 })]];
    const { evs } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env({ PSI_KEY: 'k' }), routes);
    const report = evs.at(-1).report;
    assert.ok(report.notes.some((n) => /Google's speed test didn't answer in time/.test(n)));
    assert.ok(!report.worth.some((w) => w.id === 'speed'));
});

test('without PSI_KEY there is no speed step and Google is never called', async () => {
    const { evs, f } = await audit({ url: 'example.co.za', turnstileToken: 't' });
    assert.ok(!evs.some((x) => x.id === 'speed'));
    assert.ok(!f.calls.some((c) => c.url.includes('googleapis')));
    assert.ok(!evs.at(-1).report.notes.some((n) => /speed test/.test(n)));
});

test('psi: fetchLcp returns seconds to one decimal, or null on timeout, junk or missing LCP', async () => {
    const ok = mockFetch([[() => true, () => Response.json({ lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 2449 } } } })]]);
    assert.equal(await fetchLcp('https://a.com/', { key: 'k', fetch: ok }), 2.4);
    assert.equal(await fetchLcp('https://a.com/', { key: '', fetch: ok }), null);
    const slow = async (u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    assert.equal(await fetchLcp('https://a.com/', { key: 'k', fetch: slow, timeoutMs: 20 }), null);
    assert.equal(await fetchLcp('https://a.com/', { key: 'k', fetch: mockFetch([[() => true, () => Response.json({})]]) }), null);
    assert.equal(await fetchLcp('https://a.com/', { key: 'k', fetch: mockFetch([[() => true, () => new Response('x')]]) }), null);
});

test('a second check of the same home page within the hour comes from the cache', async () => {
    const e = env();
    const first = await audit({ url: 'example.co.za', turnstileToken: 't' }, e);
    const second = await audit({ url: 'https://example.co.za/', turnstileToken: 't' }, e);
    assert.equal(pageFetched(second.f), false);
    const r = second.evs.at(-1);
    assert.equal(r.type, 'report');
    assert.equal(r.cached, true);
    assert.equal(r.report.reportId, first.evs.at(-1).report.reportId);
});

/* ---- Turnstile through the route ---------------------------------------- */

for (const [name, routes, body] of [
    ['success:false', [turnstileFail], { url: 'example.co.za', turnstileToken: 'bad' }],
    ['network error', [[startsWith('https://challenges.cloudflare.com/'), () => { throw new TypeError('fetch failed'); }]], { url: 'example.co.za', turnstileToken: 't' }],
    ['missing token', [], { url: 'example.co.za' }],
]) {
    test(`route: Turnstile ${name} is refused before anything is fetched or counted`, async () => {
        const { res, evs, f, env: e } = await audit(body, env(), routes);
        assert.equal(res.status, 403);
        assert.deepEqual(evs, [{
            type: 'error', code: 'turnstile', status: null,
            message: "Couldn't confirm you're not a bot. Refresh the page and try again.",
        }]);
        assert.equal(pageFetched(f), false);
        assert.equal(e.AUDITS.puts.length, 0);
    });
}

/* ---- Rate limit through the route --------------------------------------- */

test('route: the 6th check within an hour is rate limited with the spec copy', async () => {
    const e = env();
    const hosts = ['a1', 'a2', 'a3', 'a4', 'a5'];
    for (const h of hosts) {
        const routes = [turnstileOk, dohPublic, [() => true, () => htmlResponse(PAGE)]];
        const { evs } = await audit({ url: `https://${h}.co.za/x`, turnstileToken: 't' }, e, routes);
        assert.equal(evs.at(-1).type, 'report', h);
    }
    const { res, evs, f } = await audit({ url: 'example.co.za', turnstileToken: 't' }, e);
    assert.equal(res.status, 429);
    assert.equal(evs[0].code, 'rate');
    assert.match(evs[0].message, /^That's the limit of 5 checks an hour from one connection\. Try again after \d\d:\d\d, or send me the address and I'll check it by hand\.$/);
    assert.ok(evs[0].retryAt);
    assert.equal(pageFetched(f), false);
    for (const key of e.AUDITS.store.keys()) assert.ok(!key.includes(IP), key);
});

/* ---- SSRF through the route --------------------------------------------- */

const blockedInputs = [
    'localhost', '127.0.0.1', '[::1]', 'http://[::1]/', '2130706433', '0x7f000001', '169.254.169.254',
    'http://169.254.169.254/latest/meta-data/', 'ftp://example.com', 'file:///etc/passwd', 'example.com:8080',
    'https://user:pass@example.com/', 'printer.local', 'javascript:alert(1)',
];
for (const input of blockedInputs) {
    test(`route SSRF: ${input} is refused and never fetched`, async () => {
        const { evs, f } = await audit({ url: input, turnstileToken: 't' }, env(), [turnstileOk]);
        const err = evs.at(-1);
        assert.equal(err.type, 'error');
        assert.ok(['blocked', 'invalid'].includes(err.code), err.code);
        assert.equal(f.calls.filter((c) => !c.url.startsWith('https://challenges.cloudflare.com')).length, 0);
    });
}

test('route SSRF: a name that resolves to a private address is blocked after DNS', async () => {
    const { evs, f } = await audit({ url: '10.0.0.1.nip.io', turnstileToken: 't' }, env(), [turnstileOk, dohPrivate]);
    assert.deepEqual([evs.at(-1).code, evs.at(-1).message], ['blocked', 'I can only check public websites.']);
    assert.ok(!f.calls.some((c) => c.url.includes('nip.io') && !c.url.includes('dns-query')));
});

test('route SSRF: a public page that redirects to 127.0.0.1 is blocked on the hop', async () => {
    const routes = [turnstileOk, dohPublic,
        [(u) => u === 'https://example.co.za/', () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })]];
    const { evs, f } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env(), routes);
    assert.equal(evs.at(-1).code, 'blocked');
    assert.ok(!f.calls.some((c) => c.url.includes('127.0.0.1')));
});

/* ---- failure copy ------------------------------------------------------- */

const failCases = [
    ['404', () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }), 'http', 404,
        'example.co.za answered with an error (404), so there was no page to check.'],
    ['403', () => new Response('no', { status: 403 }), 'blocked-by-site', 403,
        "example.co.za blocks automated checks, so I can't read it from here. I can check it by hand."],
    ['pdf', () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }), 'not-html', null,
        "That address isn't a web page (it's a PDF)."],
    ['timeout', () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }, 'timeout', null,
        "example.co.za didn't answer within 15 seconds, so there was nothing to check. A customer on a phone would usually give up sooner."],
];
for (const [name, handler, code, status, message] of failCases) {
    test(`route failure copy: ${name}`, async () => {
        const { evs } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env(), siteRoutes(handler));
        assert.deepEqual(evs.filter((x) => x.type === 'step').map((s) => s.id), ['open']);
        assert.deepEqual(evs.at(-1), { type: 'error', code, message, status });
    });
}

test('route failure copy: DNS with no answer', async () => {
    const routes = [turnstileOk, [startsWith('https://cloudflare-dns.com/'), () => Response.json({ Status: 3 })]];
    const { evs } = await audit({ url: 'no-such-shop.co.za', turnstileToken: 't' }, env(), routes);
    assert.deepEqual(evs.at(-1), { type: 'error', code: 'dns', status: null, message: "I couldn't find a website at no-such-shop.co.za. Check the spelling?" });
});

test('route failure copy: not a web address', async () => {
    const { evs } = await audit({ url: 'not a site', turnstileToken: 't' }, env(), [turnstileOk]);
    assert.equal(evs.at(-1).message, "That doesn't look like a web address. Try something like yourbusiness.co.za.");
});

/* ---- bindings and KV ---------------------------------------------------- */

test('missing bindings return the internal error cleanly', async () => {
    for (const drop of ['AUDITS', 'TURNSTILE_SECRET', 'RL_SALT']) {
        const e = env();
        delete e[drop];
        const { res, evs, f } = await audit({ url: 'example.co.za', turnstileToken: 't' }, e, []);
        assert.equal(res.status, 500, drop);
        assert.equal(evs[0].code, 'internal');
        assert.equal(evs[0].message, 'Something broke on my side. Try again in a minute, or send me the address.');
        assert.equal(f.calls.length, 0);
    }
    // No env object at all (a misconfigured project).
    const noEnv = await captureLogs(() => onRequestPost({ request: req({ url: 'a.com', turnstileToken: 't' }) }));
    assert.equal(noEnv.result.status, 500);
});

test('a KV outage is the internal error, not a crash', async () => {
    const { res, evs } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env({ AUDITS: brokenKV() }), [turnstileOk]);
    assert.equal(res.status, 500);
    assert.equal(evs[0].code, 'internal');
});

test('if only the report write fails, the report still shows without a link', async () => {
    const kv = mockKV();
    const put = kv.put;
    kv.put = async (k, v, o) => { if (k.startsWith('report:')) throw new Error('write limit'); return put(k, v, o); };
    const { evs } = await audit({ url: 'example.co.za', turnstileToken: 't' }, env({ AUDITS: kv }));
    assert.equal(evs.at(-1).type, 'report');
    assert.equal(evs.at(-1).shareUrl, null);
});

/* ---- request shape ------------------------------------------------------ */

test('malformed, oversize or incomplete bodies are HTTP 400/413 JSON', async () => {
    const cases = [
        [req('{not json', { raw: true }), 400],
        [req('[]', { raw: true }), 400],
        [req({ turnstileToken: 't' }), 400],
        [req({ url: 42, turnstileToken: 't' }), 400],
        [req({ url: 'a.com', pad: 'x'.repeat(10000) }), 413],
    ];
    for (const [request, status] of cases) {
        const res = await onRequestPost({ request, env: env() });
        assert.equal(res.status, status);
        assert.match(res.headers.get('content-type'), /application\/json/);
        assert.equal((await res.json()).ok, false);
    }
});

test('other methods are 405', async () => {
    const res = onRequest({ request: req(null, { method: 'GET' }) });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
});

/* ---- logging ------------------------------------------------------------ */

test('logs carry hostname, outcome and a hashed IP, never the URL path, raw IP, token or page text', async () => {
    const { lines } = await audit({ url: 'https://example.co.za/?q=private-query', turnstileToken: 'tok-SECRET-123' },
        env(), [...siteRoutes(), [startsWith('https://example.co.za/?'), () => htmlResponse(PAGE)]]);
    const all = lines.join('\n');
    assert.match(all, /"host":"example.co.za"/);
    assert.match(all, /"outcome":"ok"/);
    assert.match(all, /"ip":"[0-9a-f]{16}"/);
    for (const bad of [IP, 'private-query', 'tok-SECRET-123', 'secret-page-text', 'Blue Pools']) {
        assert.ok(!all.includes(bad), 'log leaked: ' + bad);
    }
});
