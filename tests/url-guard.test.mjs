import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, isPrivateIPv4, isPrivateIPv6, resolvePublic, checkTarget } from '../functions/_lib/url-guard.js';

/* ---- shape rules: the security list from the spec --------------------- */

const BLOCKED = [
    'localhost', 'http://localhost', '127.0.0.1', 'http://127.0.0.1/', '[::1]', 'http://[::1]/', '2130706433', '0x7f000001',
    '0x7f.1', '017700000001', '169.254.169.254', 'http://169.254.169.254/latest/meta-data', '10.0.0.1', '192.168.1.1',
    'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://example.com',
    'example.com:8080', 'https://example.com:8443/', 'user:pass@example.com', 'https://user@example.com',
    'printer.local', 'db.internal', 'foo.localhost', '1.0.0.127.in-addr.arpa',
];
for (const input of BLOCKED) {
    test(`blocks ${input}`, () => {
        const r = normalizeInput(input);
        assert.equal(r.ok, false);
        assert.ok(r.reason === 'blocked' || r.reason === 'invalid', `reason ${r.reason}`);
    });
}

test('treats these as invalid, not as attacks', () => {
    for (const s of ['', '   ', 'yourbusiness', 'my site.com', 'a'.repeat(400), 'example.123', null, undefined, 42]) {
        const r = normalizeInput(s);
        assert.equal(r.ok, false, String(s));
        assert.equal(r.reason, 'invalid', String(s));
    }
});

test('accepts ordinary public names and prepends https', () => {
    assert.deepEqual(normalizeInput('example.com'), { ok: true, url: 'https://example.com/', host: 'example.com' });
    const r = normalizeInput('  EXAMPLE.co.za/menu?x=1#top ');
    assert.equal(r.ok, true);
    assert.equal(r.host, 'example.co.za');
    assert.equal(r.url, 'https://example.co.za/menu?x=1');
    assert.equal(normalizeInput('http://example.com').url, 'http://example.com/');
    assert.equal(normalizeInput('example.com:443').ok, true);
    assert.equal(normalizeInput('www.example.com.').host, 'www.example.com');
});

/* ---- address ranges ---------------------------------------------------- */

test('private IPv4 ranges', () => {
    for (const ip of [
        '0.0.0.0', '0.1.2.3', '10.0.0.1', '10.255.255.255', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254',
        '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.168.0.1', '198.18.0.1', '198.19.255.255', '224.0.0.1', '240.0.0.1', '255.255.255.255',
        '192.0.2.5', '198.51.100.9', '203.0.113.9',
    ]) assert.equal(isPrivateIPv4(ip), true, ip);
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.1.1', '41.0.0.1', '196.25.1.1'])
        assert.equal(isPrivateIPv4(ip), false, ip);
    assert.equal(isPrivateIPv4('not an ip'), true);
    assert.equal(isPrivateIPv4('1.2.3'), true);
    assert.equal(isPrivateIPv4('300.1.1.1'), true);
});

test('private IPv6 ranges, including mapped and embedded IPv4', () => {
    for (const ip of [
        '::', '::1', 'fc00::1', 'fd12:3456:789a::1', 'fe80::1', 'febf::1', 'ff02::1', '2001:db8::1',
        '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '2002:7f00:1::1', '::127.0.0.1', '[::1]',
    ]) assert.equal(isPrivateIPv6(ip), true, ip);
    for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'])
        assert.equal(isPrivateIPv6(ip), false, ip);
    assert.equal(isPrivateIPv6('garbage'), true);
});

/* ---- DNS, with DoH mocked ---------------------------------------------- */

function doh(map) {
    return async (url) => {
        const u = new URL(url);
        const name = u.searchParams.get('name');
        const type = u.searchParams.get('type');
        const entry = map[name];
        if (entry === 'error') throw new TypeError('network down');
        if (!entry) return Response.json({ Status: 3 });
        const answers = (entry[type] ?? []).map((data) => ({ type: type === 'A' ? 1 : 28, data }));
        return Response.json({ Status: 0, Answer: answers });
    };
}

test('public answers pass', async () => {
    const f = doh({ 'example.com': { A: ['93.184.216.34'], AAAA: ['2606:2800:220:1:248:1893:25c8:1946'] } });
    const r = await resolvePublic('example.com', f);
    assert.equal(r.ok, true);
});

test('one private answer among public ones blocks the host', async () => {
    const f = doh({ 'mixed.example': { A: ['93.184.216.34', '10.0.0.1'] } });
    assert.deepEqual(await resolvePublic('mixed.example', f), { ok: false, reason: 'blocked' });
});

test('a name that resolves to a private address (nip.io style) is blocked', async () => {
    const f = doh({ '10.0.0.1.nip.io': { A: ['10.0.0.1'] }, '127.0.0.1.nip.io': { A: ['127.0.0.1'] } });
    assert.equal((await checkTarget('http://10.0.0.1.nip.io', { fetch: f })).reason, 'blocked');
    assert.equal((await checkTarget('127.0.0.1.nip.io', { fetch: f })).reason, 'blocked');
});

test('private IPv6 answer blocks', async () => {
    const f = doh({ 'v6.example': { A: ['93.184.216.34'], AAAA: ['fd00::1'] } });
    assert.equal((await resolvePublic('v6.example', f)).reason, 'blocked');
});

test('unknown name and DoH failure both read as dns', async () => {
    assert.equal((await resolvePublic('nope.example', doh({}))).reason, 'dns');
    assert.equal((await resolvePublic('down.example', doh({ 'down.example': 'error' }))).reason, 'dns');
    assert.equal((await resolvePublic('empty.example', doh({ 'empty.example': { A: [], AAAA: [] } }))).reason, 'dns');
});

test('checkTarget rejects on shape before any DNS call', async () => {
    let calls = 0;
    const f = async () => { calls++; return Response.json({ Status: 3 }); };
    const r = await checkTarget('http://127.0.0.1', { fetch: f });
    assert.equal(r.ok, false);
    assert.equal(calls, 0);
});
