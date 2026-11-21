import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/check/[id].js';

const PAGE = '<!doctype html><title>Site check report</title>';
const assets = (calls = [], handler) => ({
    async fetch(u) {
        calls.push(String(u));
        return handler ? handler(u) : new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
});
const ctx = (id, env) => ({ request: new Request('https://williammcilleron.com/check/' + id), params: { id }, env });

test('a valid id serves the static report page, noindex and never cached', async () => {
    const calls = [];
    const res = await onRequestGet(ctx('abcdefghijkl', { ASSETS: assets(calls) }));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), PAGE);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.deepEqual(calls, ['https://williammcilleron.com/check/']);
});

test('ids that are not 12 base62 characters are a 404 and never reach the asset host', async () => {
    for (const id of ['', 'short', 'abcdefghijklm', 'abcdefghijk!', '../etc/passwd', 'abcdefgh ijk', undefined, 42]) {
        const calls = [];
        const res = await onRequestGet(ctx(id, { ASSETS: assets(calls) }));
        assert.equal(res.status, 404, String(id));
        assert.equal(calls.length, 0);
    }
});

test('a redirect from the asset host is followed once', async () => {
    let n = 0;
    const res = await onRequestGet(ctx('abcdefghijkl', { ASSETS: assets([], (u) => (++n === 1
        ? new Response(null, { status: 308, headers: { location: '/check/' } })
        : new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } })) ) }));
    assert.equal(res.status, 200);
    assert.equal(n, 2);
});

test('a missing ASSETS binding is a clean 500', async () => {
    const res = await onRequestGet(ctx('abcdefghijkl', {}));
    assert.equal(res.status, 500);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

test('the function exports no handlers that would shadow other routes', async () => {
    const mod = await import('../functions/check/[id].js');
    assert.deepEqual(Object.keys(mod).sort(), ['onRequestGet']);
});

test('the page always has an html content type, even if the asset host omits it', async () => {
    const res = await onRequestGet(ctx('abcdefghijkl', { ASSETS: assets([], () => new Response(PAGE, { status: 200 })) }));
    assert.match(res.headers.get('content-type'), /text\/html/);
});
