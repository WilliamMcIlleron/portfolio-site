/**
 * Netlify invokes this automatically whenever a form submission is accepted
 * (the name `submission-created` is what wires it up — nothing else references it).
 *
 * It forwards the enquiry to your inbox via Resend, with Reply-To set to the
 * sender so you can answer straight from your mail client.
 *
 * Environment variables (Netlify → Site configuration → Environment variables):
 *   RESEND_API_KEY  required — from resend.com/api-keys
 *   CONTACT_TO      optional — defaults to the address below
 *   CONTACT_FROM    optional — defaults to Resend's shared sender, which can
 *                              only deliver to your own Resend account address.
 *                              Set this once you've verified a domain.
 *
 * Submissions are stored in the Netlify dashboard either way, so a missing key
 * loses a notification, never an enquiry.
 */

const TO = process.env.CONTACT_TO || 'williamjonahmci@gmail.com';
const FROM = process.env.CONTACT_FROM || 'Portfolio <onboarding@resend.dev>';

const LABELS = {
    name: 'Name',
    email: 'Email',
    project: 'Project type',
    message: 'Message'
};

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
}

exports.handler = async function (event) {
    if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY is not set — submission stored but no email sent.');
        return { statusCode: 200, body: 'skipped' };
    }

    let data;
    try {
        data = (JSON.parse(event.body).payload || {}).data || {};
    } catch (error) {
        console.error('Could not parse submission payload:', error);
        return { statusCode: 400, body: 'bad payload' };
    }

    const fields = Object.keys(LABELS)
        .filter(function (key) { return data[key]; })
        .map(function (key) { return { label: LABELS[key], value: String(data[key]).trim() }; });

    if (!fields.length) {
        return { statusCode: 200, body: 'empty submission' };
    }

    const senderName = data.name || 'Someone';
    const subject = 'Portfolio enquiry — ' + senderName + (data.project ? ' (' + data.project + ')' : '');

    const text = fields
        .map(function (f) { return f.label + ': ' + f.value; })
        .join('\n\n');

    const html =
        '<div style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#15140f">' +
        '<h2 style="margin:0 0 20px;font-size:18px">New enquiry from your portfolio</h2>' +
        fields.map(function (f) {
            return '<p style="margin:0 0 16px">' +
                '<strong style="display:block;font-size:12px;letter-spacing:.08em;' +
                'text-transform:uppercase;color:#5d5a51">' + escapeHtml(f.label) + '</strong>' +
                escapeHtml(f.value).replace(/\n/g, '<br>') +
                '</p>';
        }).join('') +
        '</div>';

    const body = {
        from: FROM,
        to: [TO],
        subject: subject,
        text: text,
        html: html
    };

    // Lets you hit Reply and reach the client directly.
    if (data.email) body.reply_to = String(data.email).trim();

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error('Resend rejected the message:', response.status, detail);
        return { statusCode: 502, body: 'send failed' };
    }

    return { statusCode: 200, body: 'sent' };
};
