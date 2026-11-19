import test from 'node:test';
import assert from 'node:assert/strict';
import { runChecks, visibleText } from '../functions/_lib/checks.js';
import { buildReport, summarise, formatChecked, CANT_SEE } from '../functions/_lib/report.js';

/* Twelve fixtures. Each is a small real-shaped home page that exercises one or
   two checks. YEAR is pinned so the "kept current" test never ages. */
const YEAR = 2026;
const page = (head = '', body = '') =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

const F = {
    // 1. Everything in place.
    good: page(
        `<title>Blue Line Pool Care | Pool service in Pretoria East</title>
         <meta name="viewport" content="width=device-width, initial-scale=1">
         <meta name="description" content="Weekly pool service.">
         <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Blue Line"}</script>
         <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script>
         <script>window.dataLayer=[];function gtag(){dataLayer.push(arguments)}gtag('config','G-ABC123DEF4');</script>`,
        `<a href="tel:+27821234567">Call 082 123 4567</a> <a href="https://wa.me/27821234567">WhatsApp</a>
         <form action="/enquire"><input type="text" name="n"><button>Send</button></form>
         <footer>&copy; 2026 Blue Line Pool Care</footer>`,
    ),
    // 2. A bare page: nothing helps a customer.
    bare: page('<title></title>', '<h1>Welcome</h1><p>We are a company.</p>'),
    // 3. Tag Manager only: cannot see what it loads.
    gtm: page('<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABCD12"></script>', '<p>Hello</p>'),
    // 4. Meta pixel and Google Ads.
    pixels: page(`<script>fbq('init','123');</script><script async src="https://www.googleadservices.com/pagead/conversion.js"></script>`, '<p>Hi</p>'),
    // 5. Out-of-date footer, written as a range.
    stale: page('', '<footer>Copyright 2016 - 2019 Old Co</footer>'),
    // 6. Drawn by JavaScript: almost no visible text, many scripts.
    jsHeavy: page(Array.from({ length: 12 }, (_, i) => `<script src="/a${i}.js"></script>`).join(''), '<div id="root"></div><noscript>Enable JavaScript</noscript>'),
    // 7. Schema inside @graph.
    graph: page(`<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":["Restaurant","LocalBusiness"],"name":"K"}]}</script>`, '<p>x</p>'),
    // 8. Broken JSON-LD counts as absent.
    badJson: page(`<script type="application/ld+json">{"@type": "LocalBusiness", </script>`, '<p>x</p>'),
    // 9. WhatsApp only, no tel link, no number in text.
    whatsapp: page('', '<a href="https://api.whatsapp.com/send?phone=27821234567">Chat</a>'),
    // 10. A phone number only inside a script (invisible) and a comment.
    hidden: page('<script>var phone="082 123 4567";</script>', '<!-- 082 123 4567 --><p>Welcome</p>'),
    // 11. Booking tool by link, no form.
    calendly: page('', '<a href="https://calendly.com/blue-line/visit">Pick a time</a><a href="mailto:hi@blueline.co.za">Email</a>'),
    // 12. Hostile text in the title: must come back as plain, capped text.
    hostile: page(`<title>${'<img src=x onerror=alert(1)>'.repeat(5)}Pool Co ${'x'.repeat(200)}</title><meta name="description" content="d">`, '<p>x</p>'),
};

const run = (html, extra = {}) =>
    runChecks({ html, finalUrl: 'https://example.co.za/', httpRedirects: true, year: YEAR, ...extra });
const get = (res, id) => res.facts.find((f) => f.id === id);

test('1 good page passes every check', () => {
    const r = run(F.good);
    for (const id of ['secure', 'phone_fit', 'one_tap', 'contact_details', 'booking', 'search_text', 'business_details', 'tracking', 'current'])
        assert.equal(get(r, id).pass, true, id);
    assert.equal(get(r, 'business_details').type, 'LocalBusiness');
    assert.deepEqual(get(r, 'tracking').found, ['Google tag']);
    assert.equal(get(r, 'search_text').title, 'Blue Line Pool Care | Pool service in Pretoria East');
});

test('2 a bare page fails what customers touch', () => {
    const r = run(F.bare);
    for (const id of ['phone_fit', 'one_tap', 'contact_details', 'booking', 'search_text', 'business_details', 'tracking'])
        assert.equal(get(r, id).pass, false, id);
    assert.equal(get(r, 'current').pass, true);
});

test('3 Tag Manager alone is unclear, never "no tracking"', () => {
    const t = get(run(F.gtm), 'tracking');
    assert.equal(t.pass, null);
    assert.equal(t.gtmOnly, true);
    const rep = buildReport({ host: 'x.co.za', facts: run(F.gtm).facts, jsHeavy: false, checkedAt: '2026-11-19T12:32:00Z' });
    assert.ok(!rep.worth.some((w) => w.id === 'tracking'));
    assert.match(rep.unclear[0].text, /Tag Manager/);
});

test('4 Meta pixel and Google Ads are both named', () => {
    assert.deepEqual(get(run(F.pixels), 'tracking').found, ['Meta pixel', 'Google Ads']);
});

test('5 a stale footer year is flagged only at two years or more', () => {
    const f = get(run(F.stale), 'current');
    assert.equal(f.pass, false);
    assert.equal(f.year, 2019);
    assert.equal(get(run(F.stale, { year: 2020 }), 'current').pass, true);
    assert.equal(get(run(F.stale, { year: 2021 }), 'current').pass, false);
});

test('6 a JavaScript-drawn page is flagged as possibly under-read', () => {
    const r = run(F.jsHeavy);
    assert.equal(r.jsHeavy, true);
    assert.equal(get(r, 'size').scripts, 12);
    assert.equal(run(F.good).jsHeavy, false);
});

test('7 schema inside @graph is found', () => {
    const f = get(run(F.graph), 'business_details');
    assert.equal(f.pass, true);
    assert.equal(f.type, 'WebSite');
});

test('8 invalid JSON-LD counts as absent', () => {
    assert.equal(get(run(F.badJson), 'business_details').pass, false);
});

test('9 a WhatsApp link alone satisfies one-tap but not contact details', () => {
    const r = run(F.whatsapp);
    assert.equal(get(r, 'one_tap').pass, true);
    assert.equal(get(r, 'contact_details').pass, false);
});

test('10 numbers inside scripts and comments do not count as shown on the page', () => {
    const r = run(F.hidden);
    assert.equal(get(r, 'contact_details').pass, false);
    assert.equal(get(r, 'one_tap').pass, false);
    assert.ok(!visibleText(F.hidden).includes('082'));
});

test('11 a booking tool link counts, and a mailto counts as contact', () => {
    const r = run(F.calendly);
    assert.equal(get(r, 'booking').pass, true);
    assert.equal(get(r, 'contact_details').pass, true);
});

test('12 hostile title text is capped and only ever returned as a string', () => {
    const f = get(run(F.hostile), 'search_text');
    assert.ok(f.title.length <= 70);
    assert.equal(typeof f.title, 'string');
    assert.ok(!f.title.includes('<'), 'tags stripped from the title');
});

/* ---- secure / http redirect ------------------------------------------- */

test('secure needs https at the end and an http redirect that is not known to fail', () => {
    assert.equal(get(run(F.good), 'secure').pass, true);
    assert.equal(get(run(F.good, { finalUrl: 'http://example.co.za/' }), 'secure').pass, false);
    assert.equal(get(run(F.good, { httpRedirects: false }), 'secure').pass, false);
    assert.equal(get(run(F.good, { httpRedirects: null }), 'secure').pass, true);
});

test('a viewport tag without device-width fails', () => {
    const h = page('<meta name="viewport" content="width=1024">', 'x');
    assert.equal(get(run(h), 'phone_fit').pass, false);
});

test('a form with only a checkbox is not an enquiry form', () => {
    const h = page('', '<form><input type="checkbox"><button>Go</button></form>');
    assert.equal(get(run(h), 'booking').pass, false);
});

/* ---- report ----------------------------------------------------------- */

const checkedAt = '2026-11-19T12:32:00Z';

test('report orders fails by customers touched and leads with passes', () => {
    const rep = buildReport({ host: 'x.co.za', facts: run(F.bare).facts, jsHeavy: false, checkedAt });
    assert.deepEqual(rep.worth.map((w) => w.id), ['phone_fit', 'one_tap', 'contact_details', 'booking', 'search_text', 'business_details', 'tracking']);
    assert.ok(rep.working.some((w) => w.id === 'secure'));
    assert.equal(rep.cantSee, CANT_SEE);
});

test('report copy has no score, percentages, rand figures or banned words', () => {
    const everything = buildReport({ host: 'x.co.za', facts: run(F.bare).facts, jsHeavy: true, truncated: true, partial: true, speed: null, checkedAt });
    const text = JSON.stringify(everything);
    assert.ok(!/[0-9]%|\bR\s?\d|score|grade|wix|squarespace|wordpress|agency/i.test(text), text);
    assert.ok(!/you have no tracking/i.test(text));
    assert.ok(!text.includes('—'), 'no em dashes');
});

test('speed is reported to one decimal and only when it ran', () => {
    const facts = run(F.good).facts;
    const ran = buildReport({ host: 'x.co.za', facts, jsHeavy: false, speed: { lcp: 3.44 }, checkedAt });
    assert.ok(ran.worth.some((w) => w.id === 'speed' && /3\.4 s/.test(w.text)));
    const missed = buildReport({ host: 'x.co.za', facts, jsHeavy: false, speed: null, checkedAt });
    assert.ok(missed.notes.some((n) => /speed test didn't answer/.test(n)));
    const asked = buildReport({ host: 'x.co.za', facts, jsHeavy: false, checkedAt });
    assert.ok(!asked.worth.concat(asked.working).some((w) => w.id === 'speed'));
});

test('large HTML is listed under worth fixing; normal HTML is just a fact', () => {
    const big = run(F.good, { bytes: 600 * 1024 });
    assert.ok(buildReport({ host: 'x.co.za', facts: big.facts, jsHeavy: false, checkedAt }).worth.some((w) => w.id === 'size'));
    const small = buildReport({ host: 'x.co.za', facts: run(F.good, { bytes: 40 * 1024 }).facts, jsHeavy: false, checkedAt });
    assert.ok(small.notes.some((n) => /40 KB before images/.test(n)));
});

test('the checked time is shown in Johannesburg time', () => {
    assert.equal(formatChecked('2026-11-19T12:32:00Z'), '19 Nov 2026, 14:32 (Johannesburg)');
});

test('a lead summary keeps ids only, never page text', () => {
    const rep = buildReport({ host: 'x.co.za', facts: run(F.hostile).facts, jsHeavy: false, checkedAt });
    const s = summarise(rep);
    assert.deepEqual(Object.keys(s).sort(), ['checkedAt', 'host', 'unclear', 'working', 'worth']);
    assert.ok(!JSON.stringify(s).includes('Pool Co'));
});
