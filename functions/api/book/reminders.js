/**
 * Cloudflare Pages Function: POST /api/book/reminders
 *
 * Called every 15 minutes by the cron Worker in workers/booking-cron/ (Pages Functions cannot run
 * on a schedule themselves). It does two jobs and answers {ok, sent, failed, purged}:
 *   1. Emails each visitor a reminder shortly before their call (see reminderDueMs in
 *      _lib/book-slots.js for exactly when), once only.
 *   2. Deletes bookings whose call was more than RETENTION_DAYS ago: the promise made on /book/.
 *
 * Authenticated with a shared secret in the x-reminder-secret header, so the public cannot
 * trigger it. Bindings: DB (D1), REMINDER_SECRET (secret), RESEND_API_KEY and CONTACT_FROM for
 * the email. The reminder is claimed in the database before it is sent, so two overlapping runs
 * cannot send it twice; if the send fails the claim is released and the next run retries.
 */

import { json, methodNotAllowed, truncate } from '../../_lib/http.js';
import { sha256Hex } from '../../_lib/ratelimit.js';
import { reminderDueMs } from '../../_lib/book-slots.js';
import { REMINDER_HOURS_BEFORE, RETENTION_DAYS } from '../../_lib/book-config.js';
import { reminderEmail } from '../../_lib/book.js';
import { sendMail } from '../../_lib/mail.js';

const MS_HOUR = 3600000;
const MS_DAY = 86400000;
// Slots are stored as '...:00Z' with no milliseconds, and the database compares them as text, so every
// bound has to be written the same way ('.000Z' would sort after 'Z' and break the edges).
const stamp = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

export async function handleReminders(context, now = new Date()) {
    const { request } = context;
    const env = context.env || {};
    if (!env.DB || !env.REMINDER_SECRET) {
        console.error('book/reminders: missing bindings');
        return json({ ok: false }, 500);
    }
    // Hash both sides first so the comparison does not leak how much of the secret matched.
    const [given, wanted] = await Promise.all([sha256Hex(request.headers.get('x-reminder-secret') || ''), sha256Hex(env.REMINDER_SECRET)]);
    if (given !== wanted) return json({ ok: false }, 401);

    let sent = 0, failed = 0, purged = 0;
    try {
        const cutoff = stamp(now.getTime() - RETENTION_DAYS * MS_DAY);
        const del = await env.DB.prepare('DELETE FROM bookings WHERE slot_start < ?').bind(cutoff).run();
        purged = del?.meta?.changes ?? 0;

        const upcoming = await env.DB.prepare(
            "SELECT id, slot_start, name, phone, contact, email, topic, answers_json FROM bookings " +
            "WHERE status = 'booked' AND reminded_at IS NULL AND slot_start > ? AND slot_start <= ?"
        ).bind(stamp(now.getTime()), stamp(now.getTime() + REMINDER_HOURS_BEFORE * MS_HOUR)).all();

        for (const r of upcoming.results || []) {
            if (reminderDueMs(r.slot_start) > now.getTime()) continue; // not time yet (e.g. a 09:00 call waits for 07:00)
            const claim = await env.DB.prepare("UPDATE bookings SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL AND status = 'booked'").bind(now.toISOString(), r.id).run();
            if (!(claim?.meta?.changes > 0)) continue; // another run already took it
            let needs = [];
            try { needs = JSON.parse(r.answers_json).needs || []; } catch { /* old row */ }
            if (!needs.length) needs = String(r.topic || '').split(',').filter(Boolean);
            const result = await sendMail(env, { to: r.email, ...reminderEmail({ start: r.slot_start, name: r.name, phone: r.phone, contact: r.contact, needs }) });
            if (result === 'sent') {
                sent++;
            } else {
                failed++;
                await env.DB.prepare('UPDATE bookings SET reminded_at = NULL WHERE id = ?').bind(r.id).run(); // let the next run retry
            }
        }
    } catch (e) {
        console.error('book/reminders: error: ' + truncate(e));
        return json({ ok: false, sent, failed, purged }, 500);
    }
    console.log(JSON.stringify({ evt: 'book-reminders', sent, failed, purged }));
    return json({ ok: true, sent, failed, purged });
}

export function onRequestPost(context) {
    return handleReminders(context);
}

export function onRequest() {
    return methodNotAllowed('POST');
}
