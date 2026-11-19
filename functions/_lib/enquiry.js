/* ==========================================================================
   Store first, then email. Lifted unchanged from functions/api/contact.js so
   /api/contact and /api/audit-lead share one path.

   Every enquiry is (1) stored in the ENQUIRIES KV namespace, then (2) emailed
   to CONTACT_TO through Resend, then (3) stored again with the email outcome.
   Storage comes first, so a Resend failure or a missing key loses a
   notification, never an enquiry.

   Bindings: ENQUIRIES (KV, optional but strongly recommended), RESEND_API_KEY
   (secret), CONTACT_TO (required to send), CONTACT_FROM (optional).
   No onRequest* exports, so Pages never turns this file into a route.
   ========================================================================== */

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
}

/**
 * @param {object} env
 * @param {object} p
 * @param {string} p.form                 form name stored on the record
 * @param {object} p.data                 the whitelisted fields, stored as-is
 * @param {{label:string,value:string}[]} p.fields  rows for the email, in order
 * @param {string} p.subject
 * @param {string} [p.replyTo]            Reply in the inbox reaches this address
 * @param {object} [p.extra]              more top-level record fields (e.g. host, summary)
 * @returns {Promise<{key:string, record:object}>}
 */
export async function storeThenEmail(env, { form, data, fields, subject, replyTo, extra = {} }) {
    const received = new Date().toISOString();

    // 1. Store first. The record is updated with the email outcome below, so a
    // failed or skipped notification is visible in storage, not only in logs.
    const key = 'enquiry:' + received + '-' + crypto.randomUUID().slice(0, 8);
    const record = { received, form, data, ...extra, email: 'pending' };
    async function save() {
        if (!env.ENQUIRIES) return;
        try {
            await env.ENQUIRIES.put(key, JSON.stringify(record));
        } catch (error) {
            console.error('KV write failed:', error);
        }
    }
    if (env.ENQUIRIES) {
        await save();
    } else {
        console.warn('ENQUIRIES KV is not bound: enquiry will only be emailed.');
    }

    // 2. Email second.
    if (env.RESEND_API_KEY && env.CONTACT_TO) {
        const text = fields.map(function (f) { return f.label + ': ' + f.value; }).join('\n\n');
        const html =
            '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f">' +
            '<h2 style="margin:0 0 20px;font-size:18px">New enquiry from your portfolio</h2>' +
            fields.map(function (f) {
                return '<p style="margin:0 0 16px">' +
                    '<strong style="display:block;font-size:12px;letter-spacing:.08em;' +
                    'text-transform:uppercase;color:#5d5a51">' + escapeHtml(f.label) + '</strong>' +
                    escapeHtml(f.value).replace(/\n/g, '<br>') + '</p>';
            }).join('') + '</div>';

        const body = {
            from: env.CONTACT_FROM || 'Portfolio <onboarding@resend.dev>',
            to: [env.CONTACT_TO],
            subject: subject,
            text: text,
            html: html
        };
        // Hit Reply and reach the client directly.
        if (replyTo) body.reply_to = replyTo;

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + env.RESEND_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                record.email = 'sent';
            } else {
                const detail = (await response.text()).slice(0, 300);
                console.error('Resend rejected the message:', response.status, detail);
                record.email = 'failed: ' + response.status + ' ' + detail;
            }
        } catch (error) {
            console.error('Resend request failed:', error);
            record.email = 'failed: ' + String(error && error.message || error).slice(0, 300);
        }
    } else {
        console.warn('RESEND_API_KEY or CONTACT_TO missing: enquiry stored, not emailed.');
        record.email = 'skipped: ' + (env.RESEND_API_KEY ? '' : 'no RESEND_API_KEY ') + (env.CONTACT_TO ? '' : 'no CONTACT_TO');
    }
    await save();

    return { key, record };
}
