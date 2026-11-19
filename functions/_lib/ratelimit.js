/* ==========================================================================
   Soft rate limit and report cache in the AUDITS KV namespace.

   Keys never hold the raw IP: it is hashed with a secret salt and only the
   first 16 hex characters are kept.
     rl:{hash16}:{yyyymmddhh}   hour counter, limit 5,  TTL 2 h
     rl:{hash16}:{yyyymmdd}     day counter,  limit 20, TTL 26 h
     cache:{host}               report JSON,  TTL 1 h
     report:{reportId}          report JSON,  TTL 30 days (shareable link)

   KV is eventually consistent, so a burst from several edge locations can slip
   a request or two past the limit. That is accepted at this scale; a free WAF
   rate-limit rule on /api/audit is the hard backstop if it is ever needed.
   ========================================================================== */

export const HOUR_LIMIT = 5;
export const DAY_LIMIT = 20;
const HOUR_TTL = 2 * 3600;
const DAY_TTL = 26 * 3600;
export const CACHE_TTL = 3600;
export const REPORT_TTL = 30 * 24 * 3600;

export async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The 16-character IP fingerprint used in keys and logs. */
export async function ipHash(ip, salt) {
    return (await sha256Hex(String(ip || 'unknown') + String(salt || ''))).slice(0, 16);
}

const pad = (n) => String(n).padStart(2, '0');

export function hourStamp(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
}
export function dayStamp(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

async function readCount(kv, key) {
    const v = await kv.get(key);
    const n = Number.parseInt(v ?? '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Count one audit for this IP, unless it is already over a limit.
 * @returns {Promise<{ok:true, hash:string}|{ok:false, hash:string, retryAt:string, scope:'hour'|'day'}>}
 */
export async function checkRateLimit({ kv, ip, salt, now = new Date() }) {
    const hash = await ipHash(ip, salt);
    const hourKey = `rl:${hash}:${hourStamp(now)}`;
    const dayKey = `rl:${hash}:${dayStamp(now)}`;
    const [hour, day] = await Promise.all([readCount(kv, hourKey), readCount(kv, dayKey)]);

    if (day >= DAY_LIMIT) {
        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
        return { ok: false, hash, retryAt: next.toISOString(), scope: 'day' };
    }
    if (hour >= HOUR_LIMIT) {
        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1));
        return { ok: false, hash, retryAt: next.toISOString(), scope: 'hour' };
    }
    await Promise.all([
        kv.put(hourKey, String(hour + 1), { expirationTtl: HOUR_TTL }),
        kv.put(dayKey, String(day + 1), { expirationTtl: DAY_TTL }),
    ]);
    return { ok: true, hash };
}

/* ---- report cache and stored reports ------------------------------------ */

export async function getCachedReport(kv, host) {
    try {
        const v = await kv.get(`cache:${host}`);
        if (!v) return null;
        const r = JSON.parse(v);
        return r && typeof r === 'object' && typeof r.reportId === 'string' ? r : null;
    } catch {
        return null;
    }
}

/** Store the report for the shareable link (30 days) and the host cache (1 h). */
export async function storeReport(kv, host, report, { cache = true } = {}) {
    const json = JSON.stringify(report);
    const writes = [kv.put(`report:${report.reportId}`, json, { expirationTtl: REPORT_TTL })];
    if (cache) writes.push(kv.put(`cache:${host}`, json, { expirationTtl: CACHE_TTL }));
    await Promise.all(writes);
}

export const REPORT_ID = /^[A-Za-z0-9]{12}$/;

export async function loadReport(kv, id) {
    if (typeof id !== 'string' || !REPORT_ID.test(id)) return null;
    try {
        const v = await kv.get(`report:${id}`);
        return v ? JSON.parse(v) : null;
    } catch {
        return null;
    }
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** 12 random base62 characters (about 71 bits), rejection-sampled so there is no bias. */
export function newReportId(len = 12) {
    let out = '';
    while (out.length < len) {
        const bytes = crypto.getRandomValues(new Uint8Array(len * 2));
        for (const b of bytes) {
            if (b < 248 && out.length < len) out += BASE62[b % 62]; // 248 = 4 * 62
        }
    }
    return out;
}
