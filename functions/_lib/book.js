/* ==========================================================================
   Booking helpers: field validation, tokens, calendar links, visitor-facing
   messages and the two emails. No onRequest* exports.
   ========================================================================== */

import { SLOT_MINUTES } from './book-config.js';
import { endOf, whenLabel } from './book-slots.js';
import { escapeHtml } from './enquiry.js';

export const SITE = 'https://williammcilleron.com';
export const NEEDS = {
    'site-check': 'A free check of my website',
    website: 'A new website',
    redesign: 'A redesign of my current site',
    fix: 'Fixing or speeding up my site',
    upkeep: 'Ongoing changes and upkeep',
    ads: 'Google or Meta ads',
    booking: 'A booking system',
    brand: 'A brand or logo',
    social: 'Social media',
    system: 'A system, integration or automation',
    other: 'Not sure yet',
};
export const needLabels = (keys) => keys.map((k) => NEEDS[k]).join(', ');

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
const PHONE = /^\+?[\d\s()-]{7,20}$/;

export const COPY = {
    malformed: 'Something was wrong with that request. Refresh the page and try again.',
    slot: "That time isn't available any more. Pick another one.",
    taken: 'Someone just took that time. Pick another one.',
    dayfull: 'That day is fully booked. Pick another day.',
    name: 'Add your name.',
    email: "That email address doesn't look right.",
    phone: "That number doesn't look right. Digits only, like 082 123 4567.",
    contact: 'Choose how you want me to call: WhatsApp or phone.',
    need: 'Pick at least one thing you want to talk about.',
    turnstile: "Couldn't confirm you're not a bot. Refresh the page and try again.",
    limit: "That's a lot of bookings from one place. Try again tomorrow, or email william@williammcilleron.com.",
    already: 'You already have two calls booked. Cancel one from its confirmation email, or email william@williammcilleron.com.',
    notfound: "That link doesn't match a booking. It may have been cancelled already.",
    past: 'That call has already happened or is about to start. Email william@williammcilleron.com instead.',
    internal: 'Something broke on my side. Try again in a minute, or email william@williammcilleron.com.',
};

/** Trim, drop control characters, collapse spaces, cap the length (+1 so an overlong value still fails the length check). */
export function clean(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);
}

/** Free-text version: keeps line breaks, still strips other control characters. */
function cleanNote(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max + 1);
}

/** @returns {{ok:true, v:object}|{ok:false, key:string}} */
export function validateBooking(b) {
    if (typeof b.hp === 'string' && b.hp !== '') return { ok: false, key: 'malformed' }; // honeypot
    const name = clean(b.name, 80);
    const email = clean(b.email, 254).toLowerCase();
    const phone = clean(b.phone, 20);
    const business = clean(b.business, 120);
    const note = cleanNote(b.note, 500);
    if (!name || name.length > 80) return { ok: false, key: 'name' };
    if (!email || email.length > 254 || !EMAIL.test(email)) return { ok: false, key: 'email' };
    if (b.contact !== 'whatsapp' && b.contact !== 'phone') return { ok: false, key: 'contact' };
    if (!phone || !PHONE.test(phone) || phone.replace(/\D/g, '').length < 9) return { ok: false, key: 'phone' };
    // `needs` is a list of topic keys. A lone `need` string is still accepted so a cached old page keeps working.
    const raw = Array.isArray(b.needs) ? b.needs : typeof b.need === 'string' ? [b.need] : null;
    if (!raw || raw.length < 1 || raw.length > Object.keys(NEEDS).length) return { ok: false, key: 'need' };
    if (!raw.every((k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(NEEDS, k))) return { ok: false, key: 'need' };
    const needs = Object.keys(NEEDS).filter((k) => raw.includes(k)); // de-duplicated, in a fixed order
    if (business.length > 120 || note.length > 500) return { ok: false, key: 'malformed' };
    return { ok: true, v: { name, email, phone, contact: b.contact, needs, business, note } };
}

/* ---- tokens and hashes ---------------------------------------------------- */

const B32 = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0 O 1 I L

export function newReference() {
    let out = '';
    while (out.length < 6) {
        for (const b of crypto.getRandomValues(new Uint8Array(12))) {
            if (b < 248 && out.length < 6) out += B32[b % 31]; // 248 = 8 * 31
        }
    }
    return 'WM-' + out;
}

export function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const TOKEN = /^[A-Za-z0-9_-]{32}$/;

export async function hmacHex(secret, text) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const hashToken = (secret, token) => hmacHex(secret, 'cancel:' + token);
export const hashIp = async (secret, ip) => (await hmacHex(secret, 'ip:' + (ip || 'unknown'))).slice(0, 32);

/* ---- calendar links (a pre-filled event in a new tab, never an .ics download) ---- */

const compact = (id) => id.replace(/[-:]/g, ''); // 20261123T133000Z

export function calendarLinks(start, { reference, contact, phone }) {
    const end = endOf(start);
    const how = contact === 'whatsapp' ? 'WhatsApp call' : 'phone call';
    const title = 'Call with William McIlleron';
    const details = `${SLOT_MINUTES} minute ${how} to ${phone}. Reference ${reference}. Cancel or change: email william@williammcilleron.com.`;
    const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
        action: 'TEMPLATE', text: title, dates: compact(start) + '/' + compact(end), details,
    }).toString();
    const outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?' + new URLSearchParams({
        path: '/calendar/action/compose', rru: 'addevent', subject: title, startdt: start, enddt: end, body: details,
    }).toString();
    return { google, outlook };
}

/* ---- emails --------------------------------------------------------------- */

const howLabel = (c) => (c === 'whatsapp' ? 'a WhatsApp call' : 'a phone call');

export function ownerEmail({ id, start, v, cancelUrl }) {
    const when = whenLabel(start);
    const rows = [
        ['When', when + ' (SAST), ' + SLOT_MINUTES + ' min'],
        ['Name', v.name],
        ['How', howLabel(v.contact) + ' to ' + v.phone],
        ['Email', v.email],
        ['Wants to talk about', needLabels(v.needs)],
        ...(v.business ? [['Business', v.business]] : []),
        ...(v.note ? [['Note', v.note]] : []),
        ['Reference', id],
    ];
    return {
        subject: `Call booked: ${v.name}, ${when}`,
        replyTo: v.email,
        text: rows.map(([k, val]) => `${k}: ${val}`).join('\n\n'),
        html: wrap('New call booked', rows),
    };
}

export function visitorEmail({ id, start, v, links, cancelUrl }) {
    const when = whenLabel(start);
    const intro = `Your ${SLOT_MINUTES} minute call with William is booked for ${when} (South African time). He will call you on ${v.contact === 'whatsapp' ? 'WhatsApp' : 'the phone'} at ${v.phone}.`;
    const lines = [
        intro,
        'Add it to your calendar:',
        'Google Calendar: ' + links.google,
        'Outlook: ' + links.outlook,
        'Need to cancel? ' + cancelUrl,
        'Reference: ' + id,
    ];
    const link = (href, label) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    const html =
        '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f">' +
        `<h2 style="margin:0 0 16px;font-size:18px">Your call is booked</h2><p>${escapeHtml(intro)}</p>` +
        `<p>Add it to your calendar: ${link(links.google, 'Google Calendar')} or ${link(links.outlook, 'Outlook')}.</p>` +
        `<p>Need to cancel? ${link(cancelUrl, 'Cancel this call')}</p>` +
        `<p style="color:#5d5a51">Reference ${escapeHtml(id)}</p></div>`;
    return { subject: `Your call with William: ${when}`, text: lines.join('\n\n'), html };
}

function wrap(title, rows) {
    return '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f">' +
        `<h2 style="margin:0 0 20px;font-size:18px">${escapeHtml(title)}</h2>` +
        rows.map(([k, val]) => '<p style="margin:0 0 16px"><strong style="display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5d5a51">' +
            escapeHtml(k) + '</strong>' + escapeHtml(val).replace(/\n/g, '<br>') + '</p>').join('') + '</div>';
}

export function cancelledEmail({ id, start, name }) {
    const when = whenLabel(start);
    return { subject: `Call cancelled: ${name}, ${when}`, text: `${name} cancelled the call on ${when}. Reference ${id}. The slot is open again.`, html: wrap('Call cancelled', [['When', when], ['Name', name], ['Reference', id]]) };
}
