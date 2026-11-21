/* ==========================================================================
   One email through Resend, for the booking endpoints. Never throws: a failed
   or skipped email must not undo a booking that is already saved.
   No onRequest* exports.
   ========================================================================== */

/**
 * @returns {Promise<'sent'|string>} 'sent', or a short reason it was not
 */
export async function sendMail(env, { to, subject, text, html, replyTo }) {
    if (!env.RESEND_API_KEY || !to) return 'skipped';
    const body = { from: env.CONTACT_FROM || 'William McIlleron <onboarding@resend.dev>', to: [to], subject, text, html };
    if (replyTo) body.reply_to = replyTo;
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return 'sent';
        console.error('booking mail: Resend rejected the message: ' + res.status);
        return 'failed: ' + res.status;
    } catch (e) {
        console.error('booking mail: request failed');
        return 'failed: network';
    }
}
