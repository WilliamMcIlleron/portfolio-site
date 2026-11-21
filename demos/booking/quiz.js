/* Blue Line Pool Care: quiz funnel and booking. A made-up business; nothing is sent.
 *
 * SCORING (how the answers become a plan)
 * ---------------------------------------
 * First visit(s), in order:
 *   1. need = "equipment"                       -> Equipment Check (R550 call-out).
 *   2. water = "green", or need = "green" while the water is not "clear"
 *                                               -> Green-to-Clean Reset (priced by size).
 *      (need = "green" but water now "clear" means it has already cleared: no Reset.)
 *   3. nothing above and need = "newpool"       -> Start-up and walkthrough visit (included).
 *   4. nothing above                            -> First regular visit with a full water test (included).
 * Ongoing plan:
 *   need = "newpool"                            -> Handover and Care (3 months, then a regular plan).
 *   otherwise usage = "family" or size = "large" -> Weekly Care.
 *   otherwise                                   -> Fortnightly Care.
 * Personal touches (change the "included" list and the alternative line, not the plan):
 *   surface (concrete / fibreglass / vinyl), sanitiser (salt adds the 3-monthly cell clean),
 *   current carer (me / a pool guy / nobody), priority (price / convenience / peace of mind).
 *   priority = "price" on Weekly (unless family AND large) offers Fortnightly as the cheaper option;
 *   priority = "peace" on Fortnightly offers Weekly as the safer option.
 * Prices are per size and fictional; the same numbers are on index.html and plans.html.
 */
(function () {
    "use strict";

    var KEY = "blpc-quiz-v1";
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var PHONE = "010 000 0000";

    /* ---------- Questions ---------- */
    var Q = [
        { id: "usage", title: "Who swims in <em>your</em> pool?", help: "Start with the easy one. There are no wrong answers.", photo: "feature",
          opts: [["family", "My family", "Kids, friends, weekends in the water"], ["occasional", "Us, now and then", "A swim on hot days and the odd braai"], ["rarely", "Hardly anyone", "It mostly looks nice in the garden"]] },
        { id: "need", title: "What do you need help with?", help: "Pick the closest. We will ask about the details next.", photo: "cleaner",
          opts: [["upkeep", "Regular upkeep", "Keep it clean so I never have to think about it"], ["green", "Water is green or cloudy", "It has turned and I want it back"], ["equipment", "An equipment problem", "Pump, filter, timer or salt cell playing up"], ["newpool", "A new pool after a build", "Just filled, or about to be"]] },
        { id: "surface", title: "What is the pool made of?", help: "Each finish needs different brushes and chemistry.", photo: "closeup",
          opts: [["concrete", "Concrete", "Marbelite, pebble or tiled"], ["fibreglass", "Fibreglass", "Smooth, one-piece shell"], ["vinyl", "Vinyl liner", "A soft liner over a frame"]] },
        { id: "sanitiser", title: "Chlorine or salt?", help: "If there is a box on the wall with a cell in the pipework, it is salt.", photo: "ripples",
          opts: [["chlorine", "Chlorine", "Tablets, granules or a floater"], ["salt", "Salt", "A salt chlorinator does the work"], ["unsure", "Not sure", "We will check on the first visit"]] },
        { id: "size", title: "How big is it?", help: "A rough idea is fine. It sets the price.", photo: "wide",
          opts: [["plunge", "Plunge pool", "Up to about 20,000 litres"], ["standard", "Standard", "About 20,000 to 50,000 litres"], ["large", "Large", "Over 50,000 litres"]] },
        { id: "water", title: "What does the water look like <em>right now</em>?", help: "Be honest. We have seen worse.", photo: "green",
          opts: [["clear", "Clear", "You can see the floor"], ["cloudy", "Slightly cloudy", "Hazy, but no green"], ["green", "Green", "Algae has taken over"], ["unsure", "Not sure", "I have not looked in a while"]] },
        { id: "carer", title: "Who looks after it now?", help: "So we know where to pick up from.", photo: "hose",
          opts: [["me", "I do", "Me, a net and a bucket of chemicals"], ["poolguy", "A pool guy", "Someone comes in, but I want a change"], ["nobody", "Nobody", "It has been left to itself"]] },
        { id: "priority", title: "What matters most to you?", help: "Last one. This shapes how we look after you.", photo: "dusk",
          opts: [["price", "Price", "The best value for a clean pool"], ["convenience", "Convenience", "I do not want to be home or think about it"], ["peace", "Peace of mind", "Proof that it is right, every time"]] }
    ];
    var N = Q.length;

    /* ---------- Prices (fictional, per size) ---------- */
    var SIZES = { plunge: "plunge pool", standard: "standard pool", large: "large pool" };
    var PRICE = {
        weekly:      { plunge: [1150, 1350], standard: [1450, 1650], large: [1850, 2150] },
        fortnightly: { plunge: [650, 800],   standard: [850, 1000],  large: [1150, 1350] },
        handover:    { plunge: [1250, 1450], standard: [1550, 1750], large: [1950, 2250] },
        reset:       { plunge: [1300, 1600], standard: [1800, 2200], large: [2400, 2900] }
    };
    var PLANS = {
        weekly: { name: "Weekly Care", per: "a month", visits: "4 visits a month on the same weekday" },
        fortnightly: { name: "Fortnightly Care", per: "a month", visits: "2 visits a month, every second week" },
        handover: { name: "Handover and Care", per: "a month for the first 3 months", visits: "Weekly visits while the new surface cures" }
    };

    /* ---------- Photos ---------- */
    var PHOTOS = {
        hero: ["hero-backyard", [640, 960, 1280], 4 / 3, "A quiet backyard pool with two chairs under trees"],
        feature: ["water-feature", [400, 800, 1200], 2 / 3, "A backyard pool with a small water spout and a lawn behind it"],
        cleaner: ["pool-cleaner", [480, 960, 1440], 1.23, "An automatic cleaner working on the floor of a slightly cloudy pool"],
        closeup: ["water-closeup", [480, 960, 1440], 1.5, "Close-up of clear pool water rippling over a white grate"],
        ripples: ["water-ripples", [640, 1280, 1920], 1.51, "Calm blue water with soft ripples"],
        wide: ["backyard-wide", [640, 960, 1440], 1.39, "A garden pool seen from a deck, with palms and a lawn"],
        green: ["green-pool", [480, 960, 1440], 4 / 3, "A pool with green, algae-stained water before cleaning"],
        hose: ["hose-fill", [400, 800, 1200], 2 / 3, "A hose topping up a bright blue pool"],
        dusk: ["dusk-pool", [640, 960, 1440], 1.25, "A pool lit up at dusk under palm trees"],
        pump: ["heat-pump", [400, 800, 1200], 2 / 3, "An unbranded pool heat pump on a concrete slab"]
    };

    /* ---------- State ---------- */
    var memory = null;
    var storageOk = true;
    function load() {
        try {
            var raw = sessionStorage.getItem(KEY);
            if (!raw) return fresh();
            var s = JSON.parse(raw);
            if (!s || typeof s !== "object" || typeof s.answers !== "object") return fresh();
            s.booking = s.booking || {};
            return s;
        } catch (e) { storageOk = false; return memory || fresh(); }
    }
    function fresh() { return { answers: {}, booking: {}, ref: null }; }
    function save() {
        memory = state;
        try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOk = false; }
    }
    var state = load();

    /* ---------- Helpers ---------- */
    function rand(n) { return "R" + n.toLocaleString("en-ZA").replace(/\u00a0|\s/g, ","); }
    function range(r) { return rand(r[0]) + " to " + rand(r[1]); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    function optLabel(qi, val) { var o = Q[qi].opts.filter(function (x) { return x[0] === val; })[0]; return o ? o[1] : ""; }
    function firstMissing() { for (var i = 0; i < N; i++) if (!state.answers[Q[i].id]) return i; return N; }
    function $(sel, root) { return (root || document).querySelector(sel); }

    /* ---------- Scoring ---------- */
    function score(a) {
        var size = a.size;
        var visits = [];
        if (a.need === "equipment") visits.push({ key: "equipment", name: "Equipment Check", price: "R550 call-out, including the first 45 minutes", mins: 60,
            includes: ["Pump, filter, valves, timer and salt cell checked", "A written fault report on WhatsApp", "Any repair quoted before we touch it"] });
        var reset = a.water === "green" || (a.need === "green" && a.water !== "clear");
        if (reset) visits.push({ key: "reset", name: "Green-to-Clean Reset", price: range(PRICE.reset[size]) + " once, chemicals included", mins: 120,
            includes: ["Shock, floc and vacuum to waste", "Up to 3 visits in 7 days until you can see the floor", "Filter cleaned so the green does not come back"] });
        var plan = a.need === "newpool" ? "handover" : (a.usage === "family" || size === "large") ? "weekly" : "fortnightly";
        if (!visits.length && plan === "handover") visits.push({ key: "startup", name: "Start-up and walkthrough", price: "Included in the plan", mins: 90,
            includes: ["First chemistry set gently for the new surface", "Pump, filter and timer set up and explained", "A walk-around so you know your own pool"] });
        if (!visits.length) visits.push({ key: "first", name: "First visit with a full water test", price: "Included in the plan", mins: 60,
            includes: ["Full clean: skim, brush, vacuum, baskets", "Water tested and balanced on the spot", "We note anything that needs attention"] });

        var inc = [PLANS[plan].visits, "Skim, brush, vacuum and empty the baskets", "Water tested and balanced, chemicals included"];
        inc.push({ concrete: "Brushing suited to marbelite and pebble finishes", fibreglass: "Soft brushes and chemistry that is kind to gelcoat", vinyl: "Liner-safe brushes and no harsh shock that bleaches the liner" }[a.surface]);
        if (a.sanitiser === "salt") inc.push("Salt cell cleaned every 3 months");
        if (a.sanitiser === "unsure") inc.push("We check for a salt cell on the first visit");
        inc.push({ price: "No contract. Stop with one WhatsApp message.", convenience: "Same weekday, same technician. You do not need to be home.", peace: "A photo and the test results on WhatsApp after every visit" }[a.priority]);

        var planReason = plan === "weekly"
            ? (a.usage === "family" ? "a family pool gets used hard and needs checking every week" : "a large pool holds a lot of water to keep in balance")
            : plan === "fortnightly" ? "a " + SIZES[size] + " that is used " + (a.usage === "rarely" ? "rarely" : "now and then") + " stays balanced with a visit every second week"
            : "";
        var why;
        if (plan === "handover") why = (reset ? "The water has turned, so a Reset clears it first. " : "") + "A new pool needs careful chemistry while the surface cures, so Handover and Care covers the first 3 months and then moves you to a regular plan.";
        else if (a.need === "equipment") why = "Something is not working, so a technician checks the equipment first and quotes any repair before starting" + (reset ? ", then a Reset clears the green" : "") + ". After that, " + PLANS[plan].name + " suits you because " + planReason + ".";
        else if (reset) why = "Green water means algae has taken hold, so a Reset clears it first. After that, " + PLANS[plan].name + " keeps it clear because " + planReason + ".";
        else if (a.need === "green") why = "You said the water had turned, but it is clear now, so you do not need a Reset. " + PLANS[plan].name + " keeps it that way because " + planReason + ".";
        else why = PLANS[plan].name + " suits you because " + planReason + ".";

        var alt = "";
        if (plan === "weekly" && a.priority === "price" && !(a.usage === "family" && size === "large"))
            alt = "Want to spend less? Fortnightly Care is " + range(PRICE.fortnightly[size]) + " a month for your pool. You would skim between visits.";
        if (plan === "fortnightly" && a.priority === "peace")
            alt = "Want it never to slip? Weekly Care is " + range(PRICE.weekly[size]) + " a month for your pool, with a report every week.";
        if (a.carer === "poolguy") alt = (alt ? alt + " " : "") + "Switching is simple: we start the week your current service ends.";
        if (a.carer === "nobody" && !reset) alt = (alt ? alt + " " : "") + "Since nobody has been looking after it, the first visit includes a full equipment once-over at no extra cost.";
        if (a.carer === "me") alt = (alt ? alt + " " : "") + "Keep whatever chemicals you have. We will check what is worth using on the first visit.";

        return { plan: plan, planName: PLANS[plan].name, price: range(PRICE[plan][size]), per: PLANS[plan].per, visits: visits, includes: inc, why: why, alt: alt,
                 saltNote: a.sanitiser === "salt" ? "Salt pools sit at the top of the range because of the cell care." : "" };
    }

    function echo(a) {
        var size = { plunge: "plunge", standard: "standard-size", large: "large" }[a.size];
        var surface = { concrete: "concrete", fibreglass: "fibreglass", vinyl: "vinyl-liner" }[a.surface];
        var san = { chlorine: "chlorine", salt: "salt", unsure: "" }[a.sanitiser];
        var usage = { family: "used by a family", occasional: "used now and then", rarely: "hardly used" }[a.usage];
        var water = { clear: "clear right now", cloudy: "slightly cloudy right now", green: "green right now", unsure: "and you are not sure what the water is doing" }[a.water];
        var article = /^[aeiou]/i.test(size) ? "An " : "A ";
        var s = article + size + " " + surface + (san ? " " + san : "") + " pool, " + usage + ", " + water + ".";
        var carer = { me: "You have been looking after it yourself", poolguy: "A pool guy looks after it now", nobody: "Nobody has been looking after it" }[a.carer];
        var pr = { price: "value", convenience: "convenience", peace: "peace of mind" }[a.priority];
        return s + " " + carer + ", and you care most about " + pr + ".";
    }

    /* ---------- Booking calendar (SAST, UTC+2, no DST) ---------- */
    function sastToday() { var d = new Date(Date.now() + 2 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function iso(d) { return d.toISOString().slice(0, 10); }
    function dayLabel(isoStr) { var d = new Date(isoStr + "T00:00:00Z"); return DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]; }
    function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function slotsFor(isoStr) {
        var d = new Date(isoStr + "T00:00:00Z");
        var base = d.getUTCDay() === 6 ? ["07:30", "09:30"] : ["07:30", "09:30", "11:30", "13:30", "15:30"];
        return base.map(function (t) { return { t: t, taken: hash(isoStr + t) % 3 === 0 }; });
    }
    function days() {
        var out = [], d = sastToday();
        while (out.length < 9) {
            d = new Date(d.getTime() + 864e5);
            if (d.getUTCDay() === 0) continue;
            var s = iso(d), slots = slotsFor(s);
            var full = hash(s) % 7 === 0 || slots.every(function (x) { return x.taken; });
            out.push({ iso: s, full: full });
        }
        return out;
    }
    function visitMinutes(r) { return r.visits.reduce(function (m, v) { return Math.max(m, v.mins); }, 60); }

    /* ---------- Rendering ---------- */
    var screenEl, progressEl, progressText, progressBar, photoFig;
    var depth = 0;

    function setProgress(cur) {
        // cur: question index, or a booking step
        if (cur === null) { progressEl.hidden = true; return; }
        progressEl.hidden = false;
        progressText.textContent = cur.text;
        progressBar.style.width = cur.pct + "%";
        progressEl.querySelector(".progress__track").setAttribute("aria-valuenow", String(Math.round(cur.pct)));
    }

    var desktop = window.matchMedia("(min-width: 64rem)");
    function showPhoto(key) {
        if (!photoFig || !desktop.matches) return;
        var p = PHOTOS[key]; if (!p) return;
        var cur = photoFig.querySelector("img.is-on");
        if (cur && cur.dataset.key === key) return;
        var img = photoFig.querySelector('img[data-key="' + key + '"]');
        if (!img) {
            img = new Image();
            img.dataset.key = key;
            img.alt = p[3];
            img.decoding = "async";
            img.sizes = "(min-width: 64rem) 42vw, 1px";
            img.srcset = p[1].map(function (w) { return "img/" + p[0] + "-" + w + ".webp " + w + "w"; }).join(", ");
            img.src = "img/" + p[0] + "-" + p[1][1] + ".webp";
            img.width = p[1][1]; img.height = Math.round(p[1][1] / p[2]);
            photoFig.insertBefore(img, photoFig.firstChild);
        }
        var swap = function () {
            photoFig.querySelectorAll("img").forEach(function (x) { x.classList.toggle("is-on", x === img); x.setAttribute("aria-hidden", x === img ? "false" : "true"); });
        };
        if (img.complete) swap(); else { img.onload = swap; img.onerror = function () { img.remove(); }; }
    }

    function screenAllowed(name) {
        var m = /^q(\d)$/.exec(name);
        var miss = firstMissing();
        if (m) return +m[1] - 1 <= miss;
        if (name === "plan" || name === "day") return miss === N;
        if (name === "time") return miss === N && !!state.booking.day;
        if (name === "details") return miss === N && !!state.booking.day && !!state.booking.time;
        if (name === "done") return !!state.ref;
        return false;
    }
    function furthest() {
        if (state.ref) return "done";
        var miss = firstMissing();
        if (miss < N) return "q" + (miss + 1);
        if (state.booking.time) return "details";
        if (state.booking.day) return "time";
        return state.seenPlan ? "plan" : "plan";
    }

    function go(name, opts) {
        opts = opts || {};
        if (name !== "missing" && !screenAllowed(name)) name = opts.fallbackMissing ? "missing" : furthest();
        var url = "#" + name;
        if (opts.push) { depth++; history.pushState({ s: name, d: depth }, "", url); }
        else if (opts.replace !== false) history.replaceState({ s: name, d: depth }, "", url);
        render(name, opts);
    }

    function render(name, opts) {
        opts = opts || {};
        state.screen = name; save();
        var html, m = /^q(\d)$/.exec(name);
        if (m) html = renderQuestion(+m[1] - 1);
        else if (name === "plan") html = renderResult();
        else if (name === "day") html = renderDay();
        else if (name === "time") html = renderTime();
        else if (name === "details") html = renderDetails();
        else if (name === "done") html = renderDone();
        else if (name === "missing") html = renderMissing();
        screenEl.innerHTML = html;
        screenEl.classList.remove("is-entering", "from-back");
        void screenEl.offsetWidth;
        screenEl.classList.add("is-entering");
        if (opts.back) screenEl.classList.add("from-back");
        bindScreen(name);
        if (opts.focus !== false) {
            var h = screenEl.querySelector("[data-focus]");
            if (h) h.focus({ preventScroll: true });
            if (window.scrollY > 120) window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
        }
    }

    function tileHTML(val, label, sub, i, pressed, extra) {
        return '<li><button type="button" class="tile" data-val="' + esc(val) + '" aria-pressed="' + (pressed ? "true" : "false") + '"' + (extra || "") + '>' +
            '<span class="tile__label">' + label + '</span>' + (sub ? '<span class="tile__sub">' + sub + '</span>' : "") +
            (i !== null ? '<span class="tile__key" aria-hidden="true">' + (i + 1) + '</span>' : "") + '</button></li>';
    }
    function backHTML(label) { return '<button type="button" class="back" data-back>&#8592; ' + (label || "Back") + '</button>'; }

    function renderQuestion(i) {
        var q = Q[i], cur = state.answers[q.id];
        setProgress({ text: "Question " + (i + 1) + " of " + N, pct: Math.max(3, (i / N) * 100) });
        showPhoto(q.photo);
        var tiles = q.opts.map(function (o, k) { return tileHTML(o[0], o[1], o[2], k, cur === o[0]); }).join("");
        return '<h2 class="q-title" id="q-title" tabindex="-1" data-focus>' + q.title + '</h2>' +
            '<p class="q-help">' + q.help + '</p>' +
            '<ul class="tiles' + (q.opts.length === 4 ? " tiles--2" : "") + '" role="list" aria-labelledby="q-title" data-q="' + i + '">' + tiles + '</ul>' +
            '<div class="quiz-nav">' + (i > 0 ? backHTML() : '<a class="back" href="index.html">&#8592; Back to the site</a>') +
            '<span class="kbd-hint">Arrow keys to move, Enter or 1 to ' + q.opts.length + ' to choose, Esc to go back</span></div>';
    }

    function renderResult() {
        var a = state.answers, r = score(a);
        setProgress({ text: "Your plan", pct: 100 });
        showPhoto({ reset: "green", equipment: "pump", startup: "hose", first: r.plan === "weekly" ? "hero" : "wide" }[r.visits[0].key]);
        var visitCards = r.visits.map(function (v, k) {
            return '<div class="result-card result-card--first"><p class="label">' + (k === 0 ? "First visit" : "Then") + '</p><h3>' + v.name + '</h3>' +
                '<p class="price">' + v.price + '</p><ul class="checks" role="list">' + v.includes.map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul></div>';
        }).join("");
        var planCard = '<div class="result-card"><p class="label">' + (r.plan === "handover" ? "Your plan" : "Then, your ongoing plan") + '</p><h3>' + r.planName + '</h3>' +
            '<p class="price"><strong>' + r.price + '</strong> ' + r.per + ' for your ' + SIZES[a.size] + '</p>' +
            (r.saltNote ? '<p class="alt">' + r.saltNote + '</p>' : "") +
            '<ul class="checks" role="list">' + r.includes.map(function (x) { return "<li>" + x + "</li>"; }).join("") + '</ul></div>';
        return '<p class="label">Here is what we heard</p>' +
            '<h2 class="q-title" tabindex="-1" data-focus>Your plan: <em>' + r.planName + '</em></h2>' +
            '<p class="echo" data-echo>' + esc(echo(a)) + '</p>' +
            '<p class="why" data-why>' + esc(r.why) + '</p>' +
            '<div class="result-plan" data-plan="' + r.plan + '" data-first="' + r.visits.map(function (v) { return v.key; }).join(",") + '">' + visitCards + planCard + '</div>' +
            (r.alt ? '<p class="alt" style="margin-top:1rem" data-alt>' + esc(r.alt) + '</p>' : "") +
            (storageOk ? "" : '<div class="notice" role="status"><p>This browser is blocking saved progress, so a refresh will clear your answers. Finish in one go, or call ' + PHONE + '.</p></div>') +
            '<div class="quiz-nav"><button type="button" class="btn" data-next="day">Pick a day for your first visit <span class="btn__arrow" aria-hidden="true">&#8594;</span></button>' +
            backHTML("Change an answer") + '</div>' +
            '<p class="alt" style="margin-top:1rem">No payment now. You pay after the first visit.</p>';
    }

    function renderDay() {
        var r = score(state.answers), list = days(), firstOpen = list.filter(function (d) { return !d.full; })[0];
        setProgress({ text: "Booking: step 1 of 3", pct: 100 });
        var tiles = list.map(function (d) {
            return tileHTML(d.iso, dayLabel(d.iso), d.full ? "Full" : (new Date(d.iso + "T00:00:00Z").getUTCDay() === 6 ? "Morning only" : "Open"), null, state.booking.day === d.iso, d.full ? ' disabled aria-label="' + dayLabel(d.iso) + ', full"' : "");
        }).join("");
        return '<p class="label">' + esc(r.visits[0].name) + '</p>' +
            '<h2 class="q-title" id="q-title" tabindex="-1" data-focus>Which day suits you?</h2>' +
            '<p class="q-help">You do not need to be home if we can get to the pool. Crossed-out days are full' + (firstOpen ? "; the first open day is " + dayLabel(firstOpen.iso) : "") + '.</p>' +
            '<ul class="days" role="list" aria-labelledby="q-title">' + tiles + '</ul>' +
            '<p class="q-help">None of these work? Call ' + PHONE + ' and we will find a gap.</p>' +
            '<div class="quiz-nav">' + backHTML("Back to your plan") + '</div>';
    }

    function renderTime() {
        var day = state.booking.day, slots = slotsFor(day);
        setProgress({ text: "Booking: step 2 of 3", pct: 100 });
        var open = slots.filter(function (s) { return !s.taken; });
        var tiles = slots.map(function (s) {
            return tileHTML(s.t, s.t, s.taken ? "Taken" : "Free", null, state.booking.time === s.t, s.taken ? ' disabled aria-label="' + s.t + ', taken"' : "");
        }).join("");
        return '<p class="label">' + dayLabel(day) + '</p>' +
            '<h2 class="q-title" id="q-title" tabindex="-1" data-focus>What time on ' + dayLabel(day).split(" ")[0] + '?</h2>' +
            '<p class="q-help">This is when the technician arrives. ' + (open.length ? "" : "Every slot on this day is taken, so pick another day.") + '</p>' +
            '<ul class="times" role="list" aria-labelledby="q-title">' + tiles + '</ul>' +
            '<div class="quiz-nav">' + backHTML("Pick another day") + '</div>';
    }

    function renderDetails() {
        var b = state.booking, r = score(state.answers);
        setProgress({ text: "Booking: step 3 of 3", pct: 100 });
        return '<p class="label">Last step</p>' +
            '<h2 class="q-title" tabindex="-1" data-focus>Who should we ask for?</h2>' +
            '<p class="summary-line">' + esc(r.visits[0].name) + ', ' + dayLabel(b.day) + ' at ' + b.time + '</p>' +
            '<form novalidate data-form>' +
            '<div class="field"><label for="f-name">Your name</label><input id="f-name" name="name" autocomplete="given-name" value="' + esc(b.name || "") + '" aria-describedby="e-name"><p class="field__error" id="e-name" role="alert"></p></div>' +
            '<div class="field"><label for="f-cell">Cell number</label><input id="f-cell" name="cell" type="tel" inputmode="tel" autocomplete="tel" placeholder="082 000 0000" value="' + esc(b.cell || "") + '" aria-describedby="h-cell e-cell">' +
            '<p class="field__hint" id="h-cell">We confirm on WhatsApp. This is a demo, so nothing is sent.</p><p class="field__error" id="e-cell" role="alert"></p></div>' +
            '<div class="quiz-nav"><button type="submit" class="btn">Book my visit <span class="btn__arrow" aria-hidden="true">&#8594;</span></button>' + backHTML("Change the time") + '</div>' +
            '</form>';
    }

    function waMessage() {
        var a = state.answers, b = state.booking, r = score(a);
        var lines = [
            "New booking " + state.ref,
            dayLabel(b.day) + ", " + b.time + " (about " + Math.round(visitMinutes(r) / 60 * 10) / 10 + " h)",
            "Visit: " + r.visits.map(function (v) { return v.name; }).join(", then "),
            "Plan: " + r.planName + " (" + r.price + " " + r.per + ")",
            "Name: " + b.name,
            "Cell: " + b.cell,
            "",
            "Their answers:"
        ];
        var labels = ["Who swims", "Needs", "Pool", "Sanitiser", "Size", "Water now", "Looked after by", "Cares most about"];
        Q.forEach(function (q, i) { lines.push((i + 1) + ". " + labels[i] + ": " + optLabel(i, a[q.id])); });
        return lines.join("\n");
    }

    function renderDone() {
        var a = state.answers, b = state.booking, r = score(a);
        setProgress(null);
        showPhoto("dusk");
        return '<p class="label">Booked (demo)</p>' +
            '<h2 class="q-title" tabindex="-1" data-focus>You are booked in, <em>' + esc(b.name) + '</em>.</h2>' +
            '<p class="q-help">On a real site you would get a WhatsApp confirmation now. This is a demo, so nothing was booked or sent.</p>' +
            '<p class="ref">Reference ' + esc(state.ref) + '</p>' +
            '<ul class="done-list" role="list">' +
            '<li><span>Visit</span><span>' + esc(r.visits.map(function (v) { return v.name; }).join(", then ")) + '</span></li>' +
            '<li><span>When</span><span>' + dayLabel(b.day) + ', ' + b.time + '</span></li>' +
            '<li><span>Plan after that</span><span>' + r.planName + '</span></li>' +
            '<li><span>Price</span><span>' + esc(r.price) + ' ' + r.per + '</span></li>' +
            '<li><span>We will WhatsApp</span><span>' + esc(b.cell) + '</span></li></ul>' +
            '<div class="done-actions"><button type="button" class="btn" data-ics>Add to my calendar <span class="btn__arrow" aria-hidden="true">&#8595;</span></button>' +
            '<button type="button" class="btn btn--plain" data-restart>Start again</button></div>' +
            '<p class="field__error" data-ics-error style="margin-top:.75rem"></p>' +
            '<section class="owner" aria-labelledby="owner-h"><p class="label">What the owner gets</p>' +
            '<h3 id="owner-h">This lands on the owner\u2019s WhatsApp</h3>' +
            '<p class="owner__why">Every quiz answer comes with the booking, so the owner knows the pool, the water and what the customer wants before calling.</p>' +
            '<div class="wa" data-wa><span class="wa__from">Blue Line bookings</span>' + esc(waMessage()) + '<span class="wa__meta">' + esc(state.sentAt || "") + '</span></div></section>';
    }

    function renderMissing() {
        var miss = firstMissing();
        setProgress(null);
        return '<h2 class="q-title" tabindex="-1" data-focus>We need a few answers first.</h2>' +
            '<p class="q-help">That step needs your pool details, and we only have ' + miss + ' of ' + N + '. It takes about a minute.</p>' +
            '<div class="quiz-nav"><button type="button" class="btn" data-goto="q' + (miss + 1) + '">' + (miss ? "Carry on from question " + (miss + 1) : "Start the questions") + ' <span class="btn__arrow" aria-hidden="true">&#8594;</span></button>' +
            '<a class="back" href="index.html">Back to the site</a></div>';
    }

    /* ---------- Interstitial: honest, built from the real answers ---------- */
    var buildTimer = null;
    function building() {
        var a = state.answers, r = score(a);
        if (reduced) { go("plan", { push: true }); return; }
        setProgress({ text: "Building your plan", pct: 100 });
        var lines = [
            "<strong>" + optLabel(2, a.surface) + ", " + (a.sanitiser === "unsure" ? "sanitiser to check" : optLabel(3, a.sanitiser).toLowerCase()) + "</strong>: matching brushes and chemistry",
            "<strong>" + optLabel(5, a.water) + " water</strong>: " + (r.visits.some(function (v) { return v.key === "reset"; }) ? "a Reset comes first" : "no Reset needed"),
            "<strong>" + optLabel(0, a.usage) + "</strong>: " + (r.plan === "handover" ? "new pool, so Handover and Care" : r.plan === "weekly" ? "weekly visits" : "a visit every second week"),
            "<strong>" + optLabel(4, a.size) + "</strong>: pricing for your size"
        ];
        screenEl.innerHTML = '<div class="building"><h2 class="q-title" tabindex="-1" data-focus>Building your plan</h2>' +
            '<ul class="build-list" role="list" aria-live="polite">' + lines.map(function (l) { return "<li><span>" + l + "</span></li>"; }).join("") + '</ul>' +
            '<div><button type="button" class="back" data-skip>Skip to my plan &#8594;</button></div></div>';
        screenEl.classList.remove("is-entering"); void screenEl.offsetWidth; screenEl.classList.add("is-entering");
        screenEl.querySelector("[data-focus]").focus({ preventScroll: true });
        var items = screenEl.querySelectorAll(".build-list li"), k = 0;
        var finish = function () { clearInterval(buildTimer); buildTimer = null; go("plan", { push: true }); };
        screenEl.querySelector("[data-skip]").addEventListener("click", finish);
        buildTimer = setInterval(function () {
            if (k < items.length) { items[k].classList.add("is-done"); k++; }
            else finish();
        }, 320);
    }

    /* ---------- Behaviour ---------- */
    var busy = false;
    function choose(i, val, btn) {
        if (busy) return;
        busy = true;
        state.answers[Q[i].id] = val;
        // Changing an earlier answer invalidates a finished booking reference.
        state.ref = null;
        save();
        if (btn) {
            btn.classList.add("is-chosen");
            btn.setAttribute("aria-pressed", "true");
        }
        setProgress({ text: "Question " + Math.min(i + 2, N) + " of " + N, pct: ((i + 1) / N) * 100 });
        setTimeout(function () {
            busy = false;
            var next = firstMissing();
            if (i + 1 < N && next > i) go("q" + (i + 2), { push: true });
            else if (next < N) go("q" + (next + 1), { push: true });
            else building();
        }, reduced ? 0 : 260);
    }

    function goBack() {
        if (buildTimer) { clearInterval(buildTimer); buildTimer = null; }
        var cur = state.screen, prev;
        var m = /^q(\d)$/.exec(cur);
        if (m) { if (+m[1] === 1) { location.href = "index.html"; return; } prev = "q" + (+m[1] - 1); }
        else prev = { plan: "q" + N, day: "plan", time: "day", details: "time", done: "details", missing: "q1" }[cur] || "q1";
        if (history.state && history.state.d > 0 && history.state.s === cur) history.back();
        else go(prev, { back: true });
    }

    function bindScreen(name) {
        screenEl.querySelectorAll("[data-back]").forEach(function (b) { b.addEventListener("click", goBack); });
        screenEl.querySelectorAll("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-goto"), { push: true }); }); });
        screenEl.querySelectorAll("[data-next]").forEach(function (b) { b.addEventListener("click", function () { state.seenPlan = true; save(); go(b.getAttribute("data-next"), { push: true }); }); });
        var m = /^q(\d)$/.exec(name);
        if (m) {
            var qi = +m[1] - 1;
            screenEl.querySelectorAll(".tile").forEach(function (t) { t.addEventListener("click", function () { choose(qi, t.getAttribute("data-val"), t); }); });
        }
        if (name === "day") screenEl.querySelectorAll(".tile:not([disabled])").forEach(function (t) {
            t.addEventListener("click", function () {
                if (busy) return; busy = true;
                if (state.booking.day !== t.getAttribute("data-val")) state.booking.time = null;
                state.booking.day = t.getAttribute("data-val"); state.ref = null; save();
                t.classList.add("is-chosen");
                setTimeout(function () { busy = false; go("time", { push: true }); }, reduced ? 0 : 220);
            });
        });
        if (name === "time") screenEl.querySelectorAll(".tile:not([disabled])").forEach(function (t) {
            t.addEventListener("click", function () {
                if (busy) return; busy = true;
                state.booking.time = t.getAttribute("data-val"); state.ref = null; save();
                t.classList.add("is-chosen");
                setTimeout(function () { busy = false; go("details", { push: true }); }, reduced ? 0 : 220);
            });
        });
        if (name === "details") bindForm();
        if (name === "done") {
            screenEl.querySelector("[data-ics]").addEventListener("click", downloadICS);
            screenEl.querySelector("[data-restart]").addEventListener("click", function () {
                state = fresh(); save(); depth = 0; go("q1", { focus: true });
            });
        }
    }

    // Reference codes skip 0/O and 1/I so they can be read out over the phone.
    function makeRef(h) { var A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", s = ""; for (var i = 0; i < 4; i++) { s += A[h % 32]; h = Math.floor(h / 32); } return "BL-" + s; }
    function cleanCell(v) { return v.replace(/[\s\-()]/g, ""); }
    function validCell(v) { var c = cleanCell(v); return /^0[6-8]\d{8}$/.test(c) || /^\+?27[6-8]\d{8}$/.test(c); }
    function prettyCell(v) {
        var c = cleanCell(v).replace(/^\+?27/, "0");
        return c.slice(0, 3) + " " + c.slice(3, 6) + " " + c.slice(6);
    }

    function bindForm() {
        var form = screenEl.querySelector("[data-form]");
        var name = form.querySelector("#f-name"), cell = form.querySelector("#f-cell");
        var eName = form.querySelector("#e-name"), eCell = form.querySelector("#e-cell");
        [name, cell].forEach(function (inp) {
            inp.addEventListener("input", function () {
                state.booking[inp.name] = inp.value; save();
                if (inp.getAttribute("aria-invalid") === "true") check(inp === name ? "name" : "cell");
            });
        });
        function check(which) {
            var ok = true;
            if (!which || which === "name") {
                var n = name.value.trim();
                var bad = n.length < 2;
                name.setAttribute("aria-invalid", bad ? "true" : "false");
                eName.textContent = bad ? "Tell us your name so the technician knows who to ask for." : "";
                if (bad) ok = false;
            }
            if (!which || which === "cell") {
                var v = cell.value.trim(), msg = "";
                if (!v) msg = "Add a cell number so we can confirm on WhatsApp. Prefer to talk? Call " + PHONE + ".";
                else if (!validCell(v)) msg = "That does not look like an SA cell number. It should be 10 digits starting with 06, 07 or 08, like 082 000 0000. Or call " + PHONE + ".";
                cell.setAttribute("aria-invalid", msg ? "true" : "false");
                eCell.textContent = msg;
                if (msg) ok = false;
            }
            return ok;
        }
        form.addEventListener("submit", function (e) {
            e.preventDefault();
            if (!check()) { (name.getAttribute("aria-invalid") === "true" ? name : cell).focus(); return; }
            // Re-check the slot is still free (it always is in the demo, but never dead-end if not).
            var slot = slotsFor(state.booking.day).filter(function (s) { return s.t === state.booking.time; })[0];
            if (!slot || slot.taken) { state.booking.time = null; save(); go("time", { push: true }); return; }
            state.booking.name = name.value.trim();
            state.booking.cell = prettyCell(cell.value);
            state.ref = makeRef(hash(JSON.stringify(state.answers) + state.booking.day + state.booking.time + state.booking.cell + Date.now()));
            state.sentAt = new Date(Date.now() + 2 * 3600e3).toISOString().slice(11, 16);
            save();
            go("done", { push: true });
        });
    }

    /* ---------- .ics (SAST is UTC+2 all year; emit UTC) ---------- */
    function icsDate(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    function fold(line) {
        var out = [], cur = "";
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (new Blob([cur + ch]).size > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch;
        }
        out.push(cur);
        return out.join("\r\n ");
    }
    function buildICS() {
        var b = state.booking, r = score(state.answers);
        var hm = b.time.split(":");
        var p = b.day.split("-");
        var start = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], +hm[0] - 2, +hm[1]));
        var end = new Date(start.getTime() + visitMinutes(r) * 60e3);
        var desc = r.visits.map(function (v) { return v.name; }).join(", then ") + ". Plan: " + r.planName + " (" + r.price + " " + r.per + "). Reference " + state.ref +
            ". Blue Line Pool Care is a made-up business in a demo, so this visit is not real.";
        var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Blue Line Pool Care//Booking demo//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            "BEGIN:VEVENT", "UID:" + state.ref + "-" + b.day + "@bluelinepool.demo", "DTSTAMP:" + icsDate(new Date()),
            "DTSTART:" + icsDate(start), "DTEND:" + icsDate(end),
            "SUMMARY:" + icsText("Pool visit: " + r.visits[0].name + " (demo)"),
            "DESCRIPTION:" + icsText(desc), "LOCATION:" + icsText("Your pool"), "STATUS:TENTATIVE", "END:VEVENT", "END:VCALENDAR"];
        return lines.map(fold).join("\r\n") + "\r\n";
    }
    function downloadICS() {
        var err = screenEl.querySelector("[data-ics-error]");
        try {
            var blob = new Blob([buildICS()], { type: "text/calendar;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = "blue-line-visit-" + state.ref + ".ics";
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            err.textContent = "";
        } catch (e) {
            err.textContent = "Your browser blocked the calendar file. Add it by hand: " + dayLabel(state.booking.day) + " at " + state.booking.time + ", reference " + state.ref + ".";
        }
    }
    window.__blpc = { score: score, echo: echo, buildICS: buildICS, Q: Q };

    /* ---------- Keyboard ---------- */
    function onKey(e) {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        var tag = (e.target.tagName || "").toLowerCase();
        var typing = tag === "input" || tag === "textarea";
        if (e.key === "Escape") {
            if (state.screen === "done") return;
            e.preventDefault(); goBack(); return;
        }
        if (typing) return;
        var tiles = Array.prototype.slice.call(screenEl.querySelectorAll(".tile:not([disabled])"));
        if (!tiles.length) return;
        var idx = tiles.indexOf(document.activeElement);
        if (/^[1-9]$/.test(e.key) && /^q\d$/.test(state.screen)) {
            var t = screenEl.querySelectorAll(".tile")[+e.key - 1];
            if (t) { e.preventDefault(); t.focus(); t.click(); }
            return;
        }
        var dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (dir) {
            e.preventDefault();
            var n = idx < 0 ? (dir > 0 ? 0 : tiles.length - 1) : (idx + dir + tiles.length) % tiles.length;
            tiles[n].focus();
        }
        if (e.key === "Home") { e.preventDefault(); tiles[0].focus(); }
        if (e.key === "End") { e.preventDefault(); tiles[tiles.length - 1].focus(); }
    }

    /* ---------- Boot ---------- */
    function boot() {
        screenEl = $("#screen"); progressEl = $(".progress"); progressText = $("#progress-text"); progressBar = $(".progress__bar"); photoFig = $(".quiz-photo");
        if (!screenEl) return;
        document.addEventListener("keydown", onKey);
        window.addEventListener("popstate", function (e) {
            if (buildTimer) { clearInterval(buildTimer); buildTimer = null; }
            var s = (e.state && e.state.s) || location.hash.slice(1) || furthest();
            depth = (e.state && e.state.d) || 0;
            var prevIdx = /^q(\d)$/.exec(state.screen || ""), nextIdx = /^q(\d)$/.exec(s);
            var back = prevIdx && nextIdx ? +nextIdx[1] < +prevIdx[1] : true;
            if (!screenAllowed(s)) { go(furthest(), { back: back }); return; }
            render(s, { back: back });
        });
        var restart = $("[data-restart-top]");
        if (restart) restart.addEventListener("click", function () { state = fresh(); save(); depth = 0; go("q1"); });
        var want = location.hash.slice(1);
        var known = /^(q[1-8]|plan|day|time|details|done)$/.test(want);
        if (known) go(want, { focus: false, fallbackMissing: !screenAllowed(want) && firstMissing() < N && !/^q\d$/.test(want) });
        else go(firstMissing() === 0 ? "q1" : (state.screen && screenAllowed(state.screen) ? state.screen : furthest()), { focus: false });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
