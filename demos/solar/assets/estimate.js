/* Brightline Solar (made-up business): the estimate engine.
 *
 * One pure function, BLEstimate.run(inputs), used by the calculator page and
 * the home-page teaser so both always agree. Every number shown on the site
 * that is not tagged "Sample" comes out of this file.
 *
 * ASSUMPTIONS (also printed on calculator.html, keep the two in step)
 *   TARIFF        R3.40 per kWh, blended, incl. VAT (Gauteng municipal
 *                 residential range is roughly R3 to R4 in 2026; one figure).
 *   FIXED         R300 a month of fixed and network charges a grid-tied home
 *                 keeps paying, so a grid-tied saving can never exceed bill - R300.
 *   SUN           5.2 peak sun hours a day, yearly average for Gauteng on a
 *                 north-facing roof at about 26 degrees tilt.
 *   ORIENT        north 1.00, north-east / north-west 0.95, flat with tilt
 *                 frames 0.93, east / west 0.85.
 *   PR            0.80 performance ratio (heat, wiring, inverter, dust).
 *   PANEL         550 W panels, 2.6 m2 of roof each including spacing.
 *   SELF-USE      share of solar output a home actually uses (no feed-in
 *                 credit assumed): 0.60 no battery, 0.80 with 5 to 10 kWh,
 *                 0.90 with more, 1.00 off-grid.
 *   BATTERY       lithium iron phosphate, 90% usable, sold in 5 kWh modules.
 *   OUTAGE        essentials must run for 4 hours on battery alone (most
 *                 load-shedding slots are 2 or 4 hours).
 *   DEGRADATION   panels lose 0.5% output a year.
 *   ESCALATION    tariff rises 8% a year (an assumption, not a forecast).
 *
 * FORMULAS
 *   monthlyKWh  = bill / TARIFF;  dailyKWh = monthlyKWh / 30.4
 *   target      = coverage[goal] x dailyKWh   (backup 0.30, cut 0.70,
 *                 both 0.80, off-grid 1.25)
 *   kWp         = target / (SUN x ORIENT x PR), rounded UP to whole 550 W
 *                 panels (min 4, max 40)
 *   battery     = backup / both: essentials W x 4 h / 0.9, plus for "both"
 *                 25% of daily use; off-grid: 60% of daily use x 1.5 days / 0.9;
 *                 cut: one 5 kWh module. Rounded UP to 5 kWh, max 60.
 *   inverter    = smallest standard size (3, 5, 8, 10, 12, 16, 20, 25, 30 kW)
 *                 >= max(peak essentials W x 1.25, kWp / 1.3, 5 kW off-grid)
 *   price       = panels x (R2,100..R2,700 supply + R1,150..R1,550 fitting x roof)
 *                 + inverter kW x R3,300..R4,700 + battery kWh x R4,200..R5,900
 *                 + R18,000..R26,000 protection, wiring, CoC and paperwork;
 *                 rounded to the nearest R1,000. Incl. VAT.
 *   saving      = min(kWp x SUN x ORIENT x PR x 30.4 x SELF-USE, monthlyKWh)
 *                 x TARIFF, capped at bill - FIXED (off-grid: at bill);
 *                 range is 88% to 105% of that for weather and habits.
 *   cumulative  = sum over years y of saving x 12 x 1.08^y x 0.995^y
 *   payback     = first year (interpolated) the cumulative saving passes the
 *                 price: fast end = high saving vs low price, slow end = low
 *                 saving vs high price.
 */
(function (root) {
  'use strict';

  var A = {
    tariff: 3.40, fixed: 300, sun: 5.2, pr: 0.80, panelW: 550, panelM2: 2.6,
    usable: 0.9, module: 5, outageH: 4, degradation: 0.005, escalation: 0.08,
    orient: { north: 1.00, ne: 0.95, nw: 0.95, flat: 0.93, ew: 0.85 },
    coverage: { backup: 0.30, cut: 0.70, both: 0.80, offgrid: 1.25 },
    roof: { tile: 1.00, sheet: 0.92, flat: 1.12, ground: 1.25, unsure: 1.05 },
    inverters: [3, 5, 8, 10, 12, 16, 20, 25, 30],
    cost: {
      panel: [2100, 2700], fit: [1150, 1550], invKW: [3300, 4700],
      batKWh: [4200, 5900], bos: [18000, 26000]
    }
  };

  /* Essentials: average draw (W) while the grid is down, and the peak (W) the
   * inverter must start. Averages allow for fridges cycling. */
  var LOADS = {
    lights:  { label: 'Lights and Wi-Fi',        avg: 120, peak: 300 },
    fridge:  { label: 'Fridge and freezer',      avg: 150, peak: 1200 },
    tv:      { label: 'TV and decoder',          avg: 150, peak: 300 },
    office:  { label: 'Laptops and home office', avg: 150, peak: 400 },
    gate:    { label: 'Gate motor and alarm',    avg: 60,  peak: 800 },
    kitchen: { label: 'Kettle and microwave',    avg: 250, peak: 2200 },
    pump:    { label: 'Pool or borehole pump',   avg: 550, peak: 1600 }
  };

  function ceilTo(x, step) { return Math.ceil(x / step - 1e-9) * step; }
  function round1000(x) { return Math.round(x / 1000) * 1000; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

  function run(input) {
    var bill = clamp(+input.bill || 0, 300, 20000);
    var goal = A.coverage[input.goal] ? input.goal : 'both';
    var orientF = A.orient[input.orient] || 1;
    var roofF = A.roof[input.roof] || 1;
    var loads = (input.loads || []).filter(function (k) { return LOADS[k]; });

    var monthlyKWh = bill / A.tariff;
    var dailyKWh = monthlyKWh / 30.4;

    // Panels
    var target = A.coverage[goal] * dailyKWh;
    var kWpNeeded = target / (A.sun * orientF * A.pr);
    var panels = clamp(Math.ceil(kWpNeeded / (A.panelW / 1000) - 1e-9), 4, 40);
    var kWp = panels * A.panelW / 1000;

    // Essentials
    var essAvg = 0, essPeak = 0;
    loads.forEach(function (k) { essAvg += LOADS[k].avg; essPeak += LOADS[k].peak; });
    if (!loads.length) { essAvg = LOADS.lights.avg; essPeak = LOADS.lights.peak; }

    // Battery
    var bat;
    if (goal === 'cut') bat = A.module;
    else if (goal === 'offgrid') bat = dailyKWh * 0.6 * 1.5 / A.usable;
    else {
      bat = essAvg * A.outageH / 1000 / A.usable;
      if (goal === 'both') bat += 0.25 * dailyKWh;
    }
    bat = clamp(ceilTo(Math.max(bat, A.module), A.module), A.module, 60);

    // Inverter
    var invNeed = Math.max(essPeak * 1.25 / 1000, kWp / 1.3, goal === 'offgrid' ? 5 : 3);
    var inv = A.inverters[A.inverters.length - 1];
    for (var i = 0; i < A.inverters.length; i++) {
      if (A.inverters[i] >= invNeed - 1e-9) { inv = A.inverters[i]; break; }
    }

    // Price range, incl. VAT
    var c = A.cost;
    function price(j) {
      return panels * (c.panel[j] + c.fit[j] * roofF) + inv * c.invKW[j] + bat * c.batKWh[j] + c.bos[j];
    }
    var priceLow = round1000(price(0)), priceHigh = round1000(price(1));

    // Monthly saving range
    var selfUse = goal === 'offgrid' ? 1 : (bat > 10 ? 0.9 : 0.8);
    var genKWh = kWp * A.sun * orientF * A.pr * 30.4;
    var usedKWh = Math.min(genKWh * selfUse, monthlyKWh);
    var cap = goal === 'offgrid' ? bill : Math.max(0, bill - A.fixed);
    var saving = Math.min(usedKWh * A.tariff, cap);
    var saveLow = Math.round(saving * 0.88 / 10) * 10;
    var saveHigh = Math.round(Math.min(saving * 1.05, cap) / 10) * 10;

    // Cumulative savings and payback over 20 years
    function cumulative(monthly) {
      var out = [0], sum = 0;
      for (var y = 0; y < 20; y++) {
        sum += monthly * 12 * Math.pow(1 + A.escalation, y) * Math.pow(1 - A.degradation, y);
        out.push(Math.round(sum));
      }
      return out;
    }
    var cumLow = cumulative(saveLow), cumHigh = cumulative(saveHigh);
    function payback(cum, cost) {
      for (var y = 1; y < cum.length; y++) {
        if (cum[y] >= cost) return y - 1 + (cost - cum[y - 1]) / (cum[y] - cum[y - 1]);
      }
      return null; // beyond 20 years
    }
    var pbFast = payback(cumHigh, priceLow), pbSlow = payback(cumLow, priceHigh);

    return {
      input: { bill: bill, goal: goal, orient: input.orient, roof: input.roof, loads: loads },
      monthlyKWh: Math.round(monthlyKWh), dailyKWh: Math.round(dailyKWh * 10) / 10,
      panels: panels, kWp: Math.round(kWp * 100) / 100, roofM2: Math.round(panels * A.panelM2),
      inverterKW: inv, batteryKWh: bat, essentialsW: essAvg, peakW: essPeak,
      backupHours: Math.round(bat * A.usable * 1000 / essAvg * 10) / 10,
      genKWh: Math.round(genKWh), selfUse: selfUse,
      priceLow: priceLow, priceHigh: priceHigh,
      saveLow: saveLow, saveHigh: saveHigh,
      cumLow: cumLow, cumHigh: cumHigh,
      paybackFast: pbFast, paybackSlow: pbSlow
    };
  }

  function rand(n) {
    return 'R' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function years(n) {
    if (n === null) return 'over 20';
    return (Math.round(n * 2) / 2).toString().replace('.0', '');
  }

  root.BLEstimate = { run: run, A: A, LOADS: LOADS, rand: rand, years: years };
})(window);
