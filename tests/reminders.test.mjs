import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockD1, brokenD1 } from './_d1.mjs';
import { mockFetch, startsWith, withFetch, captureLogs } from './_mocks.mjs';
import { handleReminders, onRequest } from '../functions/api/book/reminders.js';
import { reminderDueMs } from '../functions/_lib/book-slots.js';

const SECRET = 'cron-secret';
const resendOk = [startsWith('https://api.resend.com/'), () => Response.json({ id: 'x' })];
const resendFail = [startsWith('https://api.resend.com/'), () => new Response('no', { status: 500 })];
const env = (extra = {}) => ({ DB: mockD1(), REMINDER_SECRET: SECRET, RESEND_API_KEY: 're', CONTACT_FROM: 'W <w@example.com>', ...extra });
const call = (e, f, now, headers = { 'x-reminder-secret': SECRET }, method = 'POST') =>
    withFetch(f, () => handleReminders({ request: new Request('https://williammcilleron.com/api/book/reminders', { method, headers }), env: e }, now));
const sent = (f) => f.calls.filter((c) => c.url.startsWith('https://api.resend.com/')).map((c) => JSON.parse(c.init.body));

let n = 0;
function add(e, over = {}) {
    const r = { id: 'WM-T' + String(++n).padStart(5, '0'), slot_start: '2026-11-23T13:30:00Z', name: 'Thandi Nkosi', email: 'thandi@example.com', phone: '082 123 4567', contact: 'whatsapp', topic: 'website,ads',
        answers_json: JSON.stringify({ needs: ['website', 'ads'] }), status: 'booked', cancel_token_hash: 'h' + n, ip_hash: 'ip', created_at: '2026-11-21T10:00:00Z', ...over };
    e.DB.raw.prepare('INSERT INTO bookings (id, slot_start, name, email, phone, contact, topic, answers_json, status, cancel_token_hash, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(r.id, r.slot_start, r.name, r.email, r.phone, r.contact, r.topic, r.answers_json, r.status, r.cancel_token_hash, r.ip_hash, r.created_at);
    return r;
}
const row = (e, id) => e.DB.raw.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
// A Monday 15:30 SAST call (13:30Z): the reminder is due at 12:30 SAST (10:30Z).
const DUE = new Date('2026-11-23T10:30:00Z');

test('when a reminder is due: three hours before, but not before 07:00 that morning', () => {
    assert.equal(new Date(reminderDueMs('2026-11-23T13:30:00Z')).toISOString(), '2026-11-23T10:30:00.000Z'); // 15:30 call -> 12:30
    assert.equal(new Date(reminderDueMs('2026-11-28T07:00:00Z')).toISOString(), '2026-11-28T05:00:00.000Z'); // 09:00 call -> 07:00
    assert.equal(new Date(reminderDueMs('2026-11-28T07:20:00Z')).toISOString(), '2026-11-28T05:00:00.000Z'); // 09:20 -> still 07:00 (not 06:20)
    assert.equal(new Date(reminderDueMs('2026-11-28T08:00:00Z')).toISOString(), '2026-11-28T05:00:00.000Z'); // 10:00 -> 07:00 exactly
    assert.equal(new Date(reminderDueMs('2026-11-28T08:20:00Z')).toISOString(), '2026-11-28T05:20:00.000Z'); // 10:20 -> 07:20
});

test('sends the reminder once it is due, with the right content, and marks it sent', async () => {
    const e = env(); const b = add(e); const f = mockFetch([resendOk]);
    const res = await call(e, f, DUE);
    assert.equal(res.status, 200); assert.deepEqual(await res.json(), { ok: true, sent: 1, failed: 0, purged: 0 });
    const [m] = sent(f);
    assert.deepEqual(m.to, ['thandi@example.com']); assert.equal(m.reply_to, 'william@williammcilleron.com'); assert.equal(m.from, 'W <w@example.com>');
    assert.equal(m.subject, 'Reminder: your call with William today at 15:30');
    assert.match(m.text, /^Hi Thandi,/); assert.match(m.text, /today at 15:30 \(South African time\)/); assert.match(m.text, /on WhatsApp at 082 123 4567/);
    assert.match(m.text, /A new website, Google or Meta ads/); assert.match(m.text, /072 355 5350/);
    assert.ok(!m.text.includes('—'), 'no em dashes');
    assert.ok(row(e, b.id).reminded_at);
});

test('says "the phone" for a phone-call booking, and copes with an old row that has no needs list', async () => {
    const e = env(); add(e, { contact: 'phone', answers_json: '{}', topic: 'ads' }); const f = mockFetch([resendOk]);
    await call(e, f, DUE);
    assert.match(sent(f)[0].text, /on the phone at 082 123 4567/); assert.match(sent(f)[0].text, /Google or Meta ads/);
});

test('only once: a second run, and the next one after that, send nothing', async () => {
    const e = env(); add(e); const f = mockFetch([resendOk]);
    await call(e, f, DUE); await call(e, f, new Date(DUE.getTime() + 15 * 60000)); await call(e, f, new Date(DUE.getTime() + 30 * 60000));
    assert.equal(sent(f).length, 1);
});

test('not before it is due, not after the call has started, not for cancelled or distant calls', async () => {
    const e = env(); const f = mockFetch([resendOk]);
    add(e);
    await call(e, f, new Date(DUE.getTime() - 60000));                       // one minute early
    await call(e, f, new Date('2026-11-23T13:30:00Z'));                      // exactly at the start
    await call(e, f, new Date('2026-11-23T14:00:00Z'));                      // after it
    add(e, { slot_start: '2026-11-23T14:30:00Z', status: 'cancelled' });     // cancelled
    add(e, { slot_start: '2026-11-30T13:30:00Z' });                          // a week away
    await call(e, f, new Date('2026-11-23T10:00:00Z'));                      // the cancelled 14:30Z call and the far one stay quiet
    assert.equal(sent(f).length, 0);
    const e2 = env(); add(e2, { slot_start: '2026-11-23T14:30:00Z' }); const f2 = mockFetch([resendOk]); // 16:30 SAST: due 13:30 SAST = 11:30Z
    await call(e2, f2, new Date('2026-11-23T11:29:00Z'));
    assert.equal(sent(f2).length, 0);
    await call(e2, f2, new Date('2026-11-23T11:30:00Z'));
    assert.equal(sent(f2).length, 1);
});

test('an early call waits for 07:00, then goes out', async () => {
    const e = env(); add(e, { slot_start: '2026-11-28T07:00:00Z' }); const f = mockFetch([resendOk]); // Saturday 09:00 SAST
    await call(e, f, new Date('2026-11-28T04:30:00Z')); // 06:30 SAST: inside the 3 hour window but before 07:00
    assert.equal(sent(f).length, 0);
    await call(e, f, new Date('2026-11-28T05:00:00Z')); // 07:00 SAST
    assert.equal(sent(f).length, 1);
});

test('if the email fails the claim is released and the next run retries it', async () => {
    const e = env(); const b = add(e);
    const f1 = mockFetch([resendFail]);
    assert.deepEqual(await (await call(e, f1, DUE)).json(), { ok: true, sent: 0, failed: 1, purged: 0 });
    assert.equal(row(e, b.id).reminded_at, null);
    const f2 = mockFetch([resendOk]);
    assert.equal((await (await call(e, f2, new Date(DUE.getTime() + 15 * 60000))).json()).sent, 1);
    assert.ok(row(e, b.id).reminded_at);
    const f3 = mockFetch([resendOk]); const e3 = env({ RESEND_API_KEY: undefined }); const b3 = add(e3);
    assert.equal((await (await call(e3, f3, DUE)).json()).failed, 1, 'no email key: reported, not marked sent');
    assert.equal(row(e3, b3.id).reminded_at, null);
});

test('RACE: two overlapping runs send one reminder, not two', async () => {
    const e = env(); add(e); const f = mockFetch([resendOk]);
    const [a, b] = await Promise.all([call(e, f, DUE), call(e, f, DUE)]);
    assert.equal((await a.json()).sent + (await b.json()).sent, 1);
    assert.equal(sent(f).length, 1);
});

test('it is not callable by the public: no secret, wrong secret, wrong method', async () => {
    const e = env(); add(e); const f = mockFetch([resendOk]);
    for (const headers of [{}, { 'x-reminder-secret': '' }, { 'x-reminder-secret': 'wrong' }, { 'x-reminder-secret': SECRET + 'x' }, { 'x-reminder-secret': SECRET.slice(0, -1) }]) {
        assert.equal((await call(e, f, DUE, headers)).status, 401, JSON.stringify(headers));
    }
    assert.equal(onRequest().status, 405); // Pages routes every method except POST here
    assert.equal(sent(f).length, 0);
    assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS c FROM bookings WHERE reminded_at IS NOT NULL').get().c, 0);
});

test('missing bindings and database failures give a calm 500 and never leak the secret', async () => {
    for (const missing of ['DB', 'REMINDER_SECRET']) {
        const e = env(); delete e[missing];
        const { result } = await captureLogs(() => call(e, mockFetch([]), DUE));
        assert.equal(result.status, 500, missing);
    }
    const { result, lines } = await captureLogs(() => call(env({ DB: brokenD1() }), mockFetch([]), DUE));
    assert.equal(result.status, 500);
    const body = await result.text(); assert.ok(!body.includes(SECRET) && !body.includes('D1 unavailable'));
    assert.ok(!lines.join('\n').includes(SECRET));
});

test('retention: bookings more than 365 days after their call are deleted, newer ones and future ones are kept', async () => {
    const e = env(); const f = mockFetch([resendOk]);
    const old = add(e, { slot_start: '2025-11-20T13:30:00Z' });                          // 368 days before the run
    const oldCancelled = add(e, { slot_start: '2025-10-01T13:30:00Z', status: 'cancelled' });
    const recent = add(e, { slot_start: '2025-11-25T13:30:00Z' });                       // 363 days before
    const future = add(e, { slot_start: '2026-12-10T13:30:00Z' });
    const res = await call(e, f, new Date('2026-11-23T08:00:00Z'));
    assert.equal((await res.json()).purged, 2);
    assert.equal(row(e, old.id), undefined); assert.equal(row(e, oldCancelled.id), undefined);
    assert.ok(row(e, recent.id)); assert.ok(row(e, future.id));
});

test('reminder email text is HTML-escaped and logs hold no personal details', async () => {
    const e = env(); add(e, { name: '<img src=x onerror=alert(1)> Evil' }); const f = mockFetch([resendOk]);
    const { lines } = await captureLogs(() => call(e, f, DUE));
    const m = sent(f)[0];
    assert.ok(!m.html.includes('<img')); assert.match(m.html, /&lt;img/);
    const all = lines.join('\n');
    for (const secret of ['Thandi', 'example.com', '082 123 4567', 'Evil']) assert.ok(!all.includes(secret), secret);
});
