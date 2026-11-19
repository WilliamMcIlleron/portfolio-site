/* ==========================================================================
   Google PageSpeed Insights, phone strategy. Google fetches the site, not us,
   so this adds no SSRF surface. Returns Largest Contentful Paint in seconds
   (one decimal) or null when the test fails, is slow, or has no LCP.

   Capped at 22 s. A null makes the report say Google's speed test didn't
   answer in time (report.js handles speed:null).
   The API key is never logged or returned.
   ========================================================================== */

export const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
export const PSI_TIMEOUT_MS = 22000;

/**
 * @param {string} url      the final, already validated page URL
 * @param {object} p
 * @param {string} p.key
 * @param {typeof fetch} [p.fetch]
 * @param {number} [p.timeoutMs]
 * @returns {Promise<number|null>}
 */
export async function fetchLcp(url, { key, fetch: fetchImpl, timeoutMs = PSI_TIMEOUT_MS } = {}) {
    if (!key || !url) return null;
    const f = fetchImpl ?? globalThis.fetch;
    const q = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', key });
    try {
        const res = await f(`${PSI_ENDPOINT}?${q}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            await res.body?.cancel?.().catch?.(() => {});
            return null;
        }
        const data = await res.json();
        const ms = data?.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue;
        if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null;
        return Math.round(ms / 100) / 10;
    } catch {
        return null;
    }
}
