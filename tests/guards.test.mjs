import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile, SITEVERIFY } from '../functions/_lib/turnstile.js';
import {
    checkRateLimit, ipHash, newReportId, storeReport, getCachedReport, loadReport,
    HOUR_LIMIT, DAY_LIMIT, CACHE_TTL, REPORT_TTL,
} from '../functions/_lib/ratelimit.js';
import { readJsonBody } from '../functions/_lib/http.js';
import { mockKV, mockFetch, startsWith } from './_mocks.mjs';

/* ---- Turnstile ---------------------------------------------------------- */

test('turnstile: success posts secret, token and remoteip to siteverify', async () => {
    const f = mockFetch([[startsWith(SITEVERIFY), () => Response.json({ success: true })]]);
    const r = await verifyTurnstile({ secret: 's3cret', token: 'tok', ip: '1.2.3.4', fetch: f });
    assert.equal(r.ok, true);
    const body = f.calls[0].init.body;
    assert.equal(f.calls[0].init.method, 'POST');
    assert.equal(body.get('secret'), 's3cret');
    assert.equal(body.get('response'), 'tok');
    assert.equal(body.get('remoteip'), '1.2.3.4');
});

test('turnstile fails closed: success:false', async () => {
    const f = mockFetch([[startsWith(SITEVERIFY), () => Response.json({ success: false, 'error-codes': ['timeout-or-duplicate'] })]]);
    const r = await verifyTurnstile({ secret: 's', token: 't', fetch: f });
    assert.deepEqual(r, { ok: false, codes: ['timeout-or-duplicate'] });
});

test('turnstile fails closed: network error', async () => {
    const f = async () => { throw new TypeError('fetch failed'); };
    const r = await verifyTurnstile({ secret: 's', token: 't', fetch: f });
    assert.equal(r.ok, false);
    assert.deepEqual(r.codes, ['network-error']);
});

test('turnstile fails closed: missing or oversized token never calls siteverify', async () => {
    const f = mockFetch([]);
    for (const token of [undefined, '', null, 42, 'x'.repeat(5000)]) {
        const r = await verifyTurnstile({ secret: 's', token, fetch: f });
        assert.equal(r.ok, false);
    }
    assert.equal(f.calls.length, 0);
});

test('turnstile fails closed: missing secret, non-200, junk JSON, truthy-but-not-true success', async () => {
    assert.equal((await verifyTurnstile({ secret: '', token: 't', fetch: mockFetch([]) })).ok, false);
    const cases = [
        () => new Response('oops', { status: 500 }),
        () => new Response('not json', { status: 200 }),
        () => Response.json({ success: 'true' }),
        () => Response.json(null),
    ];
    for (const handler of cases) {
        const r = await verifyTurnstile({ secret: 's', token: 't', fetch: mockFetch([[() => true, handler]]) });
        assert.equal(r.ok, false);
    }
});

/* ---- Rate limit --------------------------------------------------------- */

const at = new Date('2026-11-19T10:15:00Z');

test('rate limit: 5 per hour pass, the 6th within the hour is refused', async () => {
    const kv = mockKV();
    for (let i = 0; i < HOUR_LIMIT; i++) {
        const r = await checkRateLimit({ kv, ip: '203.0.113.9', salt: 'salt', now: at });
        assert.equal(r.ok, true, 'request ' + (i + 1));
    }
    const sixth = await checkRateLimit({ kv, ip: '203.0.113.9', salt: 'salt', now: new Date('2026-11-19T10:59:00Z') });
    assert.equal(sixth.ok, false);
    assert.equal(sixth.scope, 'hour');
    assert.equal(sixth.retryAt, '2026-11-19T11:00:00.000Z');
    // A different connection is unaffected.
    assert.equal((await checkRateLimit({ kv, ip: '198.51.100.1', salt: 'salt', now: at })).ok, true);
    // The next hour opens again.
    assert.equal((await checkRateLimit({ kv, ip: '203.0.113.9', salt: 'salt', now: new Date('2026-11-19T11:01:00Z') })).ok, true);
});

test('rate limit: 20 per day across hours', async () => {
    const kv = mockKV();
    for (let i = 0; i < DAY_LIMIT; i++) {
        const now = new Date(Date.UTC(2026, 10, 19, Math.floor(i / HOUR_LIMIT), i));
        assert.equal((await checkRateLimit({ kv, ip: '1.1.1.1', salt: 's', now })).ok, true);
    }
    const r = await checkRateLimit({ kv, ip: '1.1.1.1', salt: 's', now: new Date('2026-11-19T20:00:00Z') });
    assert.equal(r.ok, false);
    assert.equal(r.scope, 'day');
    assert.equal(r.retryAt, '2026-11-20T00:00:00.000Z');
});

test('rate limit keys never contain the raw IP, and carry the right TTLs', async () => {
    const kv = mockKV();
    const ip = '203.0.113.77';
    await checkRateLimit({ kv, ip, salt: 'pepper', now: at });
    const hash = await ipHash(ip, 'pepper');
    assert.match(hash, /^[0-9a-f]{16}$/);
    const keys = kv.puts.map((p) => p.key);
    assert.deepEqual(keys.sort(), [`rl:${hash}:2026111910`, `rl:${hash}:20261119`].sort());
    for (const k of keys) {
        assert.ok(!k.includes(ip), k);
        assert.ok(!k.includes('203.0.113'), k);
    }
    assert.equal(kv.ttl(`rl:${hash}:2026111910`), 7200);
    assert.equal(kv.ttl(`rl:${hash}:20261119`), 93600);
});

test('the salt changes the hash, so keys cannot be reversed with a public rainbow table', async () => {
    assert.notEqual(await ipHash('1.2.3.4', 'a'), await ipHash('1.2.3.4', 'b'));
});

test('a refused request does not add to the counter', async () => {
    const kv = mockKV();
    for (let i = 0; i < HOUR_LIMIT + 3; i++) await checkRateLimit({ kv, ip: '9.9.9.9', salt: 's', now: at });
    const hash = await ipHash('9.9.9.9', 's');
    assert.equal(await kv.get(`rl:${hash}:2026111910`), String(HOUR_LIMIT));
});

/* ---- Report storage ----------------------------------------------------- */

test('report ids are 12 base62 characters and do not repeat', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
        const id = newReportId();
        assert.match(id, /^[A-Za-z0-9]{12}$/);
        seen.add(id);
    }
    assert.equal(seen.size, 2000);
});

test('storeReport writes the 30-day report and the 1-hour host cache', async () => {
    const kv = mockKV();
    const report = { host: 'example.co.za', reportId: 'abcDEF123456', working: [], worth: [] };
    await storeReport(kv, 'example.co.za', report);
    assert.equal(kv.ttl('report:abcDEF123456'), REPORT_TTL);
    assert.equal(kv.ttl('cache:example.co.za'), CACHE_TTL);
    assert.deepEqual(await getCachedReport(kv, 'example.co.za'), report);
    assert.deepEqual(await loadReport(kv, 'abcDEF123456'), report);
});

test('loadReport refuses malformed ids without touching KV', async () => {
    let touched = false;
    const kv = { get: async () => { touched = true; return null; } };
    for (const id of ['short', 'abc/../12345', 'abcdefghijklm', '', null, 'abcdefghijk!']) {
        assert.equal(await loadReport(kv, id), null);
    }
    assert.equal(touched, false);
});

/* ---- Body reader -------------------------------------------------------- */

const req = (body, headers = {}) => new Request('https://x.test/api', { method: 'POST', body, headers });

test('readJsonBody accepts a small JSON object', async () => {
    const r = await readJsonBody(req('{"url":"a.com"}'), 1024);
    assert.deepEqual(r, { ok: true, data: { url: 'a.com' } });
});

test('readJsonBody rejects malformed JSON, arrays, primitives and empty bodies', async () => {
    for (const body of ['{nope', '[1,2]', '"str"', '42', 'null', '']) {
        const r = await readJsonBody(req(body), 1024);
        assert.deepEqual(r, { ok: false, error: 'malformed' }, JSON.stringify(body));
    }
});

test('readJsonBody rejects oversize bodies, even when Content-Length is missing', async () => {
    const big = JSON.stringify({ url: 'x'.repeat(5000) });
    assert.deepEqual(await readJsonBody(req(big), 1024), { ok: false, error: 'too-large' });
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const r = new Request('https://x.test/api', { method: 'POST', body: stream, duplex: 'half' });
    assert.deepEqual(await readJsonBody(r, 1024), { ok: false, error: 'too-large' });
});
