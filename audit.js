/* ==========================================================================
   Site checker, front end. Two jobs:
     1. #auditForm on the home page: send an address to /api/audit, show the
        real progress steps as they stream in, then the report, a share link
        and a lead form.
     2. #sharedReport on /check/<id>: fetch a stored report and show it.

   Everything the page receives is shown with textContent, never as HTML.
   Turnstile (Cloudflare's bot check) is loaded on first focus of the input,
   so nothing third-party loads before the visitor interacts.
   Contract with the backend (NDJSON, one JSON object per line):
     {"type":"step","id":"open|phone|buttons|google|speed","label":"..."}
     {"type":"report","report":{...,"reportId":"..."},"shareUrl":"/check/<id>"}
     {"type":"error","code":"...","message":"..."}
   ========================================================================== */
(function () {
    'use strict';

    var SITEKEY = '0x4AAAAAAGI2md2DR4NtDDGG';
    var WA = 'https://wa.me/27723555350?text=';

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function mark(kind) {
        var ns = 'http://www.w3.org/2000/svg';
        var s = document.createElementNS(ns, 'svg');
        s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('width', '18'); s.setAttribute('height', '18');
        s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'mark mark--' + kind);
        var shape;
        if (kind === 'ok') {
            shape = document.createElementNS(ns, 'path'); shape.setAttribute('d', 'M4 10.5l4 4 8-9');
            shape.setAttribute('stroke-linecap', 'round'); shape.setAttribute('stroke-linejoin', 'round');
        } else {
            shape = document.createElementNS(ns, 'circle');
            shape.setAttribute('cx', '10'); shape.setAttribute('cy', '10'); shape.setAttribute('r', '6.5');
        }
        shape.setAttribute('fill', 'none'); shape.setAttribute('stroke', 'currentColor'); shape.setAttribute('stroke-width', '2.2');
        s.appendChild(shape);
        return s;
    }

    /* ---- the report ------------------------------------------------------ */

    function renderReport(root, r, shareUrl) {
        root.textContent = '';
        var head = el('h3', 'audit__rh', r.host + ': what the check found');
        head.tabIndex = -1;
        root.appendChild(head);
        root.appendChild(el('p', 'audit__time', 'Checked ' + r.checkedLabel));

        function list(title, items, kind, ordered) {
            if (!items || !items.length) return;
            root.appendChild(el('h4', 'audit__h', title));
            var ul = el(ordered ? 'ol' : 'ul', 'audit__list');
            items.forEach(function (it, i) {
                var li = el('li', 'audit__item');
                if (ordered) li.appendChild(el('span', 'audit__num', String(i + 1)));
                else li.appendChild(mark(kind));
                li.appendChild(el('span', 'audit__txt', it.text));
                ul.appendChild(li);
            });
            root.appendChild(ul);
        }
        list("What's working", r.working, 'ok', false);
        list('Worth fixing', r.worth, 'open', true);
        list("Couldn't tell", r.unclear, 'open', false);
        if (r.notes && r.notes.length) {
            var notes = el('ul', 'audit__notes');
            r.notes.forEach(function (n) { notes.appendChild(el('li', null, n)); });
            root.appendChild(notes);
        }
        root.appendChild(el('h4', 'audit__h', "What this check can't see"));
        root.appendChild(el('p', 'audit__cant', r.cantSee));

        if (shareUrl) {
            var abs = location.origin + shareUrl;
            var row = el('div', 'audit__share');
            row.appendChild(el('span', 'audit__sharelbl', 'Link to this report'));
            var input = el('input', 'audit__sharein'); input.type = 'text'; input.readOnly = true; input.value = abs;
            input.setAttribute('aria-label', 'Link to this report');
            var btn = el('button', 'audit__copy', 'Copy link'); btn.type = 'button';
            btn.addEventListener('click', function () {
                function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy link'; }, 2000); }
                if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(abs).then(done, function () { input.select(); });
                else { input.select(); }
            });
            row.appendChild(input); row.appendChild(btn);
            root.appendChild(row);
        }
        return head;
    }

    /* ---- Turnstile ------------------------------------------------------- */

    var tsLoad = null, tsWidgets = {};
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
    function getToken(boxId) {
        return loadTurnstile().then(function () {
            return new Promise(function (resolve, reject) {
                var t = window.turnstile;
                if (!t) { reject(new Error('turnstile')); return; }
                if (tsWidgets[boxId] !== undefined) { try { t.remove(tsWidgets[boxId]); } catch (e) { /* already gone */ } }
                var timer = setTimeout(function () { reject(new Error('timeout')); }, 25000);
                tsWidgets[boxId] = t.render('#' + boxId, {
                    sitekey: SITEKEY, appearance: 'interaction-only',
                    callback: function (tok) { clearTimeout(timer); resolve(tok); },
                    'error-callback': function () { clearTimeout(timer); reject(new Error('turnstile')); }
                });
            });
        });
    }

    /* ---- the form on the home page --------------------------------------- */

    var form = $('auditForm');
    if (form) {
        var input = $('auditUrl'), go = $('auditGo'), msg = $('auditMsg'), steps = $('auditSteps'), out = $('auditReport'), again = $('auditAgain');
        var busy = false;

        input.addEventListener('focus', function () { loadTurnstile().catch(function () { /* shown on submit */ }); }, { once: true });

        function say(text, withHelp) {
            msg.textContent = text; msg.hidden = !text;
            if (text && withHelp) {
                var p = el('span', 'audit__help', ' ');
                var a = el('a', null, 'Message me on WhatsApp.');
                a.href = WA + encodeURIComponent('Hi William, can you check my website by hand? ' + (input.value || ''));
                a.target = '_blank'; a.rel = 'noopener';
                p.appendChild(a); msg.appendChild(p);
            }
        }
        function setBusy(b) { busy = b; go.disabled = b; go.textContent = b ? 'Checking…' : 'Check my site'; form.setAttribute('aria-busy', String(b)); }
        function addStep(label) {
            var last = steps.lastElementChild; if (last) last.classList.remove('is-now');
            var li = el('li', 'is-now', label); steps.appendChild(li);
        }

        function handle(ev) {
            if (ev.type === 'step') addStep(ev.label);
            else if (ev.type === 'report') {
                steps.textContent = ''; steps.hidden = true;
                var head = renderReport(out, ev.report, ev.shareUrl);
                out.hidden = false; again.hidden = false;
                lead(ev.report);
                head.focus();
            } else if (ev.type === 'error') {
                steps.textContent = ''; steps.hidden = true;
                say(ev.message || 'Something broke on my side. Try again in a minute.', ev.code === 'blocked-by-site' || ev.code === 'rate' || ev.code === 'internal');
                input.focus();
            }
        }

        function readStream(res) {
            if (!res.ok && res.headers.get('content-type') && res.headers.get('content-type').indexOf('json') >= 0 && res.headers.get('content-type').indexOf('ndjson') < 0) {
                return res.json().then(function (j) { handle({ type: 'error', code: 'internal', message: (j && j.message) || null }); });
            }
            if (!res.body || !res.body.getReader) {
                return res.text().then(function (t) { t.split('\n').forEach(function (l) { if (l.trim()) handle(JSON.parse(l)); }); });
            }
            var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
            function pump() {
                return reader.read().then(function (r) {
                    if (r.done) { if (buf.trim()) handle(JSON.parse(buf)); return; }
                    buf += dec.decode(r.value, { stream: true });
                    var lines = buf.split('\n'); buf = lines.pop();
                    lines.forEach(function (l) { if (l.trim()) handle(JSON.parse(l)); });
                    return pump();
                });
            }
            return pump();
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy) return;
            var v = input.value.trim();
            say('');
            if (!v) { say('Paste your website address first, like yourbusiness.co.za.'); input.focus(); return; }
            out.hidden = true; out.textContent = ''; again.hidden = true;
            var old = $('auditLead'); if (old) old.remove();
            steps.textContent = ''; steps.hidden = false;
            setBusy(true);
            getToken('tsAudit').then(function (token) {
                return fetch('/api/audit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: v, turnstileToken: token }) });
            }, function () {
                handle({ type: 'error', code: 'turnstile', message: "Couldn't confirm you're not a bot. Refresh the page and try again." });
                return null;
            }).then(function (res) { return res ? readStream(res) : null; })
              .catch(function () { handle({ type: 'error', code: 'internal', message: 'Something broke on my side. Try again in a minute, or send me the address.' }); })
              .then(function () { setBusy(false); });
        });

        again.addEventListener('click', function () {
            out.hidden = true; out.textContent = ''; again.hidden = true; say('');
            var old = $('auditLead'); if (old) old.remove();
            input.value = ''; input.focus();
        });

        // The lead form: the server reads the report from its own copy by reportId, so nothing from the page is trusted.
        function lead(report) {
            var wrap = el('div', 'audit__lead'); wrap.id = 'auditLead';
            wrap.appendChild(el('h4', 'audit__h', 'Want the rest checked by hand?'));
            wrap.appendChild(el('p', 'audit__cant', "Free, written up within two working days. I look at the things this check can't see."));
            var f = el('form', 'audit__leadform'); f.noValidate = true;
            function field(label, name, type, auto, req) {
                var l = el('label', null); l.appendChild(el('span', null, label + (req ? '' : ' (optional)')));
                var i = el('input'); i.name = name; i.type = type; i.autocomplete = auto; if (req) i.required = true; l.appendChild(i); f.appendChild(l); return i;
            }
            var b = field('Business name', 'business', 'text', 'organization', true);
            var m = field('Email', 'email', 'email', 'email', true);
            var w = field('WhatsApp', 'whatsapp', 'tel', 'tel', false);
            var err = el('p', 'audit__err'); err.setAttribute('role', 'alert'); err.hidden = true; f.appendChild(err);
            var box = el('div', 'ts'); box.id = 'tsLead'; f.appendChild(box);
            var send = el('button', 'btn', 'Send me the full check'); send.type = 'submit'; f.appendChild(send);
            f.addEventListener('submit', function (e) {
                e.preventDefault(); err.hidden = true;
                if (!b.value.trim() || !/^\S+@\S+\.\S+$/.test(m.value.trim())) { err.textContent = 'Add your business name and an email I can reply to.'; err.hidden = false; return; }
                send.disabled = true; send.textContent = 'Sending…';
                getToken('tsLead').then(function (token) {
                    return fetch('/api/audit-lead', { method: 'POST', headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ business: b.value.trim(), email: m.value.trim(), whatsapp: w.value.trim(), reportId: report.reportId, turnstileToken: token }) });
                }).then(function (r) { return r.json(); }).then(function (j) {
                    if (j && j.ok) { wrap.textContent = ''; var done = el('p', 'audit__done', "Thanks. I'll write it up and send it within two working days."); done.tabIndex = -1; wrap.appendChild(done); done.focus(); }
                    else { err.textContent = (j && j.message) || 'Something broke on my side. Email william@williammcilleron.com instead.'; err.hidden = false; send.disabled = false; send.textContent = 'Send me the full check'; }
                }).catch(function () { err.textContent = "Couldn't send that. Email william@williammcilleron.com instead."; err.hidden = false; send.disabled = false; send.textContent = 'Send me the full check'; });
            });
            wrap.appendChild(f); out.after(wrap);
        }
    }

    /* ---- /check/<id> ------------------------------------------------------ */

    var shared = $('sharedReport');
    if (shared) {
        var id = (location.pathname.match(/\/check\/([A-Za-z0-9]{12})\/?$/) || [])[1];
        var status = $('sharedStatus');
        if (!id) { status.textContent = "That link isn't a report address."; }
        else {
            fetch('/api/check/' + id, { headers: { accept: 'application/json' } }).then(function (r) {
                if (!r.ok) throw new Error('missing');
                return r.json();
            }).then(function (j) {
                var report = j.report || j;
                status.hidden = true; shared.hidden = false;
                renderReport(shared, report, null).focus();
            }).catch(function () { status.textContent = "This report has expired, or the link isn't right. Reports are kept for 30 days."; });
        }
    }
})();
