/* ==========================================================================
   Visitor-facing words for /api/audit: the progress steps and one sentence
   per failure (spec R2-A, "Failure handling"). No onRequest* exports.
   ========================================================================== */

export const STEPS = {
    open: 'Opening your page',
    phone: 'Reading it like a phone',
    buttons: 'Looking for call, WhatsApp and booking buttons',
    google: 'Checking what Google can read',
    speed: 'Asking Google how fast it loads (up to 20 s)',
};

/** "14:00" in Johannesburg time. */
function hhmm(iso) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
}

function describeType(type) {
    const t = String(type || '').toLowerCase().replace(/[^a-z0-9.+/-]/g, '').slice(0, 60);
    if (t === 'application/pdf') return 'PDF';
    if (t.startsWith('image/')) return 'picture';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('audio/')) return 'sound file';
    if (t === 'application/json') return 'data file';
    if (t === 'text/plain') return 'plain text file';
    if (t === 'application/zip') return 'zip file';
    return t ? t + ' file' : 'file of an unknown type';
}

/** The visitor-facing sentence for each failure (spec: failure table). */
export function errorMessage(code, d = {}) {
    const host = d.host || 'That site';
    switch (code) {
        case 'invalid': return "That doesn't look like a web address. Try something like yourbusiness.co.za.";
        case 'blocked': return 'I can only check public websites.';
        case 'dns': return `I couldn't find a website at ${host}. Check the spelling?`;
        case 'timeout': return `${host} didn't answer within 15 seconds, so there was nothing to check. A customer on a phone would usually give up sooner.`;
        case 'http':
            if (d.redirects) return `${host} kept sending the check to another address, so there was no page to check.`;
            return `${host} answered with an error (${d.status}), so there was no page to check.`;
        case 'blocked-by-site': return `${host} blocks automated checks, so I can't read it from here. I can check it by hand.`;
        case 'not-html': return `That address isn't a web page (it's a ${describeType(d.type)}).`;
        case 'rate':
            if (d.scope === 'day') return `That's the limit of 20 checks a day from one connection. Try again after ${hhmm(d.retryAt)}, or send me the address and I'll check it by hand.`;
            return `That's the limit of 5 checks an hour from one connection. Try again after ${hhmm(d.retryAt)}, or send me the address and I'll check it by hand.`;
        case 'turnstile': return "Couldn't confirm you're not a bot. Refresh the page and try again.";
        default: return 'Something broke on my side. Try again in a minute, or send me the address.';
    }
}
