/* ==========================================================================
   Enhancements only. Everything here is optional — the page reads and both
   forms submit with JavaScript switched off.

   Changed from script.js:
     · Theme toggle removed along with dark mode (DESIGN-5).
     · The contact form's fetch interceptor is gone (FUNNEL-6). Both forms
       now do a plain navigation to a thank-you page, which works without
       JS, gives an unambiguous confirmation, and leaves somewhere to put
       the next step.
     · Source tracking, previously only on the Lumen form, now runs here too.
   ========================================================================== */

(function () {
    'use strict';

    var root = document.documentElement;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* --- Theme ------------------------------------------------------------ */

    // Dark is the default; light is stored only when explicitly chosen.
    var themeToggle = document.getElementById('themeToggle');
    var themeColor = document.getElementById('themeColor');
    var GROUND = { dark: '#14171a', light: '#f0efec' };

    function currentTheme() {
        return root.dataset.theme === 'light' ? 'light' : 'dark';
    }

    function syncTheme() {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        themeToggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
        if (themeColor) themeColor.setAttribute('content', GROUND[currentTheme()]);
    }

    if (themeToggle) {
        syncTheme();

        themeToggle.addEventListener('click', function () {
            if (currentTheme() === 'dark') {
                root.dataset.theme = 'light';
            } else {
                delete root.dataset.theme;
            }
            try { localStorage.setItem('theme', currentTheme()); } catch (e) { /* ignore */ }
            syncTheme();
        });
    }

    /* --- Mobile navigation ------------------------------------------------ */

    var nav = document.getElementById('nav');
    var navToggle = document.getElementById('navToggle');

    function setNav(open) {
        nav.classList.toggle('is-open', open);
        // Stops the page scrolling behind the open panel.
        document.body.classList.toggle('nav-open', open);
        navToggle.setAttribute('aria-expanded', String(open));
        navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }

    if (nav && navToggle) {
        navToggle.addEventListener('click', function () {
            setNav(navToggle.getAttribute('aria-expanded') !== 'true');
        });

        nav.addEventListener('click', function (event) {
            if (event.target.closest('a')) setNav(false);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && nav.classList.contains('is-open')) {
                setNav(false);
                navToggle.focus();
            }
        });

        window.matchMedia('(min-width: 46.0625rem)').addEventListener('change', function (event) {
            if (event.matches) setNav(false);
        });
    }

    /* --- Masthead rule on scroll ------------------------------------------ */

    var masthead = document.querySelector('.masthead');

    if (masthead) {
        var sentinel = document.createElement('div');
        sentinel.setAttribute('aria-hidden', 'true');
        // After the skip link, not before it — the skip link must stay the
        // first thing in the document.
        masthead.before(sentinel);

        new IntersectionObserver(function (entries) {
            masthead.classList.toggle('is-stuck', !entries[0].isIntersecting);
        }).observe(sentinel);
    }

    /* --- Scroll reveal ---------------------------------------------------- */

    // Content must never depend on an animation firing. An earlier version of
    // this gated everything on an IntersectionObserver with a one-shot timer
    // failsafe, and a deep link (/#about, or a search result landing mid-page)
    // could leave a whole screen blank permanently. The rule now: the observer
    // is an enhancement, and `show` is idempotent and re-runnable, so any miss
    // self-corrects on the next scroll or resize.

    var revealables = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    var pending = revealables.length;

    function show(el) {
        if (el.classList.contains('is-visible')) return;
        el.style.transitionDelay = '';
        el.classList.add('is-visible');
        pending--;
    }

    function revealInView() {
        revealables.forEach(function (el) {
            var r = el.getBoundingClientRect();
            if (r.top < window.innerHeight && r.bottom > 0) show(el);
        });
    }

    function revealAll() { revealables.forEach(show); }

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
        revealAll();
    } else {
        var revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) show(entry.target);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

        revealables.forEach(function (el, index) {
            el.style.transitionDelay = (index % 4) * 50 + 'ms';
            revealObserver.observe(el);
        });

        // Backstop. Catches the anchor-load case, where the observer's first
        // callback can run against a pre-jump layout, and any browser that
        // simply doesn't deliver. Detaches itself once nothing is left.
        var ticking = false;
        function sweep() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                ticking = false;
                revealInView();
                if (pending <= 0) {
                    revealObserver.disconnect();
                    window.removeEventListener('scroll', sweep);
                    window.removeEventListener('resize', sweep);
                }
            });
        }

        window.addEventListener('scroll', sweep, { passive: true });
        window.addEventListener('resize', sweep);
        window.addEventListener('load', revealInView);

        // Newsreader and Karla arrive after first paint, and the swap reflows
        // the page — pulling elements into view with no scroll event to notice.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(revealInView);
        }

        revealInView();
    }

    /* --- Active section in the nav ---------------------------------------- */

    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__list a'))
        .filter(function (link) { return link.hash; });

    var sections = navLinks
        .map(function (link) { return document.querySelector(link.hash); })
        .filter(Boolean);

    if (sections.length) {
        function mark(id) {
            navLinks.forEach(function (link) {
                // "location" is the correct token for a position-within-page
                // indicator; "true" is for the current page in a nav.
                if (id && link.hash === '#' + id) {
                    link.setAttribute('aria-current', 'location');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        }

        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) mark(entry.target.id);
            });
        }, { rootMargin: '-40% 0px -55% 0px' });

        sections.forEach(function (section) { spy.observe(section); });

        // Above the first spied section nothing is current. Without this the
        // last match stayed marked, so the hero showed "Work" as current.
        var firstSection = sections[0];
        window.addEventListener('scroll', function () {
            if (firstSection.getBoundingClientRect().top > window.innerHeight * 0.6) mark(null);
        }, { passive: true });
    }

    /* --- Where the enquiry came from -------------------------------------- */

    // Tag your own links with ?src= (?src=ig-bio, ?src=dm) and that wins;
    // otherwise fall back to the referring site. Held in sessionStorage so a
    // detour via another page doesn't lose it.
    var sourceField = document.getElementById('source');

    if (sourceField) {
        var src = new URLSearchParams(location.search).get('src');

        try {
            if (src) {
                sessionStorage.setItem('src', src);
            } else {
                src = sessionStorage.getItem('src');
            }
        } catch (e) { /* private mode, carry on without it */ }

        if (!src) {
            try {
                src = document.referrer ? new URL(document.referrer).hostname : 'direct';
            } catch (e) {
                src = 'direct';
            }
        }

        sourceField.value = src;
    }

    /* --- Live instrumentation ----------------------------------------------
       Every number here is measured, not written. The page claims it loads
       fast on a bad connection; this makes the claim check itself in front of
       the visitor. Built in JS so there is no empty shell without it, and
       absolutely positioned so it costs no layout shift.                    */

    var hero = document.querySelector('.hero > .wrap');

    // encodedBodySize, not transferSize. transferSize collapses to a couple of
    // hundred bytes on a 304 and to 0 on a cache hit, so a returning visitor
    // would be shown "1.2 KB" — flattering and false. encodedBodySize is the
    // compressed size of the thing itself and stays honest either way.
    function pageWeight() {
        if (!window.performance || !performance.getEntriesByType) return null;
        var total = 0;
        var nav = performance.getEntriesByType('navigation')[0];
        if (nav) total += nav.encodedBodySize || nav.transferSize || 0;

        // A preloaded font stylesheet shows up twice; count each URL once.
        var seen = {};
        performance.getEntriesByType('resource').forEach(function (r) {
            if (seen[r.name]) return;
            seen[r.name] = true;
            total += r.encodedBodySize || r.transferSize || 0;
        });
        return total > 0 ? total : null;
    }

    function firstPaint() {
        if (!window.performance || !performance.getEntriesByType) return null;
        var fcp = performance.getEntriesByType('paint').filter(function (e) {
            return e.name === 'first-contentful-paint';
        })[0];
        return fcp ? fcp.startTime : null;
    }

    function joburgTime() {
        try {
            return new Intl.DateTimeFormat('en-ZA', {
                timeZone: 'Africa/Johannesburg',
                hour: '2-digit', minute: '2-digit', hour12: false
            }).format(new Date());
        } catch (e) {
            return null;
        }
    }

    function metric(label, value) {
        return '<dl><dt>' + label + '</dt><dd>' + value + '</dd></dl>';
    }

    // Inserted separately from the rest, because the paint entry may not exist
    // yet — Chrome withholds it entirely while a tab is in the background, and
    // only records it once the tab is first looked at. Middle-clicking a search
    // result is a normal way to arrive here, so the row waits rather than being
    // dropped for good.
    function addPaint(readout) {
        var paint = firstPaint();
        if (paint === null || readout.querySelector('[data-paint]')) return false;
        // A real <dl>, not a wrapper: .readout is a grid and these are its items.
        var dl = document.createElement('dl');
        dl.setAttribute('data-paint', '');
        dl.innerHTML = '<dt>First paint</dt><dd>' +
            (paint / 1000).toFixed(2) + '<span> s</span></dd>';
        readout.insertBefore(dl, readout.lastElementChild);
        return true;
    }

    // The weight must be read after `load`: a deferred script runs before lazy
    // resources have finished, so reading early under-reports it.
    function buildReadout() {
        if (!hero || document.querySelector('.readout')) return;

        var readout = document.createElement('aside');
        readout.className = 'readout';
        readout.setAttribute('aria-label', 'Live page measurements');

        var clock = joburgTime();
        var weight = pageWeight();
        var parts = [];

        if (clock) {
            parts.push('<p class="readout__live"><i aria-hidden="true"></i>Johannesburg ' +
                '<span id="jhbClock">' + clock + '</span></p>');
        }
        if (weight !== null) {
            parts.push(metric('This page', (weight / 1024).toFixed(1) + '<span> KB</span>'));
        }
        parts.push(metric('Viewport', '<span id="vp">' +
            window.innerWidth + ' × ' + window.innerHeight + '</span>'));

        if (parts.length < 2) return;

        readout.innerHTML = parts.join('');
        hero.appendChild(readout);

        if (!addPaint(readout) && window.PerformanceObserver) {
            try {
                var po = new PerformanceObserver(function () {
                    if (addPaint(readout)) po.disconnect();
                });
                po.observe({ type: 'paint', buffered: true });
            } catch (e) { /* older browser: the row simply stays absent */ }
        }

        var clockEl = document.getElementById('jhbClock');
        if (clockEl) {
            setInterval(function () {
                var t = joburgTime();
                if (t) clockEl.textContent = t;
            }, 10000);
        }

        var vp = document.getElementById('vp');
        if (vp) {
            window.addEventListener('resize', function () {
                vp.textContent = window.innerWidth + ' × ' + window.innerHeight;
            }, { passive: true });
        }
    }

    if (document.readyState === 'complete') {
        buildReadout();
    } else {
        // A zero timeout defers past the load handler itself, by which point the
        // final resource entries have been recorded.
        window.addEventListener('load', function () {
            setTimeout(buildReadout, 0);
        });
    }

    /* --- Scroll progress --------------------------------------------------- */

    if (!reduceMotion.matches) {
        var bar = document.createElement('div');
        bar.className = 'progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);

        var barTicking = false;
        window.addEventListener('scroll', function () {
            if (barTicking) return;
            barTicking = true;
            requestAnimationFrame(function () {
                barTicking = false;
                var max = document.documentElement.scrollHeight - window.innerHeight;
                bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
            });
        }, { passive: true });
    }

    /* --- Form validation --------------------------------------------------- */

    // Native validation showed one transient bubble and turned every required
    // field red at once via :user-invalid, with colour as the only persistent
    // channel. This reports only the fields that actually failed, in text, and
    // announces a summary. With JS off the browser's own validation still runs,
    // because `novalidate` is set here rather than in the markup.

    var form = document.getElementById('contactForm');
    var summary = document.getElementById('formErrors');

    if (form && summary) {
        form.setAttribute('novalidate', '');

        // Covers every form on the site; a field a given form doesn't have
        // simply never comes up, and anything missing here still gets the
        // generic fallback in showError.
        var MESSAGES = {
            name: 'Tell me your name.',
            email: 'I need an email address to reply to.',
            project: 'Pick the closest kind of project.',
            business: 'What is the business called?'
        };

        function fieldsOf(f) {
            return Array.prototype.slice.call(f.elements).filter(function (el) {
                return el.name && el.willValidate && el.type !== 'hidden';
            });
        }

        function clearError(el) {
            el.removeAttribute('aria-invalid');
            el.removeAttribute('aria-describedby');
            var note = document.getElementById(el.id + '-error');
            if (note) note.remove();
        }

        function showError(el) {
            clearError(el);
            var note = document.createElement('p');
            note.className = 'field__error';
            note.id = el.id + '-error';
            note.textContent = MESSAGES[el.name] ||
                (el.validity.typeMismatch ? 'That does not look like an email address.'
                                          : 'This one is needed.');
            if (el.validity.typeMismatch && el.name === 'email') {
                note.textContent = 'That does not look like an email address.';
            }
            el.setAttribute('aria-invalid', 'true');
            el.setAttribute('aria-describedby', note.id);
            el.closest('.field').appendChild(note);
        }

        var submitted = false;

        function validate(report) {
            var bad = fieldsOf(form).filter(function (el) { return !el.checkValidity(); });

            fieldsOf(form).forEach(function (el) {
                if (bad.indexOf(el) === -1) clearError(el);
            });

            if (report) bad.forEach(showError);

            if (!bad.length) {
                summary.textContent = '';
            } else if (report) {
                summary.textContent = bad.length === 1
                    ? 'One field still needs filling in.'
                    : bad.length + ' fields still need filling in.';
            }

            return bad;
        }

        form.addEventListener('submit', function (event) {
            var bad = validate(true);
            submitted = true;
            if (bad.length) {
                event.preventDefault();
                bad[0].focus();
            }
        });

        // Only start correcting live once they've tried once — nagging someone
        // mid-typing on their first pass is worse than saying nothing.
        form.addEventListener('blur', function (event) {
            if (!submitted || !event.target.name) return;
            if (event.target.checkValidity()) { clearError(event.target); } else { showError(event.target); }
        }, true);

        form.addEventListener('input', function (event) {
            if (submitted && event.target.checkValidity()) {
                clearError(event.target);
                validate(false);
            }
        });
    }

    /* --- Copy the email address ------------------------------------------- */

    // Progressive enhancement: the button is created here, so with JS off the
    // address is just a mailto link and nothing is missing.
    var mailLink = document.querySelector('.contact-links a[href^="mailto:"]');

    if (mailLink && navigator.clipboard) {
        var address = mailLink.getAttribute('href').replace('mailto:', '');
        var copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'copy-btn';
        copy.textContent = 'Copy';
        copy.setAttribute('aria-label', 'Copy email address to clipboard');

        // Screen readers get nothing from a textContent swap on the button they
        // just pressed, so state goes to a live region as well as the label.
        var announce = document.createElement('span');
        announce.className = 'vh';
        announce.setAttribute('role', 'status');
        announce.setAttribute('aria-live', 'polite');

        function setCopyState(label, announcement, copied) {
            copy.textContent = label;
            copy.setAttribute('aria-label', announcement || 'Copy email address to clipboard');
            if (copied) { copy.dataset.copied = 'true'; } else { delete copy.dataset.copied; }
            announce.textContent = announcement || '';
        }

        var revert;
        copy.addEventListener('click', function () {
            navigator.clipboard.writeText(address).then(function () {
                setCopyState('Copied', 'Email address copied to clipboard', true);
                clearTimeout(revert);
                revert = setTimeout(function () { setCopyState('Copy', null, false); }, 2500);
            }).catch(function () {
                setCopyState('Copy failed', 'Could not copy. Select the address and press control C.', false);
            });
        });

        mailLink.parentNode.appendChild(copy);
        mailLink.parentNode.appendChild(announce);
    }

    /* --- Footer year ------------------------------------------------------ */

    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
})();
