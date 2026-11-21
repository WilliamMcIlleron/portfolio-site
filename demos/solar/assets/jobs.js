/* Jobs page: filters and the project dialog. */
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('jobs-data').textContent);
  var cards = Array.prototype.slice.call(document.querySelectorAll('.job'));
  var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
  var count = document.getElementById('count');
  var LABEL = { all: 'all types', backup: 'Backup', hybrid: 'Hybrid', grid: 'Grid-tied', offgrid: 'Off-grid' };

  filters.forEach(function (b) {
    var f = b.getAttribute('data-f');
    b.querySelector('.c').textContent = f === 'all' ? cards.length
      : cards.filter(function (c) { return c.getAttribute('data-cat') === f; }).length;
    b.addEventListener('click', function () { apply(f, true); });
  });

  function apply(f, push) {
    var n = 0;
    filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-f') === f)); });
    cards.forEach(function (c) {
      var show = f === 'all' || c.getAttribute('data-cat') === f;
      c.hidden = !show; if (show) n++;
    });
    count.textContent = 'Showing ' + n + ' sample ' + (n === 1 ? 'project' : 'projects') + (f === 'all' ? '' : ': ' + LABEL[f]) + '.';
    if (push && history.replaceState) history.replaceState(null, '', f === 'all' ? location.pathname : '#' + f);
  }
  var start = location.hash.slice(1);
  apply(LABEL[start] ? start : 'all', false);

  // Dialog
  var dlg = document.getElementById('lb');
  var img = document.getElementById('lb-img');
  var opener = null;
  function open(i, btn) {
    var j = data[i];
    opener = btn;
    img.src = 'img/' + j.img + '-' + j.widths[1] + '.webp';
    img.srcset = j.widths.map(function (w) { return 'img/' + j.img + '-' + w + '.webp ' + w + 'w'; }).join(', ');
    img.sizes = '(max-width: 760px) 100vw, 560px';
    img.width = j.w; img.height = j.h; img.alt = j.alt;
    document.getElementById('lb-title').textContent = j.title;
    document.getElementById('lb-note').textContent = j.note;
    var rows = [['Type', j.catLabel], ['Suburb', j.suburb], ['Panels', j.size], ['Inverter', j.inverter], ['Battery', j.battery], ['Roof', j.roof], ['Runs', j.runs]];
    var spec = document.getElementById('lb-spec');
    spec.innerHTML = '';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1]; spec.appendChild(dt); spec.appendChild(dd);
    });
    document.getElementById('lb-cta').href = 'quote.html?package=' + j.cat + '&job=' + encodeURIComponent(j.title);
    dlg.showModal();
    document.getElementById('lb-close').focus();
  }
  cards.forEach(function (c) {
    var b = c.querySelector('.job-open');
    b.addEventListener('click', function () { open(+c.getAttribute('data-job'), b); });
  });
  document.getElementById('lb-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); }); // backdrop
  dlg.addEventListener('close', function () { if (opener) opener.focus(); });
})();
