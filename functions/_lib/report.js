/* ==========================================================================
   Facts -> a report a business owner can read. Pure.

   Rules (from outreach-2026-12\AUDIT-TEMPLATE.md): every finding is one
   sentence about what a customer sees; no score, no percentages, no rand
   figures; builders and agencies are never named; "not found in your page's
   code" is never written as "you have no tracking".

   Order of fails is by how many customers they touch.
   ========================================================================== */

const ORDER = [
    'secure', 'phone_fit', 'one_tap', 'contact_details', 'booking',
    'search_text', 'business_details', 'tracking', 'current', 'speed',
];

const COPY = {
    secure: {
        pass: () => 'Your site opens on a secure (https) address.',
        fail: () => "Browsers show 'Not secure' next to your address before a customer sees the page.",
    },
    phone_fit: {
        pass: () => 'Your page is set up to fit a phone screen.',
        fail: () => 'On a phone your page loads at desktop size, so people have to pinch and zoom.',
    },
    one_tap: {
        pass: () => 'A phone visitor can call or WhatsApp you in one tap.',
        fail: () => 'A phone visitor has to copy your number out of the page to call you.',
    },
    contact_details: {
        pass: () => 'Your phone number or email is on the home page.',
        fail: () => "Your home page doesn't show a phone number or email.",
    },
    booking: {
        pass: () => "There's a way to book or enquire on the page.",
        fail: () => "Someone who finds you after hours can't book or leave an enquiry from your home page.",
    },
    search_text: {
        pass: (f) => `Google shows your page as: "${f.title}".`,
        fail: () => 'Google has to guess the text under your name in search results.',
    },
    business_details: {
        pass: (f) => `Your page tells Google it's a ${f.type}.`,
        fail: () => "Your page doesn't tell Google, in its own format, what kind of business you are or where.",
    },
    tracking: {
        pass: (f) => `Ad tracking found: ${f.found.join(', ')}.`,
        fail: () => "No ad tracking found in your page's code, so if you run ads you can't tell which one brought a customer.",
    },
    current: {
        pass: () => '',
        fail: (f) => `Your footer says © ${f.year}, which can make a business look closed.`,
    },
    speed: {
        pass: (f) => `Google's phone test: the main content appeared after ${f.lcp} s. One test run; it varies run to run.`,
        fail: (f) => `Google's phone test: the main content appeared after ${f.lcp} s. One test run; it varies run to run.`,
    },
};

export const CANT_SEE =
    "Whether you're running ads, your Google listing and reviews, your social pages, and how the site looks. I check those by hand.";

/** Format "19 Nov 2026, 14:32 (Johannesburg)". */
export function formatChecked(iso) {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' })
        .format(d).replace(/\./g, '');
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return `${date}, ${time} (Johannesburg)`;
}

/**
 * @param {object} p
 * @param {string} p.host
 * @param {object[]} p.facts          from runChecks()
 * @param {boolean} p.jsHeavy
 * @param {boolean} [p.truncated]     page was cut at 1.5 MB
 * @param {boolean} [p.partial]       the page stopped arriving part-way
 * @param {{lcp:number}|null} [p.speed]  from psi.js; null = did not finish, undefined = not asked
 * @param {string} p.checkedAt        ISO time
 */
export function buildReport({ host, facts, jsHeavy, truncated = false, partial = false, speed, checkedAt }) {
    const all = facts.filter((f) => f.id !== 'size');
    if (speed && typeof speed.lcp === 'number') {
        all.push({ id: 'speed', pass: speed.lcp <= 2.5, lcp: speed.lcp.toFixed(1) });
    }

    const working = [];
    const worth = [];
    const unclear = [];

    for (const id of ORDER) {
        const f = all.find((x) => x.id === id);
        if (!f) continue;
        const copy = COPY[id];
        if (f.pass === null) {
            if (id === 'tracking') {
                unclear.push({
                    id,
                    text: "Google Tag Manager is installed. What it loads can't be seen from outside, so I can't say which ads are tracked.",
                });
            }
            continue;
        }
        if (f.pass) {
            const text = copy.pass(f);
            if (text) working.push({ id, text });
        } else {
            worth.push({ id, text: copy.fail(f) });
        }
    }

    const size = facts.find((f) => f.id === 'size');
    const notes = [];
    if (size) {
        const line = `Your home page's HTML is ${size.kb} KB before images, with ${size.scripts} script${size.scripts === 1 ? '' : 's'}.`;
        if (size.large) worth.push({ id: 'size', text: line });
        else notes.push(line);
    }
    if (jsHeavy) notes.push('Your site builds most of the page with JavaScript, so some of these checks may miss things that are there.');
    if (truncated) notes.push('Your home page is very large, so only the first 1.5 MB was read.');
    if (partial) notes.push('Your page stopped arriving part-way, so these checks cover what was received.');
    if (speed === null) notes.push("Google's speed test didn't answer in time, so speed isn't in this report.");

    return {
        host,
        checkedAt,
        checkedLabel: formatChecked(checkedAt),
        working,
        worth,
        unclear,
        notes,
        cantSee: CANT_SEE,
    };
}

/** Compact summary stored with a lead: check ids and pass/fail only. */
export function summarise(report) {
    return {
        host: report.host,
        checkedAt: report.checkedAt,
        working: report.working.map((x) => x.id),
        worth: report.worth.map((x) => x.id),
        unclear: report.unclear.map((x) => x.id),
    };
}
