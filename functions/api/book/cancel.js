/**
 * Cloudflare Pages Function: /api/book/cancel
 *
 * GET  ?token=...   read-only lookup, so the cancel page can say which call it is.
 *                   Answer {ok:true, when:'Mon 23 Nov, 15:30', reference}.
 * POST {token}      cancels it and frees the slot. Answer {ok:true}.
 *
 * Cancelling is a POST on purpose: mail scanners and link previews open every
 * link in an email with a GET, and must not be able to cancel a call.
 * The token is the random string from the confirmation email; only its HMAC is
 * stored. Bindings: DB, BOOKING_SECRET (required); RESEND_API_KEY + CONTACT_TO
 * (optional, to tell William).
 */

import { json, methodNotAllowed, readJsonBody, truncate } from '../../_lib/http.js';
import { whenLabel } from '../../_lib/book-slots.js';
import { COPY, TOKEN, hashToken, cancelledEmail } from '../../_lib/book.js';
import { sendMail } from '../../_lib/mail.js';
import { gcalEnabled, deleteEvent } from '../../_lib/gcal.js';

const fail = (key, status) => json({ ok: false, message: COPY[key] }, status);

async function find(env, token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    return env.DB.prepare("SELECT id, slot_start, name, gcal_event_id FROM bookings WHERE cancel_token_hash = ? AND status = 'booked'").bind(await hashToken(env.BOOKING_SECRET, token)).first();
}

export async function handleCancel(context, now = new Date()) {
    const { request } = context;
    const env = context.env || {};
    if (!env.DB || !env.BOOKING_SECRET) {
        console.error('book/cancel: missing bindings');
        return fail('internal', 500);
    }
    try {
        if (request.method === 'GET') {
            const row = await find(env, new URL(request.url).searchParams.get('token'));
            if (!row) return fail('notfound', 404);
            return json({ ok: true, when: whenLabel(row.slot_start), reference: row.id });
        }
        if (request.method !== 'POST') return methodNotAllowed('GET, POST');

        const parsed = await readJsonBody(request, 1024);
        if (!parsed.ok) return fail('malformed', parsed.error === 'too-large' ? 413 : 400);
        const row = await find(env, parsed.data.token);
        if (!row) return fail('notfound', 404);
        if (Date.parse(row.slot_start) <= now.getTime()) return fail('past', 409);

        const res = await env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'booked'").bind(now.toISOString(), row.id).run();
        if (!(res?.meta?.changes > 0)) return fail('notfound', 404); // someone cancelled between the lookup and the update
        const work = [];
        if (env.CONTACT_TO) work.push(sendMail(env, { to: env.CONTACT_TO, ...cancelledEmail({ id: row.id, start: row.slot_start, name: row.name }) }).catch(() => null));
        if (gcalEnabled(env) && row.gcal_event_id) {
            work.push(deleteEvent(env, row.gcal_event_id).catch((e) => console.error('book/cancel: calendar event not deleted: ' + truncate(e))));
        }
        if (work.length) {
            const done = Promise.all(work);
            if (typeof context.waitUntil === 'function') context.waitUntil(done); else await done;
        }
        console.log(JSON.stringify({ evt: 'book-cancel', outcome: 'ok', ref: row.id }));
        return json({ ok: true });
    } catch (e) {
        console.error('book/cancel: error: ' + truncate(e));
        return fail('internal', 500);
    }
}

export function onRequest(context) {
    return handleCancel(context);
}
