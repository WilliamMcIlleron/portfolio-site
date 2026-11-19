/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Replaces Netlify Forms plus netlify/functions/submission-created.js.
 * Every enquiry is (1) stored in the ENQUIRIES KV namespace, then (2) emailed
 * to CONTACT_TO through Resend, then the visitor is redirected to /thanks.html.
 * That store-then-email path lives in _lib/enquiry.js, shared with
 * /api/audit-lead.
 * Storage comes first, so a Resend failure or a missing key loses a
 * notification, never an enquiry.
 *
 * Bindings and variables (Pages project > Settings):
 *   ENQUIRIES       KV namespace binding. Optional but strongly recommended.
 *   RESEND_API_KEY  secret. Without it the enquiry is stored and not emailed.
 *   CONTACT_TO      required to send. Where enquiries are delivered.
 *   CONTACT_FROM    optional. A sender on a Resend-verified domain. The default
 *                   Resend sender only delivers to your own Resend account.
 */

import { storeThenEmail } from '../_lib/enquiry.js';

// Field order in the email. This is a whitelist: a field not named here is
// never stored or sent, however faithfully the form submits it.
const LABELS = {
    name: 'Name',
    email: 'Email',
    business: 'Business',
    area: 'Works in',
    town: 'Shoots in',
    website: 'Current site',
    project: 'Project type',
    budget: 'Budget',
    message: 'Message',
    source: 'Came from'
};

// Form names are kept exactly as they were on Netlify.
const SUBJECTS = {
    'lumen-enquiry': 'Photographer enquiry',
    'portfolio-contact-form': 'Portfolio enquiry',
    'solar-enquiry': 'Solar enquiry',
    'skincare-enquiry': 'Skin & beauty enquiry'
};

const MAX_FIELD = 5000;

function thanks(request) {
    return Response.redirect(new URL('/thanks.html', request.url).toString(), 303);
}

export async function onRequestPost(context) {
    const { request, env } = context;

    let form;
    try {
        form = await request.formData();
    } catch (error) {
        return new Response('Bad request', { status: 400 });
    }

    // Honeypot: a person never fills this in. Pretend it worked.
    if (String(form.get('company') || '').trim()) return thanks(request);

    const formName = String(form.get('form-name') || '');
    const data = {};
    for (const key of Object.keys(LABELS)) {
        // Checkbox groups repeat the name; join them into one list.
        const values = form.getAll(key)
            .map(function (v) { return String(v).trim().slice(0, MAX_FIELD); })
            .filter(Boolean);
        if (values.length) data[key] = values.join(', ');
    }

    if (!Object.keys(data).length) return thanks(request);

    // Field rows for the email, in LABELS order.
    const fields = Object.keys(LABELS)
        .filter(function (key) { return data[key]; })
        .map(function (key) { return { label: LABELS[key], value: data[key] }; });

    const senderName = data.name || 'Someone';
    const qualifier = data.business || data.project || data.area || data.town;
    const subject = (SUBJECTS[formName] || 'Website enquiry') + ' — ' + senderName +
        (qualifier ? ' (' + qualifier + ')' : '');

    // Store first, then email (see _lib/enquiry.js).
    await storeThenEmail(env, { form: formName, data, fields, subject, replyTo: data.email });

    return thanks(request);
}

// Anything but POST is not a form submission.
export function onRequest() {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
