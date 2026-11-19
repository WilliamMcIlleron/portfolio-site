/* ==========================================================================
   The checks. Pure: (html string, final URL, extras) -> facts.

   Only things the HTML and headers can prove. No scoring, no judgement of
   design, no claims about ads actually running. The wording lives in
   report.js; this file only says what was found.

   Parsing is a small dependency-free scanner on purpose: HTMLRewriter exists
   only inside Workers, and these functions must run unchanged in node --test.
   The page is already capped at 1.5 MB before it gets here.
   ========================================================================== */

const MAX_SCAN = 1.5 * 1024 * 1024;

/** Remove script, style, noscript and comments; return visible text. */
export function visibleText(html) {
    let s = html.length > MAX_SCAN ? html.slice(0, MAX_SCAN) : html;
    s = s
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ');
    s = s
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&copy;|&#169;/gi, '©')
        .replace(/&lt;|&gt;|&quot;|&#39;|&apos;/gi, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

/** All opening tags of a given name, as attribute maps. */
function tags(html, name) {
    const out = [];
    const re = new RegExp('<' + name + '\\b([^>]*)>', 'gi');
    let m;
    while ((m = re.exec(html))) out.push(attrs(m[1]));
    return out;
}

function attrs(src) {
    const o = {};
    const re = /([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let m;
    while ((m = re.exec(src))) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    return o;
}

function cap(str, n) {
    const s = String(str ?? '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/* ---- the ten checks ----------------------------------------------------- */

const PHONE = /(\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const BOOKING = /(calendly|setmore|booksy|fresha|dineplan|simplybook|opentable|resos\.com|acuityscheduling|book\s*now|book\s*online|book\s*an?\s*appointment|make\s*a\s*booking|book\s*a\s*table|reserve\s*a\s*table|request\s*a\s*quote|get\s*a\s*quote)/i;

function checkViewport(html) {
    const m = tags(html, 'meta').find((t) => (t.name || '').toLowerCase() === 'viewport');
    return { id: 'phone_fit', pass: !!m && /width\s*=\s*device-width/i.test(m.content || '') };
}

function checkOneTap(html) {
    const links = tags(html, 'a').map((t) => t.href || '');
    const hit = links.some((h) => /^tel:/i.test(h) || /wa\.me\//i.test(h) || /api\.whatsapp\.com/i.test(h) || /^whatsapp:\/\//i.test(h));
    return { id: 'one_tap', pass: hit };
}

function checkContactDetails(html, text) {
    const mailto = tags(html, 'a').some((t) => /^mailto:/i.test(t.href || ''));
    return { id: 'contact_details', pass: PHONE.test(text) || EMAIL.test(text) || mailto };
}

function checkBooking(html, text) {
    const hrefs = tags(html, 'a').map((t) => t.href || '').concat(tags(html, 'iframe').map((t) => t.src || ''));
    const hasHref = hrefs.some((h) => BOOKING.test(h));
    const formWithInput = /<form\b[\s\S]*?<\/form\s*>/gi;
    let hasForm = false;
    let m;
    while ((m = formWithInput.exec(html))) {
        const inputs = tags(m[0], 'input');
        if (inputs.some((i) => ['', 'text', 'email', 'tel'].includes((i.type || '').toLowerCase())) || /<textarea\b/i.test(m[0])) {
            hasForm = true;
            break;
        }
    }
    return { id: 'booking', pass: hasHref || hasForm || BOOKING.test(text) };
}

function checkSearchText(html) {
    const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
    const title = cap(t ? visibleText(t[1]) : '', 70);
    const desc = tags(html, 'meta').find((x) => (x.name || '').toLowerCase() === 'description');
    const hasDesc = !!desc && (desc.content || '').trim().length > 0;
    return { id: 'search_text', pass: !!title && hasDesc, title, hasTitle: !!title, hasDescription: hasDesc };
}

function collectTypes(node, out) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, out)); return; }
    const t = node['@type'];
    if (typeof t === 'string') out.push(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.push(x));
    if (node['@graph']) collectTypes(node['@graph'], out);
}

function checkBusinessDetails(html) {
    const types = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = re.exec(html))) {
        if (!/application\/ld\+json/i.test(attrs(m[1]).type || '')) continue;
        try { collectTypes(JSON.parse(m[2]), types); } catch { /* invalid JSON-LD counts as absent */ }
    }
    return { id: 'business_details', pass: types.length > 0, type: cap(types[0] || '', 40) };
}

function checkTracking(html) {
    const found = [];
    if (/fbq\s*\(|connect\.facebook\.net\/[^"']*fbevents\.js|fbevents\.js/i.test(html)) found.push('Meta pixel');
    if (/gtag\s*\(|googletagmanager\.com\/gtag\/js|google-analytics\.com\/analytics\.js/i.test(html)) found.push('Google tag');
    if (/AW-\d{6,}|googleadservices\.com/i.test(html)) found.push('Google Ads');
    const gtm = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(html);
    return {
        id: 'tracking',
        pass: found.length > 0 ? true : gtm ? null : false, // null: Tag Manager only, cannot see what it loads
        found,
        gtmOnly: found.length === 0 && gtm,
    };
}

function checkCurrent(text, thisYear) {
    let max = 0;
    const re = /(?:©|copyright|&copy;)\s*(?:\(c\)\s*)?(?:20\d{2}\s*[-–]\s*)?(20\d{2})/gi;
    let m;
    while ((m = re.exec(text))) max = Math.max(max, Number(m[1]));
    const stale = max > 0 && thisYear - max >= 2;
    return { id: 'current', pass: !stale, year: max || null };
}

function checkSize(html, bytes) {
    const scripts = tags(html, 'script').filter((t) => t.src).length;
    const b = bytes || new TextEncoder().encode(html).length;
    return { id: 'size', kb: Math.round(b / 1024), scripts, large: b > 500 * 1024 };
}

/**
 * @param {object} p
 * @param {string} p.html
 * @param {string} p.finalUrl
 * @param {boolean|null} [p.httpRedirects]  does http://host/ send people to https
 * @param {number} [p.bytes]
 * @param {number} [p.year]                 injectable for tests
 */
export function runChecks({ html, finalUrl, httpRedirects = null, bytes, year = new Date().getFullYear() }) {
    const text = visibleText(html);
    const secureFinal = /^https:/i.test(finalUrl);
    const facts = [
        { id: 'secure', pass: secureFinal && httpRedirects !== false },
        checkViewport(html),
        checkOneTap(html),
        checkContactDetails(html, text),
        checkBooking(html, text),
        checkSearchText(html),
        checkBusinessDetails(html),
        checkTracking(html),
        checkCurrent(text, year),
        checkSize(html, bytes),
    ];
    const scripts = facts.find((f) => f.id === 'size').scripts;
    const jsHeavy = text.length < 200 && scripts > 10;
    return { facts, jsHeavy };
}
