/* ==========================================================================
   Email links: keep the mailto (it works on phones and on computers with a
   mail app), and on click also copy the address and say so. Many desktops have
   no default mail app, so the mailto alone does nothing there.

   One delegated listener, so it covers every a[href^="mailto:"] on the page.
   It never calls preventDefault: the mailto still fires.
   Self-contained (injects its own few lines of CSS) so any page can load it.
   ========================================================================== */
(function () {
    'use strict';

    var style = document.createElement('style');
    style.textContent =
        '.mail-toast{position:fixed;left:50%;bottom:1.5rem;z-index:1000;width:max-content;max-width:calc(100vw - 2rem);box-sizing:border-box;' +
        'padding:.7rem 1.1rem;border:1px solid var(--accent,#5fbf95);border-radius:.5rem;' +
        'background:var(--surface,#1b1f22);color:var(--ink,#e8ebe8);font:500 .9375rem/1.4 var(--body,system-ui,sans-serif);' +
        'box-shadow:0 8px 24px rgba(0,0,0,.28);overflow-wrap:break-word;text-align:center;pointer-events:none;' +
        'opacity:0;translate:-50% .75rem;transition:opacity .2s ease,translate .24s ease}' +
        '.mail-toast.is-on{opacity:1;translate:-50% 0}' +
        '@media (prefers-reduced-motion:reduce){.mail-toast{transition:none}}';
    document.head.appendChild(style);

    var toast = null, timer = null;

    function show(message) {
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'mail-toast';
            toast.setAttribute('role', 'status');      // announced by screen readers without moving focus
            toast.setAttribute('aria-live', 'polite');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        // Re-trigger the transition if it is already showing.
        toast.classList.remove('is-on');
        void toast.offsetWidth;
        toast.classList.add('is-on');
        clearTimeout(timer);
        timer = setTimeout(function () { toast.classList.remove('is-on'); }, 3500);
    }

    function copy(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                var ok = document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) resolve(); else reject(new Error('copy'));
            } catch (e) { reject(e); }
        });
    }

    document.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href^="mailto:"]');
        if (!link) return;
        var address;
        try { address = decodeURIComponent(link.getAttribute('href').slice(7).split('?')[0]).trim(); } catch (e) { return; }
        if (!address) return;
        copy(address).then(function () {
            show('Copied ' + address + ' to your clipboard');
        }, function () {
            show("Couldn't copy it. The address is " + address);
        });
    });
})();
