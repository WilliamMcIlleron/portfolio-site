/**
 * Cloudflare Pages Function: GET /api/check/{reportId}
 *
 * Returns a stored report (JSON) for the shareable page at /check/{reportId}.
 * Reports live in AUDITS as report:{id} for 30 days and hold only the report
 * JSON, never the fetched page. Anything that is not a 12-character base62 id,
 * or has expired, is a 404. Never cached, never indexed.
 */

import { loadReport, REPORT_ID } from '../../_lib/ratelimit.js';
import { json, methodNotAllowed } from '../../_lib/http.js';

const HEADERS = { 'x-robots-tag': 'noindex' };

export async function onRequestGet(context) {
    const env = context.env || {};
    const id = context.params?.id;
    if (typeof id !== 'string' || !REPORT_ID.test(id)) {
        return json({ ok: false, message: 'Report not found.' }, 404, HEADERS);
    }
    if (!env.AUDITS) {
        console.error('check: missing bindings: AUDITS');
        return json({ ok: false, message: 'Something broke on my side. Try again in a minute.' }, 500, HEADERS);
    }
    const report = await loadReport(env.AUDITS, id);
    if (!report) return json({ ok: false, message: 'Report not found.' }, 404, HEADERS);
    return json(report, 200, HEADERS);
}

export function onRequest() {
    return methodNotAllowed('GET');
}
