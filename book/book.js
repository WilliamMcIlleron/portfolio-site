/* ==========================================================================
   /book/: a short funnel (topic, a bit about you, day and time, details) that
   ends in a booked 20 minute call. Talks to /api/book/slots and /api/book.

   Keyboard and screen readers: each step moves focus to its heading; errors go
   in a role=alert box; days and times are native radio groups, so arrow keys work.
   ========================================================================== */
(function () {
    'use strict';

    var SITEKEY = '0x4AAAAAAGI2md2DR4NtDDGG';
    // Cloudflare's always-pass test key, for local development only.
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) SITEKEY = '1x00000000000000000000AA';

    var $ = function (id) { return document.getElementById(id); };
    var form = $('bookForm');
    if (!form) return;
    var errBox = $('bookErrors'), progress = $('bookProgress'), nextBtn = $('bookNext'), backBtn = $('bookBack');
    var steps = Array.prototype.slice.call(form.querySelectorAll('.book__step'));
    var TOTAL = steps.length;
    var cur = 1, days = [], slotsLoaded = false, picked = null, busy = false, activeDate = null;
    var WEEKDAY_LONG = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

    form.hidden = false;

    function showError(msg) { errBox.textContent = msg || ''; }
    function el(tag, attrs, text) {
        var e = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
        if (text != null) e.textContent = text;
        return e;
    }

    /* ---- steps ----------------------------------------------------------- */

    function go(n, focus) {
        cur = n;
        steps.forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
        progress.textContent = 'Step ' + n + ' of ' + TOTAL;
        backBtn.hidden = n === 1;
        nextBtn.firstChild.nodeValue = n === TOTAL ? 'Book this call ' : 'Continue ';
        nextBtn.disabled = false;
        showError('');
        if (n === 3) { if (slotsLoaded) refreshSlots(); else loadSlots(); }
        if (n === 4) { $('chosenSlot').textContent = picked ? 'Call on ' + picked.day + ' at ' + picked.time + ' (South African time), 20 minutes.' : ''; prepareTurnstile(); }
        if (focus !== false) {
            var head = steps[n - 1].querySelector('legend, h2');
            if (head) { head.focus({ preventScroll: true }); head.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); }
        }
    }
    function reduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

    function validate(n) {
        if (n === 1 && !form.querySelector('input[name="need"]:checked')) return { msg: 'Pick at least one thing you want to talk about.', field: form.querySelector('input[name="need"]') };
        if (n === 3 && !picked) return { msg: 'Pick a day and a time.', field: form.querySelector('input[name="day"]') };
        if (n === 4) {
            var name = $('name'), email = $('email'), phone = $('phone');
            if (!name.value.trim()) return { msg: 'Add your name.', field: name };
            if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[A-Za-z]{2,}$/.test(email.value.trim())) return { msg: "That email address doesn't look right.", field: email };
            if (!/^\+?[\d\s()-]{7,20}$/.test(phone.value.trim()) || phone.value.replace(/\D/g, '').length < 9) return { msg: "That number doesn't look right. Digits only, like 082 123 4567.", field: phone };
        }
        return null;
    }

    function clearInvalid() { Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (f) { f.removeAttribute('aria-invalid'); }); }

    nextBtn.addEventListener('click', function () {
        if (busy) return;
        clearInvalid();
        var bad = validate(cur);
        if (bad) { showError(bad.msg); if (bad.field) { bad.field.setAttribute('aria-invalid', 'true'); bad.field.focus(); } return; }
        if (cur < TOTAL) go(cur + 1); else submit();
    });
    backBtn.addEventListener('click', function () { if (!busy && cur > 1) go(cur - 1); });
    form.addEventListener('submit', function (e) { e.preventDefault(); nextBtn.click(); });
    form.addEventListener('input', function (e) { if (e.target.removeAttribute) e.target.removeAttribute('aria-invalid'); showError(''); });

    /* ---- slots ----------------------------------------------------------- */

    // Always ask the server for the current list: a slot someone else (or you, a minute ago) just booked must disappear.
    function fetchSlots() {
        return fetch('/api/book/slots', { headers: { accept: 'application/json' }, cache: 'no-store' })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (res) { if (!res.ok || !res.j.ok) throw new Error('slots'); return res.j.days || []; });
    }
    function stillOpen(start) {
        return days.some(function (d) { return d.slots.some(function (s) { return s.start === start; }); });
    }
    function refreshSlots() {
        if (!slotsLoaded) return loadSlots();
        return fetchSlots().then(function (fresh) {
            if (JSON.stringify(fresh) === JSON.stringify(days)) return;
            days = fresh;
            if (picked && !stillOpen(picked.start)) {
                picked = null;
                if (cur === 4) { go(3); }
                showError('That time was just taken. Pick another one.');
            }
            if (cur === 3) renderSlots();
        }).catch(function () { /* keep what is on screen; the server still refuses a taken slot */ });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && cur >= 3 && !busy) refreshSlots(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted && cur >= 3 && !busy) refreshSlots(); });
    setInterval(function () { if (!document.hidden && cur >= 3 && !busy) refreshSlots(); }, 45000);

    function loadSlots() {
        var area = $('slotArea');
        area.setAttribute('aria-busy', 'true');
        area.textContent = '';
        area.appendChild(el('p', { 'class': 'book__status' }, 'Loading times…'));
        return fetchSlots()
            .then(function (fresh) {
                days = fresh;
                slotsLoaded = true;
                renderSlots();
            })
            .catch(function () {
                slotsLoaded = false;
                area.setAttribute('aria-busy', 'false');
                area.textContent = '';
                var p = el('p', { 'class': 'book__status', role: 'alert' }, "Couldn't load the times. ");
                var retry = el('button', { type: 'button', 'class': 'text-link' }, 'Try again');
                retry.addEventListener('click', loadSlots);
                p.appendChild(retry);
                area.appendChild(p);
            });
    }

    function renderSlots() {
        var area = $('slotArea');
        area.setAttribute('aria-busy', 'false');
        area.textContent = '';
        if (!days.length) {
            area.appendChild(el('p', { 'class': 'book__status' }, 'No times are open right now. '));
            var a = el('a', { href: 'https://wa.me/27723555350?text=Hi%20William%2C%20I%27d%20like%20a%20free%20site%20check.', target: '_blank', rel: 'noopener' }, 'Message me on WhatsApp');
            area.lastChild.appendChild(a); area.lastChild.appendChild(document.createTextNode(' and we will find one.'));
            return;
        }
        var dayField = el('fieldset', { 'class': 'field field--choices book__days' });
        dayField.appendChild(el('legend', {}, 'Day'));
        var dayRow = el('div', { 'class': 'chips' });
        days.forEach(function (d, i) {
            var label = el('label', { 'class': 'chip' });
            var input = el('input', { type: 'radio', name: 'day', value: d.date });
            input.setAttribute('aria-label', d.label + ', ' + d.slots.length + (d.slots.length === 1 ? ' time' : ' times') + ' free');
            var parts = d.label.split(' ');
            var span = el('span', { 'aria-hidden': 'true' });
            span.appendChild(el('small', {}, parts[0]));
            span.appendChild(el('b', {}, parts[1]));
            span.appendChild(el('small', {}, parts[2]));
            label.appendChild(input); label.appendChild(span);
            dayRow.appendChild(label);
            input.addEventListener('change', function () { activeDate = d.date; renderTimes(d); });
        });
        dayField.appendChild(dayRow);
        area.appendChild(dayField);
        area.appendChild(el('div', { id: 'timeArea', 'class': 'book__times' }));
        var want = picked ? picked.date : activeDate;
        var keep = want && days.filter(function (d) { return d.date === want; })[0];
        if (keep) { area.querySelector('input[name="day"][value="' + keep.date + '"]').checked = true; renderTimes(keep); }
        else { activeDate = null; picked = null; }
    }

    function renderTimes(d) {
        var area = $('timeArea');
        area.textContent = '';
        var field = el('fieldset', { 'class': 'field field--choices' });
        field.appendChild(el('legend', {}, 'Times on ' + (WEEKDAY_LONG[d.label.split(' ')[0]] || '') + ' ' + d.label.split(' ').slice(1).join(' ')));
        var grid = el('div', { 'class': 'times' });
        d.slots.forEach(function (s) {
            var label = el('label', { 'class': 'chip chip--time' });
            var input = el('input', { type: 'radio', name: 'time', value: s.start });
            if (picked && picked.start === s.start) input.checked = true;
            label.appendChild(input); label.appendChild(el('span', {}, s.time));
            grid.appendChild(label);
            input.addEventListener('change', function () { picked = { start: s.start, date: d.date, day: d.label, time: s.time }; showError(''); });
        });
        field.appendChild(grid);
        area.appendChild(field);
    }

    /* ---- Turnstile ------------------------------------------------------- */

    var tsLoad = null, tsId = null, tsToken = null;
    function loadTurnstile() {
        if (tsLoad) return tsLoad;
        tsLoad = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            s.async = true; s.onload = resolve; s.onerror = function () { tsLoad = null; reject(new Error('turnstile')); };
            document.head.appendChild(s);
        });
        return tsLoad;
    }
    function prepareTurnstile() {
        if (tsId !== null) return;
        loadTurnstile().then(function () {
            if (!window.turnstile || tsId !== null) return;
            tsId = window.turnstile.render('#bookTs', {
                sitekey: SITEKEY, appearance: 'interaction-only',
                callback: function (t) { tsToken = t; },
                'expired-callback': function () { tsToken = null; },
                'error-callback': function () { tsToken = null; }
            });
        }).catch(function () { /* reported on submit */ });
    }
    function resetTurnstile() {
        tsToken = null;
        try { if (window.turnstile && tsId !== null) window.turnstile.reset(tsId); } catch (e) { /* ignore */ }
    }
    function waitForToken() {
        return new Promise(function (resolve, reject) {
            var waited = 0;
            (function poll() {
                if (tsToken) return resolve(tsToken);
                if (waited > 20000) return reject(new Error('turnstile'));
                waited += 150; setTimeout(poll, 150);
            })();
        });
    }

    /* ---- submit ---------------------------------------------------------- */

    function setBusy(on) {
        busy = on; nextBtn.disabled = on; backBtn.disabled = on;
        nextBtn.setAttribute('aria-busy', on ? 'true' : 'false');
        if (on) nextBtn.firstChild.nodeValue = 'Booking… '; else nextBtn.firstChild.nodeValue = 'Book this call ';
    }

    function submit() {
        setBusy(true); showError('');
        waitForToken().then(function (token) {
            var needs = Array.prototype.map.call(form.querySelectorAll('input[name="need"]:checked'), function (i) { return i.value; });
            var contact = form.querySelector('input[name="contact"]:checked');
            return fetch('/api/book', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    slot: picked.start, needs: needs, business: $('business').value.trim(), note: $('note').value.trim(),
                    name: $('name').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim(),
                    contact: contact ? contact.value : '', hp: $('bookHp').value, turnstileToken: token
                })
            });
        }).then(function (r) {
            return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { status: r.status, j: j }; });
        }).then(function (res) {
            resetTurnstile(); setBusy(false);
            if (res.j && res.j.ok) return done(res.j);
            var msg = (res.j && res.j.message) || 'Something broke on my side. Try again in a minute.';
            if (res.status === 409 && /time|taken|available|full/i.test(msg) && !/two calls/.test(msg)) { // the slot is gone: back to the times, refreshed
                picked = null; slotsLoaded = false; go(3); showError(msg); return;
            }
            showError(msg);
            errBox.scrollIntoView({ block: 'nearest' });
        }).catch(function (e) {
            resetTurnstile(); setBusy(false);
            showError(e && e.message === 'turnstile' ? "Couldn't confirm you're not a bot. Refresh the page and try again." : "Couldn't reach the server. Check your connection and try again.");
        });
    }

    function done(j) {
        form.hidden = true;
        var d = $('bookDone');
        $('doneText').textContent = 'Your 20 minute call is booked for ' + j.when + ' (South African time). I will call you on ' +
            (form.querySelector('input[name="contact"]:checked').value === 'whatsapp' ? 'WhatsApp' : 'the phone') + ' at ' + $('phone').value.trim() + '. Reference ' + j.reference + '.';
        $('calGoogle').href = j.calendar.google;
        $('calOutlook').href = j.calendar.outlook;
        $('doneMail').textContent = 'A confirmation with a cancel link is on its way to ' + $('email').value.trim() + '. If it is not in your inbox in a few minutes, check spam.';
        d.hidden = false;
        d.focus({ preventScroll: true });
        d.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    }

    /* ---- start ----------------------------------------------------------- */

    // The (i) next to each topic: hover or focus shows what it includes, a tap or Enter pins it open, Escape closes.
    var infoBtns = Array.prototype.slice.call(form.querySelectorAll('.info'));
    function setInfo(btn, open) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        $(btn.getAttribute('aria-controls')).parentNode.classList.toggle('is-open', open);
    }
    infoBtns.forEach(function (btn) {
        var pinned = false;
        btn.addEventListener('click', function () { pinned = !pinned; setInfo(btn, pinned); });
        btn.addEventListener('mouseenter', function () { setInfo(btn, true); });
        btn.addEventListener('mouseleave', function () { if (!pinned) setInfo(btn, false); });
        btn.addEventListener('focus', function () { if (btn.matches(':focus-visible')) setInfo(btn, true); });
        btn.addEventListener('blur', function () { if (!pinned) setInfo(btn, false); });
        btn.addEventListener('keydown', function (e) { if (e.key === 'Escape') { pinned = false; setInfo(btn, false); } });
    });

    // Topics can come in on the link: /book/?need=website or /book/?need=ads,brand
    try {
        (new URLSearchParams(location.search).get('need') || '').split(',').forEach(function (w) {
            var pre = form.querySelector('input[name="need"][value="' + w.replace(/[^a-z-]/g, '') + '"]');
            if (pre) pre.checked = true;
        });
    } catch (e) { /* ignore */ }
    go(1, false);
    loadSlots(); // start early so step 3 is ready
})();
