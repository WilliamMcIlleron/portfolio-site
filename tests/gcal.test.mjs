import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mockD1 } from './_d1.mjs';
import { mockFetch, turnstileOk, startsWith, withFetch, captureLogs } from './_mocks.mjs';
import { handleBooking } from '../functions/api/book.js';
import { handleSlots } from '../functions/api/book/slots.js';
import { handleCancel } from '../functions/api/book/cancel.js';
import { gcalEnabled, getAccessToken, busyIntervals, overlapsBusy, createEvent, deleteEvent, _resetGcalCache } from '../functions/_lib/gcal.js';
import { openDays } from '../functions/_lib/book-slots.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const SA = { type: 'service_account', client_email: 'bookings@proj.iam.gserviceaccount.com', private_key: PEM };
const CAL = 'william@example.com';
const NOW = new Date('2026-11-21T06:00:00Z');
const SLOT = '2026-11-23T13:30:00Z'; // Mon 15:30 SAST, ends 13:50Z

beforeEach(() => _resetGcalCache());

function google({ busy = [], tokenStatus = 200, busyStatus = 200, createStatus = 200, deleteStatus = 204, calErrors } = {}) {
    const seen = { token: [], busy: [], create: [], del: [] };
    const routes = [
        [startsWith('https://oauth2.googleapis.com/token'), (u, init) => { seen.token.push(String(init.body)); return tokenStatus === 200 ? Response.json({ access_token: 'tok-abc', expires_in: 3600 }) : new Response('no', { status: tokenStatus }); }],
        [startsWith('https://www.googleapis.com/calendar/v3/freeBusy'), (u, init) => {
            seen.busy.push({ body: JSON.parse(init.body), auth: init.headers.authorization });
            if (busyStatus !== 200) return new Response('x', { status: busyStatus });
            return Response.json({ calendars: { [CAL]: calErrors ? { errors: calErrors, busy: [] } : { busy } } });
        }],
        [(u, init) => String(u).startsWith('https://www.googleapis.com/calendar/v3/calendars/') && init.method === 'POST', (u, init) => { seen.create.push({ url: String(u), body: JSON.parse(init.body) }); return createStatus === 200 ? Response.json({ id: 'evt-123' }) : new Response('x', { status: createStatus }); }],
        [(u, init) => String(u).startsWith('https://www.googleapis.com/calendar/v3/calendars/') && init.method === 'DELETE', (u) => { seen.del.push(String(u)); return new Response(null, { status: deleteStatus }); }],
        turnstileOk,
        [startsWith('https://api.resend.com/'), () => Response.json({ id: 'x' })],
    ];
    const f = mockFetch(routes); f.seen = seen; return f;
}

const env = (extra = {}) => ({ DB: mockD1(), BOOKING_SECRET: 's', TURNSTILE_SECRET: 't', RESEND_API_KEY: 're', CONTACT_TO: 'o@example.com', GOOGLE_SERVICE_ACCOUNT: JSON.stringify(SA), GOOGLE_CALENDAR_ID: CAL, ...extra });
const good = (over = {}) => ({ slot: SLOT, name: 'Thandi Nkosi', email: 'thandi@example.com', phone: '082 123 4567', contact: 'whatsapp', needs: ['website', 'ads'], business: 'Nkosi Plumbing', note: 'Slow on phones', hp: '', turnstileToken: 'tok', ...over });
const post = (e, body, f, ip = '10.1.1.1') => withFetch(f, () => handleBooking({ request: new Request('https://williammcilleron.com/api/book', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }), env: e }, NOW));
const slots = (e, f) => withFetch(f, () => handleSlots({ request: new Request('https://x/api/book/slots'), env: e }, NOW)).then((r) => r.json());
const rows = (e) => e.DB.raw.prepare('SELECT * FROM bookings').all();

test('off unless both secrets are present, and then makes no Google calls at all', async () => {
    assert.equal(gcalEnabled({}), false);
    assert.equal(gcalEnabled({ GOOGLE_SERVICE_ACCOUNT: '{}' }), false);
    assert.equal(gcalEnabled({ GOOGLE_CALENDAR_ID: 'x' }), false);
    assert.equal(gcalEnabled(env()), true);
    const e = env({ GOOGLE_SERVICE_ACCOUNT: undefined }); const f = google();
    await slots(e, f); assert.equal((await post(e, good(), f)).status, 200);
    assert.equal(f.calls.filter((c) => c.url.includes('googleapis.com')).length, 0);
});

test('the login assertion is a valid RS256 JWT signed with the service account key', async () => {
    const f = google();
    const tok = await withFetch(f, () => getAccessToken(env()));
    assert.equal(tok, 'tok-abc');
    const form = new URLSearchParams(f.seen.token[0]);
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, c, s] = form.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    assert.equal(JSON.parse(Buffer.from(h, 'base64url').toString()).alg, 'RS256');
    assert.equal(claims.iss, SA.client_email); assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/calendar'); assert.equal(claims.exp - claims.iat, 3600);
    assert.ok(verify('RSA-SHA256', Buffer.from(h + '.' + c), publicKey, Buffer.from(s, 'base64url')), 'signature verifies with the public key');
});

test('the access token is reused, not fetched on every call', async () => {
    const f = google();
    await withFetch(f, async () => { await getAccessToken(env()); await getAccessToken(env()); await busyIntervals(env(), '2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z'); });
    assert.equal(f.seen.token.length, 1);
});

test('token failures and a bad key throw, without leaking the key', async () => {
    await assert.rejects(withFetch(google({ tokenStatus: 401 }), () => getAccessToken(env())), /token request failed: 401/);
    _resetGcalCache();
    await assert.rejects(getAccessToken(env({ GOOGLE_SERVICE_ACCOUNT: 'not json' })), (e) => !String(e.message).includes('not json') && /not a valid service account key/.test(e.message));
    await assert.rejects(getAccessToken(env({ GOOGLE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'a@b.c', private_key: 'garbage' }) })));
});

test('busyIntervals asks for the right window and parses the answer; errors throw', async () => {
    const f = google({ busy: [{ start: '2026-11-23T13:40:00Z', end: '2026-11-23T14:10:00Z' }] });
    const b = await withFetch(f, () => busyIntervals(env(), '2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z'));
    assert.deepEqual(b, [{ start: Date.parse('2026-11-23T13:40:00Z'), end: Date.parse('2026-11-23T14:10:00Z') }]);
    assert.equal(f.seen.busy[0].auth, 'Bearer tok-abc'); assert.deepEqual(f.seen.busy[0].body.items, [{ id: CAL }]); assert.equal(f.seen.busy[0].body.timeMin, '2026-11-23T00:00:00Z');
    _resetGcalCache();
    await assert.rejects(withFetch(google({ busyStatus: 500 }), () => busyIntervals(env(), 'a', 'b')), /freeBusy failed: 500/);
    _resetGcalCache();
    await assert.rejects(withFetch(google({ calErrors: [{ reason: 'notFound' }] }), () => busyIntervals(env(), 'a', 'b')), /not readable: notFound/);
});

test('busy results are cached for 45 s, and fresh: true skips the cache', async () => {
    const f = google();
    await withFetch(f, async () => {
        await busyIntervals(env(), 'a', 'b', { nowMs: 1000 }); await busyIntervals(env(), 'a', 'b', { nowMs: 20000 });
        assert.equal(f.seen.busy.length, 1);
        await busyIntervals(env(), 'a', 'b', { nowMs: 50000 }); assert.equal(f.seen.busy.length, 2);
        await busyIntervals(env(), 'a', 'b', { nowMs: 50001, fresh: true }); assert.equal(f.seen.busy.length, 3);
    });
});

test('overlap rule: touching is not a clash, any shared minute is', () => {
    const busy = [{ start: Date.parse('2026-11-23T13:40:00Z'), end: Date.parse('2026-11-23T14:10:00Z') }];
    const at = (iso) => overlapsBusy(Date.parse(iso), 20, busy);
    assert.equal(at('2026-11-23T13:10:00Z'), false); // ends 13:30, before the event
    assert.equal(at('2026-11-23T13:20:00Z'), false); // ends 13:40, exactly when it starts
    assert.equal(at('2026-11-23T13:30:00Z'), true);  // 13:30 to 13:50 overlaps
    assert.equal(at('2026-11-23T13:50:00Z'), true);
    assert.equal(at('2026-11-23T14:10:00Z'), false); // starts exactly when it ends
});

test('openDays hides slots that clash with a busy interval', () => {
    const busy = [{ start: Date.parse('2026-11-23T13:40:00Z'), end: Date.parse('2026-11-23T14:10:00Z') }];
    const times = openDays(NOW, new Set(), busy)[0].slots.map((s) => s.time);
    assert.deepEqual(times, ['16:10', '16:30', '16:50', '17:10', '17:30']); // 15:30 and 15:50 are gone
    // an all-day busy event removes the whole day
    const day = [{ start: Date.parse('2026-11-23T00:00:00Z'), end: Date.parse('2026-11-24T00:00:00Z') }];
    assert.equal(openDays(NOW, new Set(), day)[0].date, '2026-11-24');
});

test('GET slots hides calendar clashes, and falls back to the normal list if Google is down', async () => {
    const e = env();
    const body = await slots(e, google({ busy: [{ start: '2026-11-23T13:40:00Z', end: '2026-11-23T14:10:00Z' }] }));
    assert.deepEqual(body.days[0].slots.map((s) => s.time).slice(0, 2), ['16:10', '16:30']);
    _resetGcalCache();
    const { result, lines } = await captureLogs(() => slots(e, google({ busyStatus: 503 })));
    assert.equal(result.days[0].slots.length, 7);
    assert.ok(lines.some((l) => /google calendar unavailable/.test(l)));
});

test('POST book: a time that is busy on the calendar at the moment of booking is refused and nothing is saved', async () => {
    const e = env(); const f = google({ busy: [{ start: '2026-11-23T13:45:00Z', end: '2026-11-23T14:00:00Z' }] });
    const res = await post(e, good(), f);
    assert.equal(res.status, 409); assert.match((await res.json()).message, /took that time/);
    assert.equal(rows(e).length, 0); assert.equal(f.seen.create.length, 0);
    assert.equal(f.seen.busy[0].body.timeMin, SLOT); assert.equal(f.seen.busy[0].body.timeMax, '2026-11-23T13:50:00Z');
});

test('POST book: writes the event, stores its id, and puts no attendee on it', async () => {
    const e = env(); const f = google();
    assert.equal((await post(e, good(), f)).status, 200);
    assert.equal(f.seen.create.length, 1);
    const { url, body } = f.seen.create[0];
    assert.ok(url.includes(encodeURIComponent(CAL)));
    assert.equal(body.summary, 'Call: Thandi Nkosi');
    assert.deepEqual(body.start, { dateTime: SLOT, timeZone: 'Africa/Johannesburg' });
    assert.deepEqual(body.end, { dateTime: '2026-11-23T13:50:00Z', timeZone: 'Africa/Johannesburg' });
    assert.match(body.description, /WhatsApp call to 082 123 4567/); assert.match(body.description, /A new website, Google or Meta ads/);
    assert.match(body.description, /Business: Nkosi Plumbing/); assert.match(body.description, /Reference: WM-/);
    assert.equal(body.attendees, undefined, 'a service account cannot invite attendees');
    assert.deepEqual(body.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] });
    assert.equal(body.extendedProperties.private.bookingRef, rows(e)[0].id);
    assert.equal(rows(e)[0].gcal_event_id, 'evt-123');
});

test('POST book: if Google is down, the booking still succeeds (and is saved without an event id)', async () => {
    const e = env();
    const a = await captureLogs(() => post(e, good(), google({ busyStatus: 500, createStatus: 500 })));
    assert.equal(a.result.status, 200); assert.equal(rows(e).length, 1); assert.equal(rows(e)[0].gcal_event_id, null);
    assert.ok(a.lines.some((l) => /booking anyway/.test(l)) && a.lines.some((l) => /event not created/.test(l)));
    _resetGcalCache();
    const e2 = env();
    assert.equal((await captureLogs(() => post(e2, good(), google({ tokenStatus: 500 })))).result.status, 200);
    assert.equal(rows(e2).length, 1);
});

test('cancel: deletes the calendar event; a missing event or a Google error does not break the cancel', async () => {
    for (const [deleteStatus, label] of [[204, 'deleted'], [404, 'already gone'], [410, 'gone'], [500, 'google error']]) {
        _resetGcalCache();
        const e = env(); const f = google({ deleteStatus });
        const j = await (await post(e, good(), f, '10.4.4.' + deleteStatus % 200)).json();
        const token = new URL(j.cancelUrl).searchParams.get('t');
        const res = await captureLogs(() => withFetch(f, () => handleCancel({ request: new Request('https://x/api/book/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }), env: e }, NOW)));
        assert.equal(res.result.status, 200, label); assert.equal(rows(e)[0].status, 'cancelled', label);
        assert.equal(f.seen.del.length, 1, label); assert.ok(f.seen.del[0].endsWith('/events/evt-123'), label);
    }
});

test('cancel: a booking with no event id makes no Google call', async () => {
    const e = env({ GOOGLE_SERVICE_ACCOUNT: undefined }); const f = google();
    const j = await (await post(e, good(), f)).json();
    const g = google();
    const res = await withFetch(g, () => handleCancel({ request: new Request('https://x/api/book/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: new URL(j.cancelUrl).searchParams.get('t') }) }), env: { ...e, GOOGLE_SERVICE_ACCOUNT: JSON.stringify(SA) } }, NOW));
    assert.equal(res.status, 200); assert.equal(g.seen.del.length, 0);
});

test('logs never contain the key, the token or the visitor details', async () => {
    const e = env();
    const { lines } = await captureLogs(async () => {
        await post(e, good(), google({ createStatus: 500 })); _resetGcalCache();
        await post(e, good({ slot: '2026-11-23T13:50:00Z', email: 'z@example.com' }), google({ busyStatus: 500 }), '10.6.6.6');
    });
    const all = lines.join('\n');
    for (const secret of ['BEGIN PRIVATE KEY', 'tok-abc', 'Thandi', 'example.com', '082 123 4567', 'Nkosi', CAL, SA.client_email]) assert.ok(!all.includes(secret), secret);
});

test('createEvent and deleteEvent throw on failure so callers can log it', async () => {
    await assert.rejects(withFetch(google({ createStatus: 403 }), () => createEvent(env(), { reference: 'R', startIso: SLOT, endIso: SLOT, summary: 's', description: 'd' })), /create event failed: 403/);
    _resetGcalCache();
    await assert.rejects(withFetch(google({ deleteStatus: 403 }), () => deleteEvent(env(), 'x')), /delete event failed: 403/);
});
