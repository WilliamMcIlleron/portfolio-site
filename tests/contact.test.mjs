// Pins the exact behaviour of POST /api/contact (stored record shape, Resend
// call, redirects), so moving its store-then-email block into _lib/enquiry.js
// is provably a refactor and not a change. Written against the original file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequest } from '../functions/api/contact.js';
import { mockKV, brokenKV, mockFetch, startsWith, withFetch, captureLogs } from './_mocks.mjs';

const RESEND = 'https://api.resend.com/emails';

function formReq(fields) {
    const fd = new FormData();
    for (const [k, v] of fields) fd.append(k, v);
    return new Request('https://williammcilleron.com/api/contact', { method: 'POST', body: fd });
}

const baseFields = [
    ['form-name', 'portfolio-contact-form'],
    ['name', 'Thandi'],
    ['email', 'thandi@example.co.za'],
    ['business', 'Blue <Pools>'],
    ['project', 'Website'],
    ['project', 'Google ads'],
    ['message', 'Line one\nLine "two" & more'],
    ['not-a-field', 'dropped'],
];

async function run(fields, env, resendHandler = () => Response.json({ id: 'x' })) {
    const f = mockFetch([[startsWith(RESEND), resendHandler]]);
    const { result: res, lines } = await captureLogs(() => withFetch(f, () => onRequestPost({ request: formReq(fields), env })));
    return { res, f, lines };
}

const fullEnv = (over = {}) => ({ ENQUIRIES: mockKV(), RESEND_API_KEY: 're_key', CONTACT_TO: 'me@example.com', ...over });

test('contact: stores first (pending), emails, then stores the outcome; redirects to /thanks.html', async () => {
    const env = fullEnv();
    const { res, f } = await run(baseFields, env);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), 'https://williammcilleron.com/thanks.html');

    const puts = env.ENQUIRIES.puts;
    assert.equal(puts.length, 2);
    assert.equal(puts[0].key, puts[1].key);
    assert.match(puts[0].key, /^enquiry:\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z-[0-9a-f]{8}$/);
    const first = JSON.parse(puts[0].value);
    const final = JSON.parse(puts[1].value);
    assert.equal(first.email, 'pending');
    assert.deepEqual(Object.keys(final), ['received', 'form', 'data', 'email']);
    assert.equal(final.form, 'portfolio-contact-form');
    assert.equal(final.email, 'sent');
    assert.equal(puts[0].key, 'enquiry:' + final.received + puts[0].key.slice(('enquiry:' + final.received).length));
    assert.deepEqual(final.data, {
        name: 'Thandi',
        email: 'thandi@example.co.za',
        business: 'Blue <Pools>',
        project: 'Website, Google ads',
        message: 'Line one\r\nLine "two" & more',
    });
    assert.equal(puts[0].opts.expirationTtl, undefined, 'enquiries never expire');

    assert.equal(f.calls.length, 1);
    const call = f.calls[0];
    assert.equal(call.init.method, 'POST');
    assert.deepEqual(call.init.headers, { Authorization: 'Bearer re_key', 'Content-Type': 'application/json' });
    const body = JSON.parse(call.init.body);
    assert.deepEqual(Object.keys(body), ['from', 'to', 'subject', 'text', 'html', 'reply_to']);
    assert.equal(body.from, 'Portfolio <onboarding@resend.dev>');
    assert.deepEqual(body.to, ['me@example.com']);
    assert.equal(body.subject, 'Portfolio enquiry \u2014 Thandi (Blue <Pools>)');
    assert.equal(body.reply_to, 'thandi@example.co.za');
    assert.equal(body.text,
        'Name: Thandi\n\nEmail: thandi@example.co.za\n\nBusiness: Blue <Pools>\n\nProject type: Website, Google ads\n\nMessage: Line one\r\nLine "two" & more');
    const label = (l) => '<strong style="display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5d5a51">' + l + '</strong>';
    assert.equal(body.html,
        '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f">' +
        '<h2 style="margin:0 0 20px;font-size:18px">New enquiry from your portfolio</h2>' +
        '<p style="margin:0 0 16px">' + label('Name') + 'Thandi</p>' +
        '<p style="margin:0 0 16px">' + label('Email') + 'thandi@example.co.za</p>' +
        '<p style="margin:0 0 16px">' + label('Business') + 'Blue &lt;Pools&gt;</p>' +
        '<p style="margin:0 0 16px">' + label('Project type') + 'Website, Google ads</p>' +
        '<p style="margin:0 0 16px">' + label('Message') + 'Line one\r<br>Line &quot;two&quot; &amp; more</p>' +
        '</div>');
});

test('contact: CONTACT_FROM is used, and no reply_to without an email', async () => {
    const env = fullEnv({ CONTACT_FROM: 'Site <hi@williammcilleron.com>' });
    const { f } = await run([['form-name', 'solar-enquiry'], ['name', 'Sam'], ['area', 'Pretoria']], env);
    const body = JSON.parse(f.calls[0].init.body);
    assert.equal(body.from, 'Site <hi@williammcilleron.com>');
    assert.equal(body.subject, 'Solar enquiry \u2014 Sam (Pretoria)');
    assert.ok(!('reply_to' in body));
});

test('contact: unknown form name and no name fall back', async () => {
    const { f } = await run([['form-name', 'other'], ['message', 'hi']], fullEnv());
    assert.equal(JSON.parse(f.calls[0].init.body).subject, 'Website enquiry \u2014 Someone');
});

test('contact: Resend rejection is recorded on the stored enquiry', async () => {
    const env = fullEnv();
    await run(baseFields, env, () => new Response('bad from', { status: 422 }));
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).email, 'failed: 422 bad from');
});

test('contact: Resend network failure is recorded on the stored enquiry', async () => {
    const env = fullEnv();
    await run(baseFields, env, () => { throw new Error('socket hang up'); });
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).email, 'failed: socket hang up');
});

test('contact: without RESEND_API_KEY or CONTACT_TO it is stored and marked skipped', async () => {
    let env = fullEnv({ RESEND_API_KEY: undefined });
    let r = await run(baseFields, env);
    assert.equal(r.f.calls.length, 0);
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).email, 'skipped: no RESEND_API_KEY ');
    env = fullEnv({ CONTACT_TO: undefined });
    await run(baseFields, env);
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).email, 'skipped: no CONTACT_TO');
    env = fullEnv({ CONTACT_TO: undefined, RESEND_API_KEY: undefined });
    await run(baseFields, env);
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).email, 'skipped: no RESEND_API_KEY no CONTACT_TO');
});

test('contact: no KV still emails; a broken KV still emails and redirects', async () => {
    const a = await run(baseFields, fullEnv({ ENQUIRIES: undefined }));
    assert.equal(a.res.status, 303);
    assert.equal(a.f.calls.length, 1);
    assert.ok(a.lines.some((l) => l.includes('ENQUIRIES KV is not bound')));
    const b = await run(baseFields, fullEnv({ ENQUIRIES: brokenKV() }));
    assert.equal(b.res.status, 303);
    assert.equal(b.f.calls.length, 1);
});

test('contact: honeypot and empty submissions redirect without storing or sending', async () => {
    const env = fullEnv();
    const a = await run([...baseFields, ['company', 'Spam Inc']], env);
    assert.equal(a.res.status, 303);
    const b = await run([['form-name', 'x'], ['not-a-field', 'y']], env);
    assert.equal(b.res.status, 303);
    assert.equal(env.ENQUIRIES.puts.length, 0);
    assert.equal(a.f.calls.length + b.f.calls.length, 0);
});

test('contact: fields are capped at 5000 characters', async () => {
    const env = fullEnv();
    await run([['name', 'x'.repeat(6000)]], env);
    assert.equal(JSON.parse(env.ENQUIRIES.puts[1].value).data.name.length, 5000);
});

test('contact: a non-form body is 400 and other methods are 405', async () => {
    const res = await onRequestPost({ request: new Request('https://x.test/api/contact', { method: 'POST', body: 'x', headers: { 'content-type': 'application/json' } }), env: {} });
    assert.equal(res.status, 400);
    assert.equal(onRequest().status, 405);
});
