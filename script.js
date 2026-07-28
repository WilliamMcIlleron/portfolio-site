/* ==========================================================================
   Enhancements only. Every one of these is optional — the page reads and
   the form submits with JavaScript switched off.
   ========================================================================== */

(function () {
    'use strict';

    var root = document.documentElement;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* --- Theme ------------------------------------------------------------ */

    var themeToggle = document.getElementById('themeToggle');
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)');

    function currentTheme() {
        return root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
    }

    function syncToggleLabel() {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        themeToggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    }

    if (themeToggle) {
        syncToggleLabel();

        themeToggle.addEventListener('click', function () {
            var next = currentTheme() === 'dark' ? 'light' : 'dark';
            root.dataset.theme = next;
            try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
            syncToggleLabel();
        });

        // Follow the OS while the visitor hasn't expressed a preference.
        systemDark.addEventListener('change', function () {
            if (!root.dataset.theme) syncToggleLabel();
        });
    }

    /* --- Mobile navigation ------------------------------------------------ */

    var nav = document.getElementById('nav');
    var navToggle = document.getElementById('navToggle');

    function setNav(open) {
        nav.classList.toggle('is-open', open);
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

        // Reset state if the viewport grows past the mobile breakpoint.
        window.matchMedia('(min-width: 46.0625rem)').addEventListener('change', function (event) {
            if (event.matches) setNav(false);
        });
    }

    /* --- Masthead rule on scroll ------------------------------------------ */

    var masthead = document.querySelector('.masthead');
    var sentinel = document.createElement('div');

    if (masthead) {
        sentinel.setAttribute('aria-hidden', 'true');
        document.body.prepend(sentinel);

        new IntersectionObserver(function (entries) {
            masthead.classList.toggle('is-stuck', !entries[0].isIntersecting);
        }).observe(sentinel);
    }

    /* --- Scroll reveal ---------------------------------------------------- */

    var revealables = document.querySelectorAll('.reveal');
    var revealObserver;

    function revealAll() {
        if (revealObserver) revealObserver.disconnect();
        revealables.forEach(function (el) {
            el.style.transitionDelay = '';
            el.classList.add('is-visible');
        });
    }

    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
        revealAll();
    } else {
        // Content must never depend on an animation firing. If the observer
        // hasn't reported anything shortly after load — unsupported, throttled,
        // or a page that was never given a rendering opportunity — show it all.
        var failsafe = setTimeout(revealAll, 1500);

        revealObserver = new IntersectionObserver(function (entries, observer) {
            clearTimeout(failsafe);
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });

        revealables.forEach(function (el, index) {
            // A short stagger so grouped items arrive in sequence, not as a block.
            el.style.transitionDelay = (index % 6) * 60 + 'ms';
            revealObserver.observe(el);
        });
    }

    /* --- Active section in the nav ---------------------------------------- */

    var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__list a'));
    var sections = navLinks
        .map(function (link) { return document.querySelector(link.hash); })
        .filter(Boolean);

    if (sections.length) {
        var spy = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                navLinks.forEach(function (link) {
                    if (link.hash === '#' + entry.target.id) {
                        link.setAttribute('aria-current', 'true');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                });
            });
        }, { rootMargin: '-40% 0px -55% 0px' });

        sections.forEach(function (section) { spy.observe(section); });
    }

    /* --- Contact form ----------------------------------------------------- */

    var form = document.getElementById('contactForm');
    var status = document.getElementById('formStatus');
    var submitBtn = document.getElementById('submitBtn');

    if (form && status && submitBtn) {
        form.addEventListener('submit', function (event) {
            if (!form.checkValidity()) return; // let the browser handle it

            event.preventDefault();

            var label = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending…';
            status.classList.remove('is-error');
            status.textContent = '';

            fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(new FormData(form)).toString()
            })
                .then(function (response) {
                    if (!response.ok) throw new Error(response.status);
                    form.reset();
                    status.textContent = 'Thanks, that came through. I\'ll reply within a day or two.';
                })
                .catch(function () {
                    status.classList.add('is-error');
                    status.textContent = 'That didn\'t send. Email me directly at williamjonahmci@gmail.com.';
                })
                .finally(function () {
                    submitBtn.disabled = false;
                    submitBtn.textContent = label;
                });
        });
    }
})();
