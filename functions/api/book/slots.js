/**
 * Cloudflare Pages Function: GET /api/book/slots
 *
 * Answer: {ok:true, days:[{date:'2026-11-23', label:'Mon 23 Nov',
 *   slots:[{start:'2026-11-23T13:30:00Z', time:'15:30'}]}]}
 * Times in `time` are South African time. Days with nothing open are left out.
 * Bindings: DB (D1, required). GOOGLE_SERVICE_ACCOUNT + GOOGLE_CALENDAR_ID (optional): also hides
 * times that clash with events on William's Google Calendar.
 */

import { json, methodNotAllowed, truncate } from '../../_lib/http.js';
import { openDays, queryRange } from '../../_lib/book-slots.js';
import { COPY } from '../../_lib/book.js';
import { gcalEnabled, busyIntervals } from '../../_lib/gcal.js';

export async function handleSlots(context, now = new Date()) {
    const env = context.env || {};
    if (!env.DB) {
        console.error('book/slots: missing binding: DB');
        return json({ ok: false, message: COPY.internal }, 500);
    }
    try {
        const { from, to } = queryRange(now);
        const rows = await env.DB.prepare("SELECT slot_start FROM bookings WHERE status = 'booked' AND slot_start >= ? AND slot_start <= ?").bind(from, to).all();
        const taken = new Set((rows.results || []).map((r) => r.slot_start));
        // Times that clash with an event on William's calendar are not offered. If Google does
        // not answer, offer the normal list: the booking step checks again, and a clash costs one
        // reschedule, where an empty page costs a booking.
        let busy = [];
        if (gcalEnabled(env)) {
            try { busy = await busyIntervals(env, from, to, { nowMs: now.getTime() }); }
            catch (e) { console.error('book/slots: google calendar unavailable: ' + truncate(e)); }
        }
        return json({ ok: true, days: openDays(now, taken, busy) });
    } catch (e) {
        console.error('book/slots: database error: ' + truncate(e));
        return json({ ok: false, message: COPY.internal }, 500);
    }
}

export function onRequestGet(context) {
    return handleSlots(context);
}

export function onRequest() {
    return methodNotAllowed('GET');
}
