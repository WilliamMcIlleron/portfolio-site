/* Sample proposal: demo e-signature. Stores the signed state in this tab only. */
(function () {
  'use strict';
  var BL = window.BL;
  var form = document.getElementById('sign');
  if (!form) return;
  var nameEl = document.getElementById('sig-name');
  var acc = document.getElementById('sig-accept');
  var prev = document.getElementById('sig-preview');
  var signed = document.getElementById('signed');
  var KEY = 'bl-proposal-signed';
  var now = new Date();
  document.getElementById('sig-date').value = now.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  nameEl.addEventListener('input', function () { prev.textContent = nameEl.value; });

  function err(id, msg, el) {
    document.getElementById('e-' + id).textContent = msg;
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    return !msg;
  }

  function showSigned(s, focus) {
    document.getElementById('s-name').textContent = s.name;
    document.getElementById('s-ref').textContent = s.ref;
    document.getElementById('s-time').textContent = s.time;
    form.hidden = true;
    signed.classList.add('is-on');
    if (focus) signed.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = nameEl.value.trim().replace(/\s+/g, ' ');
    var ok1 = err('sig-name', n.split(' ').length < 2 ? 'Please type your full name: first name and surname.' : '', nameEl);
    var ok2 = err('sig-accept', acc.checked ? '' : 'Please tick to confirm you accept the proposal.', acc);
    if (!ok1) { nameEl.focus(); return; }
    if (!ok2) { acc.focus(); return; }
    var t = new Date();
    var s = {
      name: n, ref: BL.ref('SIG'),
      time: t.toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ', this device clock'
    };
    BL.store.set(KEY, s);
    showSigned(s, true);
  });

  document.getElementById('unsign').addEventListener('click', function () {
    BL.store.del(KEY);
    signed.classList.remove('is-on');
    form.hidden = false; acc.checked = false;
    nameEl.focus();
  });
  ['print', 'print2'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', function () { window.print(); });
  });

  var saved = BL.store.get(KEY);
  if (saved) showSigned(saved, false);
})();
