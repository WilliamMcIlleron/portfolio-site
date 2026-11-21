/* Home page: the bill slider teaser. Uses the same engine as calculator.html. */
(function () {
  'use strict';
  var box = document.querySelector('[data-teaser]');
  if (!box || !window.BLEstimate) return;
  var E = window.BLEstimate;
  var range = document.getElementById('t-bill');
  var num = document.getElementById('t-bill-n');
  var out = {};
  box.querySelectorAll('[data-t]').forEach(function (el) { out[el.getAttribute('data-t')] = el; });
  var LOADS = ['lights', 'fridge', 'tv', 'office', 'gate'];

  function paint(v) {
    var r = E.run({ bill: v, goal: 'both', orient: 'north', roof: 'tile', loads: LOADS });
    out.system.textContent = r.kWp + ' kWp + ' + r.batteryKWh + ' kWh';
    out.price.textContent = E.rand(r.priceLow) + ' to ' + E.rand(r.priceHigh);
    out.save.textContent = E.rand(r.saveLow) + ' to ' + E.rand(r.saveHigh);
    out.link.setAttribute('href', 'calculator.html?bill=' + v);
    range.style.setProperty('--p', ((v - range.min) / (range.max - range.min) * 100) + '%');
  }
  range.addEventListener('input', function () { num.value = range.value; paint(+range.value); });
  num.addEventListener('change', function () {
    var v = Math.max(500, Math.min(10000, Math.round((+num.value || 2500) / 100) * 100));
    num.value = v; range.value = v; paint(v);
  });
  paint(+range.value);
})();
