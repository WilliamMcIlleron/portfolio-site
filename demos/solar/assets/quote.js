/* Quote flow: six steps plus review, saved in sessionStorage, sends nothing. */
(function () {
  'use strict';
  var BL = window.BL, E = window.BLEstimate;
  var form = document.getElementById('qform');
  if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll('.qstep'));
  var KEY = 'bl-quote';
  var state = BL.store.get(KEY) || { step: 1, data: {} };
  var cur = state.step || 1;
  var LBL = {
    roof: { tile: 'Tile', sheet: 'Sheeting', flat: 'Flat concrete', ground: 'Ground mount', unsure: 'Not sure' },
    orient: { north: 'North', ne: 'North-east', nw: 'North-west', ew: 'East or west', flat: 'Flat roof' },
    goal: { backup: 'Backup', cut: 'Cut the bill', both: 'Both', offgrid: 'Off-grid' },
    package: { '': 'Not sure yet', backup: 'Backup', hybrid: 'Hybrid', grid: 'Grid-tied', offgrid: 'Off-grid' }
  };

  // Visit days: the next 10 weekdays and Saturdays, starting tomorrow
  var daySel = document.getElementById('day');
  (function () {
    var d = new Date(); d.setHours(12, 0, 0, 0); var n = 0;
    while (n < 10) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0) continue;
      var o = document.createElement('option');
      o.value = d.toISOString().slice(0, 10);
      o.textContent = d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }) + (d.getDay() === 6 ? ' (morning only)' : '');
      daySel.appendChild(o); n++;
    }
  })();

  // Prefill from the calculator, a package or a job
  var q = new URLSearchParams(location.search);
  var hand = BL.store.get('bl-handoff');
  var pre = document.getElementById('prefill'), preText = document.getElementById('prefill-text');
  var GOAL_FOR = { backup: 'backup', hybrid: 'both', grid: 'cut', offgrid: 'offgrid' };
  if (q.get('from') === 'calculator') {
    ['bill', 'roof', 'orient', 'goal'].forEach(function (k) { if (q.get(k)) state.data[k] = q.get(k); });
    if (q.get('loads')) state.data.loads = q.get('loads');
    var summary = hand && +hand.bill === +q.get('bill') ? hand.summary + ', ' + hand.price : null;
    if (!summary && E) {
      var r = E.run({ bill: +q.get('bill'), roof: q.get('roof'), orient: q.get('orient'), goal: q.get('goal'), loads: (q.get('loads') || '').split(',') });
      summary = r.kWp + ' kWp, ' + r.inverterKW + ' kW inverter, ' + r.batteryKWh + ' kWh battery, ' + E.rand(r.priceLow) + ' to ' + E.rand(r.priceHigh);
    }
    state.data.estimate = summary;
    preText.textContent = 'We carried over your calculator answers: R' + Number(q.get('bill')).toLocaleString('en-ZA').replace(/\s/g, ',') +
      ' a month, estimate ' + summary + '. Check them as you go.';
    pre.hidden = false;
  } else if (q.get('package')) {
    var pk = q.get('package');
    if (LBL.package[pk] !== undefined) { state.data.package = pk; state.data.goal = state.data.goal || GOAL_FOR[pk]; }
    if (q.get('job')) state.data.job = q.get('job');
    preText.textContent = q.get('job') ? 'Quoting something like the ' + q.get('job') + ' job. We preselected the ' + LBL.package[pk] + ' package.'
      : 'We preselected the ' + LBL.package[pk] + ' package. You can change it on step 3.';
    pre.hidden = false;
  } else if (state.data.estimate) {
    preText.textContent = 'Your calculator estimate is attached: ' + state.data.estimate + '.';
    pre.hidden = false;
  }

  // Restore saved values into the form
  Object.keys(state.data).forEach(function (k) {
    var els = form.querySelectorAll('[name="' + k + '"]');
    Array.prototype.forEach.call(els, function (el) {
      if (el.type === 'radio') el.checked = el.value === state.data[k];
      else if (el.type === 'checkbox') el.checked = !!state.data[k];
      else el.value = state.data[k];
    });
  });

  function collect() {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'radio') { if (el.checked) state.data[el.name] = el.value; }
      else if (el.type === 'checkbox') state.data[el.name] = el.checked;
      else state.data[el.name] = el.value.trim();
    });
    state.step = cur;
    BL.store.set(KEY, state);
  }
  form.addEventListener('change', collect);
  form.addEventListener('input', function (e) { if (e.target.tagName === 'TEXTAREA' || e.target.type === 'text') collect(); });

  // Progress
  var pl = document.getElementById('p-steps');
  steps.forEach(function (s) { var li = document.createElement('li'); li.textContent = s.getAttribute('data-name'); pl.appendChild(li); });

  function show(n, focus) {
    cur = n;
    steps.forEach(function (s, i) { s.hidden = i + 1 !== n; });
    document.getElementById('p-label').textContent = 'Step ' + n + ' of ' + steps.length;
    document.getElementById('p-name').textContent = steps[n - 1].getAttribute('data-name');
    document.getElementById('p-bar').style.width = (n / steps.length * 100) + '%';
    Array.prototype.forEach.call(pl.children, function (li, i) {
      li.className = i + 1 < n ? 'done' : '';
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    document.getElementById('back').hidden = n === 1;
    var next = document.getElementById('next');
    next.firstChild.textContent = n === steps.length ? 'Send request ' : (n === steps.length - 1 ? 'Review ' : 'Next ');
    if (n === steps.length) review();
    if (focus) {
      steps[n - 1].focus({ preventScroll: true });
      var t = document.getElementById('progress').getBoundingClientRect().top + window.scrollY - 90;
      if (window.scrollY > t) window.scrollTo({ top: t, behavior: BL.reducedMotion() ? 'auto' : 'smooth' });
    }
    state.step = n; BL.store.set(KEY, state);
  }

  function setErr(id, msg, el) {
    var e = document.getElementById('e-' + id); if (e) e.textContent = msg || '';
    if (el) { if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
    return !msg;
  }
  function validate(n) {
    var s = steps[n - 1], ok = true, first = null;
    function fail(target) { ok = false; if (!first) first = target; }
    s.querySelectorAll('fieldset[data-required]').forEach(function (fs) {
      var name = fs.getAttribute('data-required');
      var picked = fs.querySelector('input[name="' + name + '"]:checked');
      if (!setErr(name, picked ? '' : 'Please choose one.')) fail(fs.querySelector('input'));
    });
    var v = function (id) { return (document.getElementById(id).value || '').trim(); };
    if (n === 1 && !setErr('suburb', v('suburb').length < 2 ? 'Please enter your suburb.' : '', document.getElementById('suburb'))) fail(document.getElementById('suburb'));
    if (n === 3) {
      var b = +v('bill');
      if (!setErr('bill', !b ? 'Please enter your average bill in rand.' : (b < 100 || b > 100000 ? 'Enter an amount between R100 and R100,000.' : ''), document.getElementById('bill'))) fail(document.getElementById('bill'));
    }
    if (n === 5) {
      var nm = v('name'), c = v('cell'), em = v('email');
      if (!setErr('name', nm.split(/\s+/).length < 2 ? 'Please enter your first name and surname.' : '', document.getElementById('name'))) fail(document.getElementById('name'));
      if (!setErr('cell', !c ? 'Please enter your cell number.' : (!BL.saCell(c) ? 'That does not look like a South African cell number. Try 082 123 4567.' : ''), document.getElementById('cell'))) fail(document.getElementById('cell'));
      if (!setErr('email', !em ? 'Please enter your email.' : (!BL.email(em) ? 'Please check the email address, for example name@example.co.za.' : ''), document.getElementById('email'))) fail(document.getElementById('email'));
    }
    if (n === 6) {
      if (!setErr('day', v('day') ? '' : 'Please choose a day.', daySel)) fail(daySel);
      var cons = document.getElementById('consent');
      if (!setErr('consent', cons.checked ? '' : 'Please tick this so we may call you about the quote.', cons)) fail(cons);
      var slot = form.querySelector('input[name="slot"]:checked'), dayVal = v('day');
      if (slot && dayVal && new Date(dayVal + 'T12:00:00').getDay() === 6 && slot.value.indexOf('Afternoon') === 0) {
        setErr('slot', 'Saturday visits are mornings only. Please pick the morning or another day.'); fail(form.querySelector('input[name="slot"]'));
      }
    }
    if (first) first.focus();
    return ok;
  }

  function review() {
    collect();
    var d = state.data, rows = [
      ['Property', d.ptype + ', ' + d.suburb, 1],
      ['Roof', LBL.roof[d.roof] + ', faces ' + LBL.orient[d.orient], 2],
      ['Monthly bill', 'R' + Number(d.bill).toLocaleString('en-ZA').replace(/\s/g, ','), 3],
      ['You want', LBL.goal[d.goal] + (d.package ? ' (' + LBL.package[d.package] + ' package)' : ''), 3],
      ['Timeline', d.timeline + (d.notes ? '. Notes: ' + d.notes : ''), 4],
      ['Contact', d.name + ', ' + d.cell + ', ' + d.email, 5],
      ['Site visit', dayLabel(d.day) + ', ' + d.slot, 6]
    ];
    if (d.estimate) rows.splice(4, 0, ['Calculator estimate', d.estimate, 3]);
    var dl = document.getElementById('review'); dl.innerHTML = '';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd'), b = document.createElement('button');
      dt.textContent = r[0]; dd.textContent = r[1];
      b.type = 'button'; b.className = 'edit'; b.textContent = 'Edit'; b.setAttribute('aria-label', 'Edit ' + r[0].toLowerCase());
      b.addEventListener('click', function () { show(r[2], true); });
      dl.appendChild(dt); dl.appendChild(dd); dl.appendChild(b);
    });
  }
  function dayLabel(iso) {
    if (!iso) return '';
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  document.getElementById('back').addEventListener('click', function () { collect(); show(Math.max(1, cur - 1), true); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (cur < steps.length) {
      if (!validate(cur)) return;
      collect(); show(cur + 1, true);
      return;
    }
    for (var i = 1; i < steps.length; i++) { if (!validate(i)) { show(i, true); validate(i); return; } }
    finish();
  });

  function finish() {
    collect();
    var d = state.data, ref = BL.ref('BL');
    BL.store.set('bl-last-ref', { ref: ref, name: d.name, at: new Date().toISOString() });
    BL.store.del(KEY); BL.store.del('bl-handoff');
    form.hidden = true; document.getElementById('progress').hidden = true;
    document.getElementById('done-name').textContent = d.name.split(/\s+/)[0];
    document.getElementById('done-ref').textContent = ref;
    document.getElementById('done-cell').textContent = d.cell;
    document.getElementById('done-visit').textContent = dayLabel(d.day) + ', ' + d.slot.split(',')[0].toLowerCase();
    var done = document.getElementById('done'); done.hidden = false; done.focus();
    window.scrollTo({ top: done.getBoundingClientRect().top + window.scrollY - 100, behavior: 'auto' });
  }
  document.getElementById('restart').addEventListener('click', function () {
    BL.store.del(KEY); location.href = 'quote.html';
  });

  show(Math.min(Math.max(1, cur), steps.length), false);
})();
