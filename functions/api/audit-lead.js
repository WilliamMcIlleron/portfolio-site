/**
 * Cloudflare Pages Function: POST /api/audit-lead
 *
 * Body: {"business","email","whatsapp"?,"reportId","turnstileToken"} (JSON, max 4 KB)
 * Answer: {"ok":true} or {"ok":false,"message":"<one sentence for the visitor>"}
 *
 * The report summary is read server-side from AUDITS report:{reportId}, never
 * taken from the request, so a lead cannot attach a made-up report. The lead
 * is stored in ENQUIRIES as form "audit-lead" with the contact fields, the
 * host and the summary only (check ids, pass/fail), then emailed through the
 * shared Resend path in _lib/enquiry.js (store first, so a mail failure never
 * loses a lead).
 *
 * Bindings: AUDITS (KV, required), TURNSTILE_SECRET (required), and at least
 * one of ENQUIRIES (KV) or RESEND_API_KEY + CONTACT_TO, so a lead always lands
 * somewhere. CONTACT_FROM optional.
 */

import { verifyTurnstile } from '../_lib/turnstile.js';
import { loadReport, REPORT_ID } from '../_lib/ratelimit.js';
import { summarise } from '../_lib/report.js';
import { storeThenEmail } from '../_lib/enquiry.js';
import { json, methodNotAllowed, readJsonBody, clientIp, truncate } from '../_lib/http.js';

const MAX_BODY = 4096;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/;
const PHONE = /^[+\d\s()-]{6,30}$/;

const LEAD_COPY = {
    malformed: 'Something was wrong with that request. Refresh the page and try again.',
    business: 'Add your business name.',
    email: "That email address doesn't look right.",
    whatsapp: "That WhatsApp number doesn't look right. Digits only, like 082 123 4567.",
    report: 'That report has expired or was never made. Run the check again, then send this form.',
    turnstile: "Couldn't confirm you're not a bot. Refresh the page and try again.",
    internal: 'Something broke on my side. Try again in a minute.',
};

const fail = (key, status) => json({ ok: false, message: LEAD_COPY[key] }, status);

/** Trim, drop control characters (no header or log tricks), cap the length. */
function clean(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);
}

export async function onRequestPost(context) {
    const { request } = context;
    const env = context.env || {};

    const parsed = await readJsonBody(request, MAX_BODY);
    if (!parsed.ok) return fail('malformed', parsed.error === 'too-large' ? 413 : 400);
    const b = parsed.data;

    const business = clean(b.business, 120);
    const email = clean(b.email, 254);
    const whatsapp = clean(b.whatsapp, 30);
    if (typeof b.reportId !== 'string' || !REPORT_ID.test(b.reportId)) return fail('report', 400);
    if (!business || business.length > 120) return fail('business', 400);
    if (!email || email.length > 254 || !EMAIL.test(email)) return fail('email', 400);
    if (whatsapp && (whatsapp.length > 30 || !PHONE.test(whatsapp))) return fail('whatsapp', 400);

    const canDeliver = env.ENQUIRIES || (env.RESEND_API_KEY && env.CONTACT_TO);
    if (!env.AUDITS || !env.TURNSTILE_SECRET || !canDeliver) {
        const missing = ['AUDITS', 'TURNSTILE_SECRET'].filter((k) => !env[k]);
        if (!canDeliver) missing.push('ENQUIRIES or RESEND_API_KEY+CONTACT_TO');
        console.error('audit-lead: missing bindings: ' + missing.join(', '));
        return fail('internal', 500);
    }

    const ts = await verifyTurnstile({ secret: env.TURNSTILE_SECRET, token: b.turnstileToken, ip: clientIp(request) });
    if (!ts.ok) {
        console.log(JSON.stringify({ evt: 'audit-lead', outcome: 'turnstile', codes: ts.codes }));
        return fail('turnstile', 403);
    }

    // The summary comes from our own store, never from the request.
    const report = await loadReport(env.AUDITS, b.reportId);
    if (!report || typeof report.host !== 'string' || !Array.isArray(report.working) || !Array.isArray(report.worth)) {
        console.log(JSON.stringify({ evt: 'audit-lead', outcome: 'no-report' }));
        return fail('report', 404);
    }
    const summary = summarise(report);
    const host = summary.host;

    const data = { business, email };
    if (whatsapp) data.whatsapp = whatsapp;

    const link = new URL('/check/' + b.reportId, request.url).toString();
    const fields = [
        { label: 'Business', value: business },
        { label: 'Email', value: email },
        ...(whatsapp ? [{ label: 'WhatsApp', value: whatsapp }] : []),
        { label: 'Site', value: host },
        { label: 'Report', value: link },
        { label: 'Worth fixing', value: summary.worth.join(', ') || 'nothing flagged' },
        { label: 'Working', value: summary.working.join(', ') || 'nothing passed' },
    ];

    try {
        await storeThenEmail(env, {
            form: 'audit-lead',
            data,
            fields,
            subject: 'Audit lead: ' + business + ' (' + host + ')',
            replyTo: email,
            extra: { host, reportId: b.reportId, summary },
        });
    } catch (e) {
        console.error('audit-lead: crashed: ' + truncate(e));
        return fail('internal', 500);
    }

    console.log(JSON.stringify({ evt: 'audit-lead', outcome: 'ok', host }));
    return json({ ok: true });
}

export function onRequest() {
    return methodNotAllowed('POST');
}
