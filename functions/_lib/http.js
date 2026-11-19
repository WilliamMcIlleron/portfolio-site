/* ==========================================================================
   Small request and response helpers shared by the audit endpoints.
   No onRequest* exports, so Pages never turns this file into a route.
   ========================================================================== */

export function json(data, status = 200, extra = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
    });
}

export function methodNotAllowed(allow = 'POST') {
    return json({ ok: false, message: 'Method not allowed' }, 405, { allow });
}

/**
 * Read a JSON object body, stopping at maxBytes however the client lies about
 * Content-Length.
 * @returns {Promise<{ok:true, data:object}|{ok:false, error:'too-large'|'malformed'}>}
 */
export async function readJsonBody(request, maxBytes) {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > maxBytes) return { ok: false, error: 'too-large' };
    const reader = request.body?.getReader?.();
    if (!reader) return { ok: false, error: 'malformed' };
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel().catch(() => {});
                return { ok: false, error: 'too-large' };
            }
            chunks.push(value);
        }
    } catch {
        return { ok: false, error: 'malformed' };
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    let data;
    try {
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf));
    } catch {
        return { ok: false, error: 'malformed' };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'malformed' };
    return { ok: true, data };
}

export function clientIp(request) {
    return request.headers.get('cf-connecting-ip') || '';
}

export function truncate(value, n = 200) {
    return String(value && value.message ? value.message : value).slice(0, n);
}
