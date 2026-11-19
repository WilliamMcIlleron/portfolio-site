import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequest } from '../functions/api/audit-lead.js';
import { storeThenEmail, escapeHtml } from '../functions/_lib/enquiry.js';
import { mockKV, mockFetch, startsWith, turnstileOk, turnstileFail, withFetch, captureLogs } from './_mocks.mjs';

const RESEND = 'https://api.resend.com/emails';
const ID = 'AbC123xyZ789';
const REPORT = {
    host: 'bluepools.co.za',
    checkedAt: '2026-11-19T10:00:00.000Z',
    checkedLabel: '19 Nov 2026, 12:00 (Johannesburg)',
    working: [{ id: 'secure', text: 'x' }, { id: 'phone_fit', text: 'y' }],
    worth: [{ id: 'booking', text: 'z' }],
    unclear: [],
    notes: [],
    cantSee: '...',
    reportId: ID,
};

const env = (over = {}) => ({
    AUDITS: mockKV({ ['report:' + ID]: JSON.stringify(REPORT) }),
    ENQUIRIES: mockKV(),
    TURNSTILE_SECRET: 's',
    RESEND_API_KEY: 're_key',
    CONTACT_TO: 'me@example.com',
    ...over,
});

const good = (over = {}) => ({
    business: 'Blue <b>Pools</b>',
    email: 'owner@bluepools.co.za',
    whatsapp: '082 123 4567',
    reportId: ID,
    turnstileToken: 'tok',
    ...over,
});

function req(body, raw = false) {
    return new Request('https://williammcilleron.com/api/audit-lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
        body: raw ? body : JSON.stringify(body),
    });
}

async function lead(body, e = env(), routes = [turnstileOk, [startsWith(RESEND), () => Response.json({ id: '1' })]], raw = false) {
    const f = mockFetch(routes);
    const { result, lines } = await captureLogs(() => withFetch(f, async () => {
        const res = await onRequestPost({ request: req(body, raw), env: e });
        return { res, out: await res.json() };
    }));
    return { ...result, f, lines, env: e };
}

test('a valid lead is stored with host and summary only, then emailed with reply_to', async () => {
    const { res, out, f, env: e } = await lead(good());
    assert.equal(res.status, 200);
    assert.deepEqual(out, { ok: true });

    const final = JSON.parse(e.ENQUIRIES.puts.at(-1).value);
    assert.deepEqual(Object.keys(final), ['received', 'form', 'data', 'host', 'reportId', 'summary', 'email']);
    assert.equal(final.form, 'audit-lead');
    assert.deepEqual(final.data, { business: 'Blue <b>Pools</b>', email: 'owner@bluepools.co.za', whatsapp: '082 123 4567' });
    assert.equal(final.host, 'bluepools.co.za');
    assert.deepEqual(final.summary, {
        host: 'bluepools.co.za', checkedAt: REPORT.checkedAt,
        working: ['secure', 'phone_fit'], worth: ['booking'], unclear: [],
    });
    assert.equal(final.email, 'sent');
    assert.equal(JSON.parse(e.ENQUIRIES.puts[0].value).email, 'pending', 'stored before the email');

    const mail = JSON.parse(f.calls.find((c) => c.url === RESEND).init.body);
    assert.equal(mail.subject, 'Audit lead: Blue <b>Pools</b> (bluepools.co.za)');
    assert.equal(mail.reply_to, 'owner@bluepools.co.za');
    assert.ok(mail.html.includes('Blue &lt;b&gt;Pools&lt;/b&gt;'), 'echoed text is escaped');
    assert.ok(!mail.html.includes('<b>Pools'), 'no raw HTML from the visitor');
    assert.ok(mail.html.includes('https://williammcilleron.com/check/' + ID));
    assert.ok(mail.text.includes('Worth fixing: booking'));
});

test('a lead with a fabricated reportId is refused and nothing is stored or sent', async () => {
    for (const reportId of ['ZZZZZZZZZZZZ', 'AbC123xyZ780']) {
        const { res, out, f, env: e } = await lead(good({ reportId }));
        assert.equal(res.status, 404);
        assert.deepEqual(out, { ok: false, message: 'That report has expired or was never made. Run the check again, then send this form.' });
        assert.equal(e.ENQUIRIES.puts.length, 0);
        assert.ok(!f.calls.some((c) => c.url === RESEND));
    }
});

test('a lead cannot inject its own report: extra fields in the body are ignored', async () => {
    const { env: e, f } = await lead(good({ host: 'evil.example', summary: { worth: ['fake'] }, report: { host: 'evil.example' } }));
    const final = JSON.parse(e.ENQUIRIES.puts.at(-1).value);
    assert.equal(final.host, 'bluepools.co.za');
    assert.deepEqual(final.summary.worth, ['booking']);
    assert.ok(!JSON.stringify(final).includes('evil.example'));
    assert.ok(!f.calls.find((c) => c.url === RESEND).init.body.includes('evil.example'));
});

test('malformed report ids never reach KV', async () => {
    for (const reportId of ['../secret', 'short', 'x'.repeat(13), 42, undefined]) {
        const e = env();
        let read = false;
        const get = e.AUDITS.get;
        e.AUDITS.get = async (k) => { read = true; return get(k); };
        const { res } = await lead(good({ reportId }), e);
        assert.equal(res.status, 400);
        assert.equal(read, false);
    }
});

test('field validation: business and email required, lengths capped, WhatsApp optional but sane', async () => {
    const cases = [
        [{ business: '' }, "Add your business name."],
        [{ business: 'x'.repeat(121) }, 'Add your business name.'],
        [{ business: 42 }, 'Add your business name.'],
        [{ email: 'not-an-email' }, "That email address doesn't look right."],
        [{ email: 'a@b.c' }, "That email address doesn't look right."],
        [{ email: 'x'.repeat(250) + '@a.com' }, "That email address doesn't look right."],
        [{ email: 'a@b.com\r\nBcc: x@y.com' }, "That email address doesn't look right."],
        [{ whatsapp: 'call me maybe' }, "That WhatsApp number doesn't look right. Digits only, like 082 123 4567."],
    ];
    for (const [over, message] of cases) {
        const { res, out, f } = await lead(good(over));
        assert.equal(res.status, 400, JSON.stringify(over));
        assert.deepEqual(out, { ok: false, message });
        assert.equal(f.calls.length, 0, 'Turnstile is not spent on a bad form');
    }
    const ok = await lead(good({ whatsapp: undefined }));
    assert.equal(ok.out.ok, true);
    assert.ok(!('whatsapp' in JSON.parse(ok.env.ENQUIRIES.puts.at(-1).value).data));
});

test('control characters are stripped from the subject line', async () => {
    const { f } = await lead(good({ business: 'Blue\r\nBcc: x@y.com Pools' }));
    const mail = JSON.parse(f.calls.find((c) => c.url === RESEND).init.body);
    assert.ok(!/[\r\n]/.test(mail.subject));
});

for (const [name, routes, over] of [
    ['success:false', [turnstileFail], {}],
    ['network error', [[startsWith('https://challenges.cloudflare.com/'), () => { throw new Error('down'); }]], {}],
    ['missing token', [], { turnstileToken: undefined }],
]) {
    test(`lead: Turnstile ${name} is refused before any read or write`, async () => {
        const { res, out, env: e } = await lead(good(over), env(), routes);
        assert.equal(res.status, 403);
        assert.equal(out.message, "Couldn't confirm you're not a bot. Refresh the page and try again.");
        assert.equal(e.ENQUIRIES.puts.length, 0);
    });
}

test('lead: missing bindings are a clean internal error', async () => {
    for (const over of [{ AUDITS: undefined }, { TURNSTILE_SECRET: undefined }, { ENQUIRIES: undefined, RESEND_API_KEY: undefined }]) {
        const { res, out, f } = await lead(good(), env(over), []);
        assert.equal(res.status, 500);
        assert.deepEqual(out, { ok: false, message: 'Something broke on my side. Try again in a minute.' });
        assert.equal(f.calls.length, 0);
    }
    // Without ENQUIRIES but with Resend, the lead is still emailed.
    const { out } = await lead(good(), env({ ENQUIRIES: undefined }));
    assert.equal(out.ok, true);
});

test('lead: malformed or oversize bodies are rejected', async () => {
    assert.equal((await lead('{oops', env(), [], true)).res.status, 400);
    assert.equal((await lead('[1]', env(), [], true)).res.status, 400);
    assert.equal((await lead(good({ business: 'x'.repeat(5000) }), env(), [])).res.status, 413);
});

test('lead: logs never carry the email, WhatsApp number or business name', async () => {
    const { lines } = await lead(good());
    const all = lines.join('\n');
    for (const bad of ['owner@bluepools.co.za', '082 123 4567', 'Blue <b>Pools']) assert.ok(!all.includes(bad), bad);
});

test('lead: other methods are 405', () => {
    assert.equal(onRequest().status, 405);
});

test('enquiry: escapeHtml escapes the five HTML characters', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('enquiry: extra fields sit between data and email on the record', async () => {
    const kv = mockKV();
    const { result } = await captureLogs(() => storeThenEmail({ ENQUIRIES: kv }, {
        form: 'f', data: { a: '1' }, fields: [], subject: 's', extra: { host: 'h' },
    }));
    assert.deepEqual(Object.keys(result.record), ['received', 'form', 'data', 'host', 'email']);
    assert.equal(result.record.email, 'skipped: no RESEND_API_KEY no CONTACT_TO');
});
