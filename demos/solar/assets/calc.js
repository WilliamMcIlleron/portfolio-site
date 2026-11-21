/* Calculator page. All maths lives in estimate.js; this file reads the form,
   paints the result and the chart, and hands the estimate to quote.html. */
(function () {
  'use strict';
  var E = window.BLEstimate, BL = window.BL;
  var form = document.getElementById('calc');
  if (!form || !E) return;

  var DEFAULT_LOADS = ['lights', 'fridge', 'tv', 'office', 'gate'];
  var range = document.getElementById('bill');
  var num = document.getElementById('bill-n');
  var out = {};
  document.querySelectorAll('[data-o]').forEach(function (el) { out[el.getAttribute('data-o')] = el; });

  // Build the essentials checkboxes from the engine's list
  var box = document.getElementById('loads');
  Object.keys(E.LOADS).forEach(function (k) {
    var L = E.LOADS[k];
    var lab = document.createElement('label');
    lab.className = 'choice';
    lab.innerHTML = '<input type="checkbox" name="loads" value="' + k + '"><span>' + L.label +
      '<small>about ' + L.avg + ' W average, ' + (L.peak / 1000).toFixed(1) + ' kW peak</small></span>';
    box.appendChild(lab);
  });

  // Prefill from the query string (home teaser, packages) or a saved estimate
  var q = new URLSearchParams(location.search);
  var saved = BL.store.get('bl-estimate') || {};
  var start = {
    bill: +q.get('bill') || saved.bill || 2500,
    roof: q.get('roof') || saved.roof || 'tile',
    orient: q.get('orient') || saved.orient || 'north',
    goal: q.get('goal') || saved.goal || 'both',
    loads: q.get('loads') ? q.get('loads').split(',') : (saved.loads || DEFAULT_LOADS)
  };
  setBill(start.bill);
  ['roof', 'orient', 'goal'].forEach(function (n) {
    var el = form.querySelector('input[name="' + n + '"][value="' + start[n] + '"]');
    if (el) el.checked = true;
  });
  form.querySelectorAll('input[name="loads"]').forEach(function (el) { el.checked = start.loads.indexOf(el.value) > -1; });

  function setBill(v) {
    v = Math.max(300, Math.min(20000, Math.round(v)));
    num.value = v;
    range.value = Math.max(500, Math.min(10000, v));
    range.style.setProperty('--p', ((range.value - range.min) / (range.max - range.min) * 100) + '%');
  }
  function radio(n) { var el = form.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : null; }
  function inputs() {
    return {
      bill: +num.value || 2500, roof: radio('roof'), orient: radio('orient'), goal: radio('goal'),
      loads: Array.prototype.map.call(form.querySelectorAll('input[name="loads"]:checked'), function (el) { return el.value; })
    };
  }

  var GOAL_LABEL = { backup: 'Backup', cut: 'Cut the bill', both: 'Bill and backup', offgrid: 'Off-grid' };
  var last;
  function paint() {
    var i = inputs(), r = E.run(i);
    last = { inputs: i, result: r };
    out.kwp.innerHTML = r.kWp + '<small>kWp</small>';
    out.panels.textContent = r.panels + ' x 550 W panels, about ' + r.roofM2 + ' m² of roof';
    out.inv.innerHTML = r.inverterKW + '<small>kW</small>';
    out.peak.textContent = 'handles ' + (r.peakW / 1000).toFixed(1) + ' kW of essentials at once';
    out.bat.innerHTML = r.batteryKWh + '<small>kWh</small>';
    out.hours.textContent = r.input.goal === 'offgrid' ? 'one night and a cloudy morning'
      : 'about ' + Math.floor(r.backupHours) + ' h of your essentials';
    out.price.textContent = E.rand(r.priceLow) + ' to ' + E.rand(r.priceHigh);
    out.save.textContent = E.rand(r.saveLow) + ' to ' + E.rand(r.saveHigh);
    out.pb.textContent = E.years(r.paybackFast) + ' to ' + E.years(r.paybackSlow) + ' years';
    chart(r);
    BL.store.set('bl-estimate', i);
  }

  // Inline SVG chart: saving band (low to high) rising over 20 years, price band flat
  function chart(r) {
    var svg = document.getElementById('chart');
    var W = 520, H = 240, L = 52, R = 10, T = 12, B = 30;
    var max = Math.max(r.cumHigh[20], r.priceHigh) * 1.06;
    var x = function (y) { return L + (W - L - R) * y / 20; };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var step = niceStep(max / 5), grid = '';
    for (var v = 0; v <= max; v += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(245,242,234,.10)"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" fill="#aab3bb" font-size="11">' + short(v) + '</text>';
    }
    for (var yr = 0; yr <= 20; yr += 5) {
      grid += '<text x="' + x(yr) + '" y="' + (H - 8) + '" text-anchor="middle" fill="#aab3bb" font-size="11">' + (yr === 0 ? 'Year 0' : yr) + '</text>';
    }
    var top = '', bot = '';
    for (var k = 0; k <= 20; k++) { top += (k ? 'L' : 'M') + x(k) + ' ' + y(r.cumHigh[k]); }
    for (k = 20; k >= 0; k--) { bot += 'L' + x(k) + ' ' + y(r.cumLow[k]); }
    var price = '<rect x="' + L + '" width="' + (W - L - R) + '" y="' + y(r.priceHigh) + '" height="' + Math.max(2, y(r.priceLow) - y(r.priceHigh)) + '" fill="rgba(245,242,234,.16)"/>' +
      '<text x="' + (W - R - 4) + '" y="' + (y(r.priceHigh) - 6) + '" text-anchor="end" fill="#f5f2ea" font-size="11">System price</text>';
    var marks = '';
    [[r.paybackFast, r.priceLow], [r.paybackSlow, r.priceHigh]].forEach(function (m) {
      if (m[0] !== null) marks += '<circle cx="' + x(m[0]) + '" cy="' + y(m[1]) + '" r="4.5" fill="#f5f2ea" stroke="#0f1418" stroke-width="2"/>';
    });
    var desc = 'Cumulative saving after 20 years is between ' + E.rand(r.cumLow[20]) + ' and ' + E.rand(r.cumHigh[20]) +
      ', against a system price of ' + E.rand(r.priceLow) + ' to ' + E.rand(r.priceHigh) + '. Savings pass the price after ' +
      E.years(r.paybackFast) + ' to ' + E.years(r.paybackSlow) + ' years.';
    svg.innerHTML = '<desc id="chart-desc">' + desc + '</desc>' + grid + price +
      '<path d="' + top + bot + 'Z" fill="rgba(246,178,27,.30)"/>' +
      '<path d="' + top + '" fill="none" stroke="#f6b21b" stroke-width="2.5"/>' + marks;
    var rows = '';
    [1, 2, 3, 5, 7, 10, 15, 20].forEach(function (yr) {
      rows += '<tr><td>' + yr + '</td><td>' + E.rand(r.cumLow[yr]) + '</td><td>' + E.rand(r.cumHigh[yr]) + '</td></tr>';
    });
    document.getElementById('chart-table').innerHTML = rows;
  }
  function niceStep(raw) {
    var p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function short(v) { if (!v) return 'R0'; return v >= 1e6 ? 'R' + (v / 1e6).toFixed(1).replace('.0', '') + 'm' : 'R' + Math.round(v / 1000) + 'k'; }

  range.addEventListener('input', function () { setBill(+range.value); paint(); });
  num.addEventListener('change', function () { setBill(+num.value || 2500); paint(); });
  form.addEventListener('change', function (e) { if (e.target !== num) paint(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  document.getElementById('send').addEventListener('click', function () {
    var i = last.inputs, r = last.result;
    BL.store.set('bl-handoff', {
      bill: i.bill, roof: i.roof, orient: i.orient, goal: i.goal, loads: i.loads,
      summary: r.kWp + ' kWp, ' + r.inverterKW + ' kW inverter, ' + r.batteryKWh + ' kWh battery',
      price: E.rand(r.priceLow) + ' to ' + E.rand(r.priceHigh), goalLabel: GOAL_LABEL[i.goal]
    });
    var qs = new URLSearchParams({ from: 'calculator', bill: i.bill, roof: i.roof, orient: i.orient, goal: i.goal, loads: i.loads.join(',') });
    location.href = 'quote.html?' + qs.toString();
  });

  paint();
})();
