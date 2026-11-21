/* Contact page: validates the enquiry form, sends nothing. */
(function () {
  'use strict';
  var BL = window.BL, f = document.getElementById('cform');
  if (!f) return;
  function err(id, msg) {
    var el = document.getElementById(id);
    document.getElementById('e-' + id).textContent = msg;
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    return msg ? el : null;
  }
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (id) { return document.getElementById(id).value.trim(); };
    var bad = [
      err('c-name', v('c-name').length < 2 ? 'Please enter your name.' : ''),
      err('c-cell', !v('c-cell') ? 'Please enter your cell number.' : (!BL.saCell(v('c-cell')) ? 'That does not look like a South African cell number. Try 082 123 4567.' : '')),
      err('c-email', v('c-email') && !BL.email(v('c-email')) ? 'Please check the email address.' : ''),
      err('c-msg', v('c-msg').length < 5 ? 'Please write a short message.' : '')
    ].filter(Boolean);
    if (bad.length) { bad[0].focus(); return; }
    document.getElementById('c-ok-name').textContent = v('c-name').split(/\s+/)[0];
    f.hidden = true;
    var ok = document.getElementById('c-ok'); ok.hidden = false; ok.focus();
  });
})();
