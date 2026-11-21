import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestGet, onRequest } from '../functions/api/check/[id].js';
import { mockKV, brokenKV, captureLogs } from './_mocks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ID = 'AbC123xyZ789';
const REPORT = { host: 'bluepools.co.za', reportId: ID, working: [], worth: [] };
const get = (id, env) => onRequestGet({ params: { id }, env, request: new Request('https://x.test/api/check/' + id) });

test('check: a stored report comes back as JSON, uncached and unindexed', async () => {
    const res = await get(ID, { AUDITS: mockKV({ ['report:' + ID]: JSON.stringify(REPORT) }) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), REPORT);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    assert.match(res.headers.get('content-type'), /application\/json/);
});

test('check: unknown, expired or malformed ids are 404 JSON with the same headers', async () => {
    const env = { AUDITS: mockKV({ 'cache:bluepools.co.za': JSON.stringify(REPORT) }) };
    for (const id of ['ZZZZZZZZZZZZ', 'short', '../../cache:x', 'AbC123xyZ789X', undefined, ['a']]) {
        const res = await get(id, env);
        assert.equal(res.status, 404, String(id));
        assert.equal((await res.json()).ok, false);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-robots-tag'), 'noindex');
    }
});

test('check: missing KV is a clean 500; a broken KV is a 404, not a crash', async () => {
    const a = await captureLogs(() => get(ID, {}));
    assert.equal(a.result.status, 500);
    const b = await get(ID, { AUDITS: brokenKV() });
    assert.equal(b.status, 404);
});

test('check: other methods are 405', () => {
    const res = onRequest();
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
});

/* ---- routing hygiene ---------------------------------------------------- */

test('_redirects has no /check rewrite (functions/check/[id].js serves the page) and keeps tests, functions and backend docs 404', () => {
    const rules = readFileSync(join(ROOT, '_redirects'), 'utf8')
        .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split(/\s+/));
    const has = (from, to, status) => rules.some(([f, t, s]) => f === from && t === to && s === status);
    assert.ok(!rules.some(([f]) => f === '/check/*'), 'a /check/* rewrite 404ed in production; the Function serves it');
    assert.ok(has('/tests/*', '/404.html', '404'));
    assert.ok(has('/functions/*', '/404.html', '404'));
    assert.ok(has('/AUDIT-BACKEND.md', '/404.html', '404'));
});

function walk(dir) {
    return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

test('helper modules in functions/_lib never export a route handler', () => {
    for (const file of walk(join(ROOT, 'functions', '_lib'))) {
        const src = readFileSync(file, 'utf8');
        assert.ok(!/export\s+(async\s+)?function\s+onRequest|export\s+(const|let)\s+onRequest/.test(src), file);
    }
});

test('functions/ uses no Node-only modules', () => {
    for (const file of walk(join(ROOT, 'functions'))) {
        const src = readFileSync(file, 'utf8');
        assert.ok(!/from\s+['"](node:|fs|path|crypto|http|https|child_process|os)['"/]/.test(src), file);
        assert.ok(!/\brequire\s*\(/.test(src), file);
    }
});
