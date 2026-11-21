import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockD1, brokenD1 } from './_d1.mjs';
import { mockFetch, turnstileOk, turnstileFail, startsWith, withFetch, captureLogs } from './_mocks.mjs';
import { handleBooking } from '../functions/api/book.js';
import { handleSlots } from '../functions/api/book/slots.js';
import { handleCancel } from '../functions/api/book/cancel.js';

const NOW = new Date('2026-11-21T06:00:00Z'); // Saturday 08:00 SAST
const SLOT = '2026-11-23T13:30:00Z';           // Monday 15:30 SAST
const SLOT2 = '2026-11-23T13:50:00Z';
const resendOk = [startsWith('https://api.resend.com/'), () => Response.json({ id: 'x' })];

function env(extra = {}) {
    return { DB: mockD1(), BOOKING_SECRET: 'test-secret', TURNSTILE_SECRET: 'ts', RESEND_API_KEY: 're_test', CONTACT_TO: 'owner@example.com', CONTACT_FROM: 'W <w@example.com>', ...extra };
}
const good = (over = {}) => ({
    slot: SLOT, name: 'Thandi Nkosi', email: 'Thandi@Example.com', phone: '082 123 4567', contact: 'whatsapp',
    needs: ['site-check'], business: 'Nkosi Plumbing', note: 'Site is slow on phones.', hp: '', turnstileToken: 'tok', ...over,
});
const req = (method, body, ip = '10.1.1.1', url = 'https://williammcilleron.com/api/book') =>
    new Request(url, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
const book = (e, body, ip, f = mockFetch([turnstileOk, resendOk])) => withFetch(f, () => handleBooking({ request: req('POST', body, ip), env: e }, NOW));
const rows = (e) => e.DB.raw.prepare('SELECT * FROM bookings ORDER BY created_at').all();
const sentTo = (f) => f.calls.filter((c) => c.url.startsWith('https://api.resend.com/')).map((c) => JSON.parse(c.init.body));

test('books a slot: stores one row, hashes the token and the IP, returns calendar links', async () => {
    const e = env(); const f = mockFetch([turnstileOk, resendOk]);
    const res = await book(e, good(), '10.1.1.1', f);
    assert.equal(res.status, 200);
    const j = await res.json();
    assert.match(j.reference, /^WM-[A-Z2-9]{6}$/);
    assert.equal(j.start, SLOT); assert.equal(j.end, '2026-11-23T13:50:00Z'); assert.equal(j.when, 'Mon 23 Nov, 15:30');
    assert.match(j.calendar.google, /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    assert.match(j.calendar.google, /dates=20261123T133000Z%2F20261123T135000Z/);
    assert.match(j.calendar.outlook, /^https:\/\/outlook\.live\.com\/calendar\/0\/deeplink\/compose/);
    const token = new URL(j.cancelUrl).searchParams.get('t');
    assert.equal(new URL(j.cancelUrl).origin + new URL(j.cancelUrl).pathname, 'https://williammcilleron.com/book/cancel/');
    const [r] = rows(e);
    assert.equal(rows(e).length, 1);
    assert.equal(r.slot_start, SLOT); assert.equal(r.email, 'thandi@example.com'); assert.equal(r.status, 'booked');
    assert.equal(r.topic, 'site-check'); assert.deepEqual(JSON.parse(r.answers_json), { needs: ['site-check'], business: 'Nkosi Plumbing', note: 'Site is slow on phones.' });
    assert.notEqual(r.cancel_token_hash, token); assert.match(r.cancel_token_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(r).includes('10.1.1.1')); assert.match(r.ip_hash, /^[0-9a-f]{32}$/);
});

test('emails William and the visitor; the visitor email carries the links and the cancel URL', async () => {
    const e = env(); const f = mockFetch([turnstileOk, resendOk]);
    const j = await (await book(e, good(), '10.1.1.1', f)).json();
    const mails = sentTo(f);
    assert.equal(mails.length, 2);
    const owner = mails.find((m) => m.to[0] === 'owner@example.com'); const visitor = mails.find((m) => m.to[0] === 'thandi@example.com');
    assert.match(owner.subject, /Call booked: Thandi Nkosi, Mon 23 Nov, 15:30/); assert.equal(owner.reply_to, 'thandi@example.com');
    assert.match(owner.text, /082 123 4567/); assert.match(owner.text, /WhatsApp call/);
    assert.match(visitor.text, /Google Calendar: https:\/\/calendar\.google\.com/); assert.ok(visitor.text.includes(j.cancelUrl));
    assert.ok(!owner.text.includes(j.cancelUrl)); // the cancel link is the visitor's alone
});

test('email content is HTML-escaped', async () => {
    const e = env(); const f = mockFetch([turnstileOk, resendOk]);
    await book(e, good({ name: '<img src=x onerror=alert(1)>', note: '<script>alert(1)</script>' }), '10.1.1.1', f);
    const owner = sentTo(f).find((m) => m.to[0] === 'owner@example.com');
    assert.ok(!owner.html.includes('<img') && !owner.html.includes('<script>'));
    assert.match(owner.html, /&lt;script&gt;/);
});

test('a failed or missing email never undoes the booking', async () => {
    const e = env();
    const res = await book(e, good(), '10.1.1.1', mockFetch([turnstileOk, [startsWith('https://api.resend.com/'), () => new Response('nope', { status: 500 })]]));
    assert.equal(res.status, 200); assert.equal(rows(e).length, 1);
    const e2 = env({ RESEND_API_KEY: undefined, CONTACT_TO: undefined });
    assert.equal((await book(e2, good(), '10.1.1.2', mockFetch([turnstileOk]))).status, 200);
    const e3 = env();
    assert.equal((await book(e3, good(), '10.1.1.3', mockFetch([turnstileOk, [startsWith('https://api.resend.com/'), () => { throw new Error('down'); }]]))).status, 200);
});

test('RACE: ten people grabbing the same slot at once, exactly one wins', async () => {
    const e = env();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => book(e, good({ email: `p${i}@example.com`, name: 'P' + i }), `10.2.0.${i}`)));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal(rows(e).length, 1);
    const loser = await (await book(e, good({ email: 'late@example.com' }), '10.2.9.9')).json();
    assert.equal(loser.ok, false); assert.match(loser.message, /taken that time|took that time/);
});

test('different slots at the same moment all succeed', async () => {
    const e = env();
    const slots = ['2026-11-23T13:30:00Z', '2026-11-23T13:50:00Z', '2026-11-23T14:10:00Z'];
    const res = await Promise.all(slots.map((s, i) => book(e, good({ slot: s, email: `q${i}@example.com` }), `10.3.0.${i}`)));
    assert.deepEqual(res.map((r) => r.status), [200, 200, 200]); assert.equal(rows(e).length, 3);
});

test('rejects each bad field with a 400 and writes nothing', async () => {
    const cases = [
        ['name', { name: '' }], ['name', { name: 'x'.repeat(81) }], ['name', { name: 42 }],
        ['email', { email: 'nope' }], ['email', { email: 'a@b' }], ['email', { email: 'a b@c.com' }], ['email', { email: 'a@b.com,c@d.com' }],
        ['phone', { phone: 'abc' }], ['phone', { phone: '123' }], ['phone', { phone: '' }],
        ['contact', { contact: 'carrier-pigeon' }], ['contact', { contact: undefined }],
        ['need', { needs: ['hack'] }], ['need', { needs: ['__proto__'] }], ['need', { needs: ['toString'] }], ['need', { needs: [] }], ['need', { needs: 'ads' }],
        ['need', { needs: ['ads', 'nope'] }], ['need', { needs: [1] }], ['need', { needs: [['ads']] }], ['need', { needs: undefined, need: undefined }],
        ['need', { needs: Array(12).fill('ads') }],
        ['malformed', { hp: 'bot filled this' }], ['malformed', { note: 'x'.repeat(501) }], ['malformed', { business: 'x'.repeat(121) }],
    ];
    for (const [, over] of cases) {
        const e = env(); const f = mockFetch([turnstileOk, resendOk]);
        const res = await book(e, good(over), '10.1.1.1', f);
        assert.equal(res.status, 400, JSON.stringify(over)); assert.equal((await res.json()).ok, false);
        assert.equal(rows(e).length, 0); assert.equal(f.calls.length, 0, 'no network before the fields pass');
    }
});

test('rejects slots that are not real open slots (409), before spending a Turnstile check', async () => {
    for (const slot of ['2026-11-23T13:35:00Z', '2026-11-22T10:00:00Z', '2026-11-21T07:00:00Z', '2026-12-30T10:00:00Z', '2026-12-25T10:00:00Z', 'x', '', null, 7]) {
        const e = env(); const f = mockFetch([turnstileOk]);
        const res = await book(e, good({ slot }), '10.1.1.1', f);
        assert.equal(res.status, slot === null || typeof slot === 'number' ? 409 : 409, String(slot));
        assert.equal(rows(e).length, 0); assert.equal(f.calls.length, 0);
    }
});

test('a failed Turnstile check books nothing', async () => {
    const e = env();
    const res = await book(e, good(), '10.1.1.1', mockFetch([turnstileFail]));
    assert.equal(res.status, 403); assert.equal(rows(e).length, 0);
});

test('malformed bodies', async () => {
    const e = env(); const f = mockFetch([]);
    for (const body of ['{not json', '[]', '"str"', 'null', '']) {
        assert.equal((await book(e, body, '10.1.1.1', f)).status, 400, String(body));
    }
    assert.equal((await book(e, JSON.stringify({ ...good(), pad: 'x'.repeat(5000) }), '10.1.1.1', f)).status, 413);
    assert.equal(rows(e).length, 0);
});

test('one IP gets three bookings a day, the fourth is refused', async () => {
    const e = env();
    // Saturday 28 Nov (term): no daily cap, so the IP limit is what stops the fourth.
    const slots = ['2026-11-28T07:00:00Z', '2026-11-28T07:20:00Z', '2026-11-28T07:40:00Z', '2026-11-28T08:00:00Z'];
    const out = [];
    for (const [i, s] of slots.entries()) out.push((await book(e, good({ slot: s, email: `r${i}@example.com` }), '10.9.9.9')).status);
    assert.deepEqual(out, [200, 200, 200, 429]);
    assert.equal((await book(e, good({ slot: slots[3], email: 'r9@example.com' }), '10.9.9.8')).status, 200); // another IP is fine
});

test('one email address holds at most two upcoming calls', async () => {
    const e = env();
    const out = [];
    for (const [i, s] of [SLOT, SLOT2, '2026-11-23T14:10:00Z'].entries()) out.push((await book(e, good({ slot: s }), `10.8.0.${i}`)).status);
    assert.deepEqual(out, [200, 200, 409]);
});

test('several topics can be picked: all stored, de-duplicated, in a fixed order, and shown in both emails', async () => {
    const e = env(); const f = mockFetch([turnstileOk, resendOk]);
    const res = await book(e, good({ needs: ['social', 'website', 'ads', 'website', 'system'] }), '10.1.1.1', f);
    assert.equal(res.status, 200);
    const [r] = rows(e);
    assert.equal(r.topic, 'website,ads,social,system');
    assert.deepEqual(JSON.parse(r.answers_json).needs, ['website', 'ads', 'social', 'system']);
    const owner = sentTo(f).find((m) => m.to[0] === 'owner@example.com');
    assert.match(owner.text, /Wants to talk about: A new website, Google or Meta ads, Social media, A system, integration or automation/);
});

test('every service on the site can be picked, all at once', async () => {
    const all = ['site-check', 'website', 'redesign', 'fix', 'upkeep', 'ads', 'booking', 'brand', 'social', 'system', 'other'];
    const e = env();
    assert.equal((await book(e, good({ needs: all }))).status, 200);
    assert.deepEqual(JSON.parse(rows(e)[0].answers_json).needs, all);
});

test('a cached old page that still sends a single `need` string keeps working', async () => {
    const e = env();
    const body = good(); delete body.needs; body.need = 'ads';
    assert.equal((await book(e, body)).status, 200);
    assert.equal(rows(e)[0].topic, 'ads');
});

test('GET /api/book/slots lists open days and drops taken slots', async () => {
    const e = env();
    const before = await (await handleSlots({ request: req('GET'), env: e }, NOW)).json();
    assert.equal(before.ok, true); assert.equal(before.days[0].date, '2026-11-23');
    const n0 = before.days[0].slots.length;
    await book(e, good());
    const after = await (await handleSlots({ request: req('GET'), env: e }, NOW)).json();
    assert.equal(after.days[0].slots.length, n0 - 1);
    assert.ok(!after.days[0].slots.some((s) => s.start === SLOT));
    assert.equal(after.days[0].slots[0].time, '15:50');
});

test('database and binding failures give a calm 500 and no stack trace', async () => {
    const { result: r1, lines } = await captureLogs(() => book(env({ DB: brokenD1() }), good()));
    assert.equal(r1.status, 500); assert.ok(!(await r1.text()).includes('D1 unavailable'));
    for (const missing of ['DB', 'BOOKING_SECRET', 'TURNSTILE_SECRET']) {
        const e = env(); delete e[missing];
        const { result } = await captureLogs(() => book(e, good()));
        assert.equal(result.status, 500, missing);
    }
    const s = await captureLogs(() => handleSlots({ request: req('GET'), env: env({ DB: brokenD1() }) }, NOW));
    assert.equal(s.result.status, 500);
    assert.ok(lines.length > 0);
});

test('logs hold no names, emails, phone numbers or IPs', async () => {
    const e = env();
    const { lines } = await captureLogs(async () => { await book(e, good()); await book(e, good({ email: 'z@example.com' }), '10.7.7.7'); await book(e, good({ slot: 'bad' })); });
    const all = lines.join('\n');
    for (const secret of ['Thandi', 'example.com', '082 123 4567', '10.1.1.1', '10.7.7.7', 'Nkosi']) assert.ok(!all.includes(secret), secret);
});

/* ---- cancel -------------------------------------------------------------- */

async function bookAndToken(e) {
    const j = await (await book(e, good())).json();
    return { j, token: new URL(j.cancelUrl).searchParams.get('t') };
}
const cancelGet = (e, token, now = NOW) => handleCancel({ request: req('GET', undefined, '10.1.1.1', 'https://williammcilleron.com/api/book/cancel?token=' + encodeURIComponent(token)), env: e }, now);
const cancelPost = (e, token, now = NOW, f = mockFetch([resendOk])) => withFetch(f, () => handleCancel({ request: req('POST', { token }, '10.1.1.1', 'https://williammcilleron.com/api/book/cancel'), env: e }, now));

test('cancel: GET only looks up, POST cancels, the slot reopens and can be rebooked', async () => {
    const e = env(); const { token } = await bookAndToken(e);
    const look = await cancelGet(e, token);
    assert.equal(look.status, 200); assert.equal((await look.json()).when, 'Mon 23 Nov, 15:30');
    assert.equal(rows(e)[0].status, 'booked', 'a GET (mail scanner, link preview) must not cancel');
    const f = mockFetch([resendOk]);
    const done = await cancelPost(e, token, NOW, f);
    assert.equal(done.status, 200); assert.equal(rows(e)[0].status, 'cancelled'); assert.ok(rows(e)[0].cancelled_at);
    assert.match(sentTo(f)[0].subject, /Call cancelled/);
    const slots = await (await handleSlots({ request: req('GET'), env: e }, NOW)).json();
    assert.ok(slots.days[0].slots.some((s) => s.start === SLOT));
    assert.equal((await book(e, good({ email: 'next@example.com' }), '10.5.5.5')).status, 200);
    assert.equal(rows(e).filter((r) => r.status === 'booked').length, 1);
});

test('cancel: a second cancel, a wrong token, a malformed token and a method other than GET or POST', async () => {
    const e = env(); const { token } = await bookAndToken(e);
    assert.equal((await cancelPost(e, token)).status, 200);
    assert.equal((await cancelPost(e, token)).status, 404);
    assert.equal((await cancelGet(e, token)).status, 404);
    const e2 = env(); await bookAndToken(e2);
    for (const bad of ['a'.repeat(32), 'short', '', 'x'.repeat(200), "' OR 1=1 --", '../../etc/passwd']) {
        assert.equal((await cancelPost(e2, bad)).status, 404, bad);
        assert.equal((await cancelGet(e2, bad)).status, 404, bad);
    }
    assert.equal(rows(e2)[0].status, 'booked');
    const del = await handleCancel({ request: req('DELETE', undefined, '10.1.1.1', 'https://x/api/book/cancel'), env: e2 }, NOW);
    assert.equal(del.status, 405);
});

test('cancel: a call that has already started cannot be cancelled', async () => {
    const e = env(); const { token } = await bookAndToken(e);
    assert.equal((await cancelPost(e, token, new Date('2026-11-23T13:31:00Z'))).status, 409);
    assert.equal(rows(e)[0].status, 'booked');
});

test('cancel: a token from another database does not match (HMAC secret)', async () => {
    const e = env(); const { token } = await bookAndToken(e);
    assert.equal((await cancelPost({ ...e, BOOKING_SECRET: 'different' }, token)).status, 404);
});

test('unique index: the database itself refuses a second booked row for a slot', () => {
    const e = env();
    const ins = (id) => e.DB.raw.prepare("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)").run(id, SLOT, 'n', 'e@x.com', '0821234567', 'phone', 'other', '{}', 'booked', 'h' + id, 'ip', 'now');
    ins('A');
    assert.throws(() => ins('B'), /UNIQUE/);
    e.DB.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id='A'").run();
    ins('C'); // allowed once the first is cancelled
});

/* ---- daily cap on school days ------------------------------------------------ */

const bookAt = (e, slot, i, extra = {}) => book(e, good({ slot, email: `cap${i}@example.com`, ...extra }), `10.20.${i >> 8}.${i & 255}`);
const MON = ['2026-11-23T13:30:00Z', '2026-11-23T13:50:00Z', '2026-11-23T14:10:00Z', '2026-11-23T14:30:00Z', '2026-11-23T14:50:00Z'];

test('school day cap: three calls on a term Monday, the fourth is refused and the day disappears', async () => {
    const e = env();
    const out = [];
    for (const [i, s] of MON.slice(0, 4).entries()) out.push((await bookAt(e, s, i)).status);
    assert.deepEqual(out, [200, 200, 200, 409]);
    assert.equal(rows(e).length, 3);
    const fourth = await (await bookAt(e, MON[4], 9)).json();
    assert.equal(fourth.message, 'That day is fully booked. Pick another day.');
    const body = await (await handleSlots({ request: req('GET'), env: e }, NOW)).json();
    assert.ok(!body.days.some((d) => d.date === '2026-11-23'), 'a full day is not offered');
    assert.equal(body.days[0].date, '2026-11-24');
});

test('school day cap: a cancelled call frees a place, and cancelled rows do not count', async () => {
    const e = env(); const tokens = [];
    for (const [i, s] of MON.slice(0, 3).entries()) tokens.push(new URL((await (await bookAt(e, s, i)).json()).cancelUrl).searchParams.get('t'));
    assert.equal((await bookAt(e, MON[3], 7)).status, 409);
    assert.equal((await cancelPost(e, tokens[0])).status, 200);
    assert.equal((await bookAt(e, MON[3], 8)).status, 200);
    const body = await (await handleSlots({ request: req('GET'), env: e }, NOW)).json();
    assert.ok(!body.days.some((d) => d.date === '2026-11-23'));
});

test('school day cap: five people at once for one Monday, exactly three get in', async () => {
    const e = env();
    const res = await Promise.all(MON.map((s, i) => bookAt(e, s, i + 30)));
    assert.deepEqual(res.map((r) => r.status).sort(), [200, 200, 200, 409, 409]);
    assert.equal(rows(e).length, 3);
});

test('no cap on a term Saturday or on a weekday in the school holidays', async () => {
    const e = env();
    const sat = ['2026-11-28T07:00:00Z', '2026-11-28T07:20:00Z', '2026-11-28T07:40:00Z', '2026-11-28T08:00:00Z', '2026-11-28T08:20:00Z'];
    const hol = ['2026-12-01T07:00:00Z', '2026-12-01T07:20:00Z', '2026-12-01T07:40:00Z', '2026-12-01T08:00:00Z', '2026-12-01T08:20:00Z']; // Tuesday 1 Dec, holiday
    const out = [];
    for (const [i, s] of [...sat, ...hol].entries()) out.push((await bookAt(e, s, i + 60)).status);
    assert.deepEqual(out, Array(10).fill(200));
    const days = (await (await handleSlots({ request: req('GET'), env: e }, NOW)).json()).days.map((d) => d.date);
    assert.ok(days.includes('2026-11-28') && days.includes('2026-12-01'));
});

test('the cap counts the day in South African time, not UTC', async () => {
    const e = env();
    // 17:30 SAST on Monday is 15:30Z, the same local day as 15:30 SAST (13:30Z): all four are Monday.
    const late = ['2026-11-23T13:30:00Z', '2026-11-23T14:30:00Z', '2026-11-23T15:10:00Z', '2026-11-23T15:30:00Z'];
    const out = [];
    for (const [i, s] of late.entries()) out.push((await bookAt(e, s, i + 80)).status);
    assert.deepEqual(out, [200, 200, 200, 409]);
    assert.equal((await bookAt(e, '2026-11-24T13:30:00Z', 90)).status, 200); // Tuesday is a fresh day
});
