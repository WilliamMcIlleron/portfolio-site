import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPage, httpRedirectsToHttps, MAX_BYTES, UA } from '../functions/_lib/fetch-page.js';

const okGuard = async (u) => {
    const url = new URL(/^[a-z]+:\/\//i.test(u) ? u : 'https://' + u);
    return { ok: true, url: url.toString(), host: url.hostname };
};
const html = (body = '<title>Hi</title>') => new Response(`<!doctype html><html><head>${body}</head><body>ok</body></html>`, {
    status: 200, headers: { 'content-type': 'text/html; charset=utf-8' },
});
const redirect = (to, status = 302) => new Response(null, { status, headers: { location: to } });

test('fetches a page and sends the honest user agent', async () => {
    let seen;
    const f = async (url, init) => { seen = init; return html(); };
    const r = await fetchPage('example.com', { fetch: f, guard: okGuard });
    assert.equal(r.ok, true);
    assert.equal(r.host, 'example.com');
    assert.match(r.html, /<title>Hi<\/title>/);
    assert.equal(seen.redirect, 'manual');
    assert.equal(seen.headers['user-agent'], UA);
    assert.ok(seen.signal);
});

test('follows up to 3 redirects and re-validates every hop', async () => {
    const guarded = [];
    const guard = async (u) => { guarded.push(u); return okGuard(u); };
    const chain = { 'https://a.com/': 'https://b.com/', 'https://b.com/': 'https://c.com/x', 'https://c.com/x': 'https://d.com/' };
    const f = async (u) => (chain[u] ? redirect(chain[u], 301) : html());
    const r = await fetchPage('a.com', { fetch: f, guard });
    assert.equal(r.ok, true);
    assert.equal(r.finalUrl, 'https://d.com/');
    assert.equal(guarded.length, 4);
    assert.equal(r.hops.length, 3);
});

test('a 4-hop redirect chain is refused', async () => {
    const f = async (u) => redirect(`https://h${Math.random().toString(36).slice(2, 6)}.com/`);
    const r = await fetchPage('a.com', { fetch: f, guard: okGuard });
    assert.deepEqual([r.ok, r.reason], [false, 'redirects']);
});

test('a public URL that 302s to http://127.0.0.1 is blocked by the guard on the hop', async () => {
    const doh = (url) => Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] });
    const f = async (url) => {
        if (String(url).startsWith('https://cloudflare-dns.com')) return doh(url);
        if (String(url) === 'https://evil.example/') return redirect('http://127.0.0.1/admin');
        throw new Error('must not fetch ' + url);
    };
    const r = await fetchPage('evil.example', { fetch: f });
    assert.deepEqual([r.ok, r.reason], [false, 'blocked']);
});

test('a redirect to a non-http scheme is blocked', async () => {
    const f = async (u) => (u === 'https://a.com/' ? redirect('file:///etc/passwd') : html());
    const guard = async (u) => {
        if (!/^https?:/.test(u)) return { ok: false, reason: 'blocked' };
        return okGuard(u);
    };
    const r = await fetchPage('a.com', { fetch: f, guard });
    assert.equal(r.reason, 'blocked');
});

test('a redirect with no Location is an http error', async () => {
    const f = async () => new Response(null, { status: 302 });
    const r = await fetchPage('a.com', { fetch: f, guard: okGuard });
    assert.deepEqual([r.ok, r.reason, r.status], [false, 'http', 302]);
});

test('a 50 MB response is cut at the cap and flagged', async () => {
    let sent = 0;
    const chunk = new Uint8Array(1024 * 1024).fill(97);
    const stream = new ReadableStream({
        pull(c) { if (sent >= 50) { c.close(); return; } sent++; c.enqueue(chunk); },
    });
    const f = async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } });
    const r = await fetchPage('big.com', { fetch: f, guard: okGuard });
    assert.equal(r.ok, true);
    assert.equal(r.truncated, true);
    assert.equal(r.bytes, MAX_BYTES);
    assert.ok(r.html.length <= MAX_BYTES);
    assert.ok(sent <= 3, `read only ${sent} MB of the stream`);
});

test('a server that trickles then stalls times out', async () => {
    const f = async (u, init) => {
        const stream = new ReadableStream({
            start(c) {
                init.signal.addEventListener('abort', () => c.error(init.signal.reason));
            },
        });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const r = await fetchPage('slow.com', { fetch: f, guard: okGuard, perRequestMs: 150, totalMs: 400 });
    assert.deepEqual([r.ok, r.reason], [false, 'timeout']);
});

test('a trickle that has delivered some HTML is audited as partial', async () => {
    const enc = new TextEncoder();
    const f = async (u, init) => {
        let sent = false;
        const stream = new ReadableStream({
            pull(c) {
                if (!sent) { sent = true; c.enqueue(enc.encode('<html><head><title>Partial</title>')); return; }
                return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
            },
        });
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const r = await fetchPage('slow.com', { fetch: f, guard: okGuard, perRequestMs: 150, totalMs: 400 });
    assert.equal(r.ok, true);
    assert.equal(r.partial, true);
    assert.match(r.html, /Partial/);
});

test('a fetch that never answers is a timeout', async () => {
    const f = (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
    const r = await fetchPage('hang.com', { fetch: f, guard: okGuard, perRequestMs: 100, totalMs: 300 });
    assert.deepEqual([r.ok, r.reason], [false, 'timeout']);
});

test('network failure reads as unreachable', async () => {
    const f = async () => { throw new TypeError('connect ECONNREFUSED'); };
    const r = await fetchPage('down.com', { fetch: f, guard: okGuard });
    assert.deepEqual([r.ok, r.reason], [false, 'unreachable']);
});

test('a PDF is not a web page', async () => {
    const f = async () => new Response('%PDF-1.7', { status: 200, headers: { 'content-type': 'application/pdf' } });
    const r = await fetchPage('files.com/menu.pdf', { fetch: f, guard: okGuard });
    assert.deepEqual([r.ok, r.reason, r.type], [false, 'not-html', 'application/pdf']);
});

test('no content type counts as not HTML', async () => {
    const f = async () => new Response('x', { status: 200 });
    const r = await fetchPage('a.com', { fetch: f, guard: okGuard });
    assert.equal(r.reason, 'not-html');
});

test('403, 429, 503 and a Cloudflare challenge read as blocked-by-site and are never retried', async () => {
    for (const [status, headers] of [[403, {}], [429, {}], [503, {}], [200, { 'cf-mitigated': 'challenge', 'content-type': 'text/html' }]]) {
        let calls = 0;
        const f = async () => { calls++; return new Response('Just a moment...', { status, headers }); };
        const r = await fetchPage('shield.com', { fetch: f, guard: okGuard });
        assert.equal(r.reason, 'blocked-by-site', String(status));
        assert.equal(calls, 1);
    }
});

test('404 and 500 read as http errors with the status', async () => {
    for (const status of [404, 410, 500, 502]) {
        const f = async () => new Response('x', { status, headers: { 'content-type': 'text/html' } });
        const r = await fetchPage('a.com', { fetch: f, guard: okGuard });
        assert.deepEqual([r.ok, r.reason, r.status], [false, 'http', status]);
    }
});

test('guard refusal on the first URL stops everything', async () => {
    let calls = 0;
    const f = async () => { calls++; return html(); };
    const r = await fetchPage('127.0.0.1', { fetch: f, guard: async () => ({ ok: false, reason: 'blocked' }) });
    assert.deepEqual([r.ok, r.reason], [false, 'blocked']);
    assert.equal(calls, 0);
});

/* ---- http -> https ----------------------------------------------------- */

test('http redirects to https: true, false and not testable', async () => {
    assert.equal(await httpRedirectsToHttps('a.com', { fetch: async () => redirect('https://a.com/', 301), guard: okGuard }), true);
    assert.equal(await httpRedirectsToHttps('a.com', { fetch: async () => html(), guard: okGuard }), false);
    assert.equal(await httpRedirectsToHttps('a.com', { fetch: async () => redirect('http://a.com/x', 301), guard: okGuard }), false);
    assert.equal(await httpRedirectsToHttps('a.com', { fetch: async () => { throw new Error('x'); }, guard: okGuard }), null);
    assert.equal(await httpRedirectsToHttps('a.com', { fetch: async () => html(), guard: async () => ({ ok: false, reason: 'blocked' }) }), null);
});
