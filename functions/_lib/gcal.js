/* ==========================================================================
   Google Calendar sync through a service account. No onRequest* exports.

   What it does: reads William's busy times so a slot that clashes with a
   calendar event is never offered, and writes an event for each booking (and
   deletes it when the booking is cancelled).

   It is off until both secrets exist, so the booking system works exactly as
   before without them:
     GOOGLE_SERVICE_ACCOUNT  the service account's JSON key, as one string
     GOOGLE_CALENDAR_ID      the calendar to read and write (the Gmail address
                             of the calendar that was shared with the account)

   Every call has a timeout and every caller treats failure as "Google is not
   answering", never as a reason to lose a booking. Nothing from the key, the
   token or the events is ever logged.
   ========================================================================== */

const SCOPE = 'https://www.googleapis.com/auth/calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = 'Africa/Johannesburg';
const TIMEOUT_MS = 5000;

export function gcalEnabled(env) {
    return Boolean(env && env.GOOGLE_SERVICE_ACCOUNT && env.GOOGLE_CALENDAR_ID);
}

const b64url = (input) => {
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function parseAccount(env) {
    try {
        const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT);
        if (sa && typeof sa.client_email === 'string' && typeof sa.private_key === 'string') return sa;
    } catch { /* fall through */ }
    throw new Error('gcal: GOOGLE_SERVICE_ACCOUNT is not a valid service account key');
}

async function importKey(pem) {
    const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function signedAssertion(sa, nowSec) {
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
    const key = await importKey(sa.private_key);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claims));
    return header + '.' + claims + '.' + b64url(sig);
}

// One token per isolate, reused until a minute before it expires.
let cached = null;
export function _resetGcalCache() { cached = null; busyCache = null; }

export async function getAccessToken(env, nowMs = Date.now()) {
    const sa = parseAccount(env);
    if (cached && cached.email === sa.client_email && cached.exp - 60000 > nowMs) return cached.token;
    const assertion = await signedAssertion(sa, Math.floor(nowMs / 1000));
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('gcal: token request failed: ' + res.status);
    const data = await res.json();
    if (!data || typeof data.access_token !== 'string') throw new Error('gcal: token response had no access_token');
    cached = { email: sa.client_email, token: data.access_token, exp: nowMs + (Number(data.expires_in) || 3600) * 1000 };
    return cached.token;
}

async function call(env, method, path, body) {
    const token = await getAccessToken(env);
    const res = await fetch(API + path, {
        method,
        headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res;
}

/* ---- busy times ------------------------------------------------------------ */

let busyCache = null; // { key, at, intervals }
const BUSY_TTL_MS = 45000;

/**
 * Busy intervals on William's calendar between two ISO instants, as [{start,end}] in ms.
 * `fresh: true` skips the 45 s cache (used at the moment of booking).
 * Throws if Google does not answer properly.
 */
export async function busyIntervals(env, fromIso, toIso, { fresh = false, nowMs = Date.now() } = {}) {
    const key = fromIso + '|' + toIso;
    if (!fresh && busyCache && busyCache.key === key && nowMs - busyCache.at < BUSY_TTL_MS) return busyCache.intervals;
    const id = env.GOOGLE_CALENDAR_ID;
    const res = await call(env, 'POST', '/freeBusy', { timeMin: fromIso, timeMax: toIso, timeZone: 'UTC', items: [{ id }] });
    if (!res.ok) throw new Error('gcal: freeBusy failed: ' + res.status);
    const data = await res.json();
    const cal = data && data.calendars && data.calendars[id];
    if (!cal || (Array.isArray(cal.errors) && cal.errors.length)) {
        throw new Error('gcal: calendar not readable: ' + (cal && cal.errors && cal.errors[0] && cal.errors[0].reason || 'missing'));
    }
    const intervals = (cal.busy || [])
        .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
        .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));
    busyCache = { key, at: nowMs, intervals };
    return intervals;
}

/** Does a slot starting at startMs and lasting `minutes` overlap any busy interval? */
export function overlapsBusy(startMs, minutes, busy) {
    const endMs = startMs + minutes * 60000;
    return busy.some((b) => startMs < b.end && endMs > b.start);
}

/* ---- events ---------------------------------------------------------------- */

/** Create the booking's event. Returns the Google event id. Throws on failure. */
export async function createEvent(env, { reference, startIso, endIso, summary, description }) {
    const res = await call(env, 'POST', '/calendars/' + encodeURIComponent(env.GOOGLE_CALENDAR_ID) + '/events', {
        summary,
        description,
        start: { dateTime: startIso, timeZone: TZ },
        end: { dateTime: endIso, timeZone: TZ },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] },
        extendedProperties: { private: { bookingRef: reference } },
    });
    if (!res.ok) throw new Error('gcal: create event failed: ' + res.status);
    const data = await res.json();
    if (!data || typeof data.id !== 'string') throw new Error('gcal: create event returned no id');
    return data.id;
}

/** Delete a booking's event. A missing or already-deleted event counts as done. */
export async function deleteEvent(env, eventId) {
    const res = await call(env, 'DELETE', '/calendars/' + encodeURIComponent(env.GOOGLE_CALENDAR_ID) + '/events/' + encodeURIComponent(eventId));
    if (res.ok || res.status === 404 || res.status === 410) return;
    throw new Error('gcal: delete event failed: ' + res.status);
}
