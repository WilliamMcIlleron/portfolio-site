/**
 * Cloudflare Pages Function: POST /api/book
 *
 * Body (JSON, max 4 KB): {slot, name, email, phone, contact:'whatsapp'|'phone',
 *   needs:[topic keys, at least one], business?, note?, hp, turnstileToken}
 * Answer: {ok:true, reference, start, end, when, cancelUrl, calendar:{google,outlook}}
 *      or {ok:false, message:"<one sentence for the visitor>"}
 *
 * The slot is checked against the hours in _lib/book-config.js, never trusted.
 * The unique index on bookings(slot_start) (migrations/0001_bookings.sql) is
 * what stops two people holding the same time: the second INSERT fails and the
 * visitor is told to pick another. Emails go out after the row is saved, and a
 * failed email never undoes a booking.
 *
 * Bindings: DB (D1, required), BOOKING_SECRET (secret, required),
 * TURNSTILE_SECRET (required). RESEND_API_KEY, CONTACT_TO, CONTACT_FROM and
 * SITE_URL are optional; without the first two no email is sent.
 */

import { verifyTurnstile } from '../_lib/turnstile.js';
import { json, methodNotAllowed, readJsonBody, clientIp, truncate } from '../_lib/http.js';
import { isBookable, endOf, whenLabel } from '../_lib/book-slots.js';
import {
    COPY, SITE, validateBooking, newReference, newToken, hashToken, hashIp,
    calendarLinks, ownerEmail, visitorEmail,
} from '../_lib/book.js';
import { sendMail } from '../_lib/mail.js';

const MAX_BODY = 4096;
const IP_PER_DAY = 3;
const ACTIVE_PER_EMAIL = 2;

const fail = (key, status) => json({ ok: false, message: COPY[key] }, status);

export async function handleBooking(context, now = new Date()) {
    const { request } = context;
    const env = context.env || {};

    if (!env.DB || !env.BOOKING_SECRET || !env.TURNSTILE_SECRET) {
        const missing = ['DB', 'BOOKING_SECRET', 'TURNSTILE_SECRET'].filter((k) => !env[k]);
        console.error('book: missing bindings: ' + missing.join(', '));
        return fail('internal', 500);
    }

    const parsed = await readJsonBody(request, MAX_BODY);
    if (!parsed.ok) return fail('malformed', parsed.error === 'too-large' ? 413 : 400);
    const b = parsed.data;

    const check = validateBooking(b);
    if (!check.ok) return fail(check.key, 400);
    const v = check.v;
    if (!isBookable(b.slot, now)) return fail('slot', 409);
    const start = b.slot;

    const ip = clientIp(request);
    const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: b.turnstileToken, ip });
    if (!ts.ok) {
        console.log(JSON.stringify({ evt: 'book', outcome: 'turnstile', codes: ts.codes }));
        return fail('turnstile', 403);
    }

    const id = newReference();
    const token = newToken();
    try {
        const ipHash = await hashIp(env.BOOKING_SECRET, ip);
        const since = new Date(now.getTime() - 24 * 3600000).toISOString();
        const recent = await env.DB.prepare('SELECT COUNT(*) AS c FROM bookings WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first();
        if ((recent?.c ?? 0) >= IP_PER_DAY) return fail('limit', 429);
        const active = await env.DB.prepare("SELECT COUNT(*) AS c FROM bookings WHERE email = ? AND status = 'booked' AND slot_start > ?").bind(v.email, now.toISOString()).first();
        if ((active?.c ?? 0) >= ACTIVE_PER_EMAIL) return fail('already', 409);

        const answers = JSON.stringify({ needs: v.needs, business: v.business || undefined, note: v.note || undefined });
        try {
            await env.DB.prepare(
                'INSERT INTO bookings (id, slot_start, name, email, phone, contact, topic, answers_json, status, cancel_token_hash, ip_hash, created_at) ' +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?)"
            ).bind(id, start, v.name, v.email, v.phone, v.contact, v.needs.join(','), answers, await hashToken(env.BOOKING_SECRET, token), ipHash, now.toISOString()).run();
        } catch (e) {
            if (/UNIQUE|constraint/i.test(String(e && e.message))) {
                console.log(JSON.stringify({ evt: 'book', outcome: 'taken' }));
                return fail('taken', 409);
            }
            throw e;
        }
    } catch (e) {
        console.error('book: database error: ' + truncate(e));
        return fail('internal', 500);
    }

    const site = (env.SITE_URL || SITE).replace(/\/+$/, '');
    const cancelUrl = site + '/book/cancel/?t=' + token;
    const links = calendarLinks(start, { reference: id, contact: v.contact, phone: v.phone });

    // Saved. Now tell both people; a failure here is logged, never surfaced.
    const owner = ownerEmail({ id, start, v, cancelUrl });
    const visitor = visitorEmail({ id, start, v, links, cancelUrl });
    const mail = Promise.all([
        env.CONTACT_TO ? sendMail(env, { to: env.CONTACT_TO, ...owner }) : 'skipped',
        sendMail(env, { to: v.email, ...visitor }),
    ]).catch(() => null);
    if (typeof context.waitUntil === 'function') context.waitUntil(mail); else await mail;

    console.log(JSON.stringify({ evt: 'book', outcome: 'ok', ref: id }));
    return json({ ok: true, reference: id, start, end: endOf(start), when: whenLabel(start), cancelUrl, calendar: links });
}

export function onRequestPost(context) {
    return handleBooking(context);
}

export function onRequest() {
    return methodNotAllowed('POST');
}
