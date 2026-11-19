/* ==========================================================================
   Cloudflare Turnstile, server side. Fails closed: a missing secret, a
   missing token, a network error, a non-200 answer, bad JSON or anything but
   an explicit success:true all count as "not confirmed".

   Tokens are single use (Cloudflare enforces it), so never retry with the
   same token.
   ========================================================================== */

export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN = 2048; // real tokens are well under this; Cloudflare's own limit

/**
 * @param {object} p
 * @param {string} p.secret
 * @param {string} p.token
 * @param {string} [p.ip]
 * @param {typeof fetch} [p.fetch]
 * @returns {Promise<{ok:boolean, codes:string[]}>}
 */
export async function verifyTurnstile({ secret, token, ip, fetch: fetchImpl }) {
    if (!secret) return { ok: false, codes: ['missing-secret'] };
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) {
        return { ok: false, codes: ['missing-input-response'] };
    }
    const f = fetchImpl ?? globalThis.fetch;
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);
    try {
        const res = await f(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
        if (!res.ok) return { ok: false, codes: ['http-' + res.status] };
        const data = await res.json();
        if (data && data.success === true) return { ok: true, codes: [] };
        const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'].map(String).slice(0, 5) : [];
        return { ok: false, codes: codes.length ? codes : ['not-success'] };
    } catch (e) {
        return { ok: false, codes: ['network-error'] };
    }
}
