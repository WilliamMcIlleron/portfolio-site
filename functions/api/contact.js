/**
 * Cloudflare Pages Function: POST /api/contact
 *
 * Replaces Netlify Forms plus netlify/functions/submission-created.js.
 * Every enquiry is (1) stored in the ENQUIRIES KV namespace, then (2) emailed
 * to CONTACT_TO through Resend, then the visitor is redirected to /thanks.html.
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

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
}

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

    const received = new Date().toISOString();

    // 1. Store first.
    if (env.ENQUIRIES) {
        try {
            const id = received + '-' + crypto.randomUUID().slice(0, 8);
            await env.ENQUIRIES.put('enquiry:' + id, JSON.stringify({ received, form: formName, data }));
        } catch (error) {
            console.error('KV write failed:', error);
        }
    } else {
        console.warn('ENQUIRIES KV is not bound: enquiry will only be emailed.');
    }

    // 2. Email second.
    if (env.RESEND_API_KEY && env.CONTACT_TO) {
        const fields = Object.keys(LABELS)
            .filter(function (key) { return data[key]; })
            .map(function (key) { return { label: LABELS[key], value: data[key] }; });

        const senderName = data.name || 'Someone';
        const qualifier = data.business || data.project || data.area || data.town;
        const subject = (SUBJECTS[formName] || 'Website enquiry') + ' — ' + senderName +
            (qualifier ? ' (' + qualifier + ')' : '');

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
        if (data.email) body.reply_to = data.email;

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + env.RESEND_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                console.error('Resend rejected the message:', response.status, await response.text());
            }
        } catch (error) {
            console.error('Resend request failed:', error);
        }
    } else {
        console.warn('RESEND_API_KEY or CONTACT_TO missing: enquiry stored, not emailed.');
    }

    return thanks(request);
}

// Anything but POST is not a form submission.
export function onRequest() {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
