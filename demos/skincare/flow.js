/* Soft Light Skin Studio (demo). Booking flow and checkout. Needs site.js first. */
(function () {
  "use strict";
  var S = window.SL; if (!S) return;
  var $ = S.$, $$ = S.$$, fmt = S.fmt, esc = S.esc;
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

  function showStep(root, n, focus) {
    $$(".step", root).forEach(function (s) { s.hidden = +s.dataset.step !== n; });
    $$(".progress li", root).forEach(function (li, i) {
      li.classList.toggle("done", i + 1 < n);
      if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    var prog = $(".progress", root); if (prog) prog.hidden = n > prog.children.length;
    if (focus) {
      var h = $('.step[data-step="' + n + '"] > h2', root);
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      var top = root.getBoundingClientRect().top + window.scrollY - 96;
      if (window.scrollY > top) window.scrollTo({ top: top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  }
  function ics(lines) { return lines.join("\r\n") + "\r\n"; }
  function icsEsc(s) { return String(s).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
  function utcStamp(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function hm(t) { return t; }
  function nowTime() { var d = new Date(); return S.pad(d.getHours()) + ":" + S.pad(d.getMinutes()); }

  /* Enter in a text field moves the step on, as a submit would */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.defaultPrevented || e.isComposing) return;
    var el = e.target; if (!el.matches || !el.matches("input:not([type=radio]):not([type=checkbox])")) return;
    var step = el.closest(".step"); if (!step || el.closest("#code-form") || el.closest("#pay-form")) return;
    var next = step.querySelector("[data-next]"); if (next) { e.preventDefault(); next.click(); }
  });

  /* =================== BOOKING =================== */
  var B = $("#booking");
  if (B) (function () {
    var KEY = "sl-booking";
    var blank = { step: 1, treatment: null, date: null, time: null, consult: { skin: "", concerns: [], allergies: "", pregnant: "", meds: "", retinoid: "" }, details: { name: "", cell: "", email: "", notes: "" }, ref: null };
    var st = S.read(S.SS, KEY, null) || JSON.parse(JSON.stringify(blank));
    var q = new URLSearchParams(location.search).get("treatment");
    if (q && S.tById[q] && !st.ref) { if (st.treatment !== q) { st.treatment = q; st.time = null; } if (st.step > 2) st.step = 2; }
    function save() { S.write(S.SS, KEY, st); }

    /* step 1: treatments */
    var tList = $("#t-list");
    tList.addEventListener("change", function (e) { st.treatment = e.target.value; st.time = null; save(); renderTimes(); summary(); });

    /* step 2: days + times */
    var dayBox = $("#days"), timeBox = $("#times"), slotHead = $("#slot-head");
    var days = S.nextDays(14);
    dayBox.innerHTML = days.map(function (d) {
      var iso = S.isoDate(d), closed = !S.HOURS[d.getDay()];
      return '<label class="day"><input type="radio" name="day" value="' + iso + '"' + (closed ? " disabled" : "") + ' aria-label="' + S.niceDate(iso) + (closed ? ", closed" : "") + '"><span aria-hidden="true"><small>' + (closed ? "Closed" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]) + "</small><b>" + d.getDate() + "</b><small>" + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()] + "</small></span></label>";
    }).join("");
    if (st.date && !$('input[value="' + st.date + '"]:not(:disabled)', dayBox)) { st.date = null; st.time = null; }
    dayBox.addEventListener("change", function (e) { st.date = e.target.value; st.time = null; save(); renderTimes(); summary(); });
    timeBox.addEventListener("change", function (e) { st.time = e.target.value; save(); summary(); });
    function renderTimes() {
      if (!st.date) { slotHead.hidden = true; timeBox.innerHTML = ""; $("#time-fs").hidden = true; return; }
      $("#time-fs").hidden = false; slotHead.hidden = false;
      var t = S.tById[st.treatment] || { mins: 60 }, slots = S.slotsFor(st.date, t.mins), free = slots.filter(function (s) { return !s.taken; }).length;
      $("#slot-date").textContent = S.niceDate(st.date);
      $("#slot-free").textContent = free + " of " + slots.length + " times free";
      if (st.time && !slots.some(function (s) { return s.time === st.time && !s.taken; })) st.time = null;
      timeBox.innerHTML = slots.map(function (s) { return '<label class="time"><input type="radio" name="time" value="' + s.time + '"' + (s.taken ? " disabled" : "") + (st.time === s.time ? " checked" : "") + ' aria-label="' + s.time + (s.taken ? ", taken" : "") + '"><span aria-hidden="true">' + s.time + "</span></label>"; }).join("");
    }

    /* step 3 + 4 forms: restore and bind */
    var cf = $("#consult-form"), df = $("#details-form");
    function restore() {
      var r = $('input[name="treatment"][value="' + st.treatment + '"]', tList); if (r) r.checked = true;
      var d = st.date && $('input[name="day"][value="' + st.date + '"]', dayBox); if (d) d.checked = true;
      var c = st.consult;
      ["skin", "pregnant", "retinoid"].forEach(function (n) { var el = c[n] && $('input[name="' + n + '"][value="' + c[n] + '"]', cf); if (el) el.checked = true; });
      $$('input[name="concerns"]', cf).forEach(function (el) { el.checked = c.concerns.indexOf(el.value) > -1; });
      $("#allergies").value = c.allergies; $("#meds").value = c.meds;
      ["name", "cell", "email", "notes"].forEach(function (k) { $("#d-" + k).value = st.details[k] || ""; });
    }
    function collect() {
      var c = st.consult;
      ["skin", "pregnant", "retinoid"].forEach(function (n) { var el = $('input[name="' + n + '"]:checked', cf); c[n] = el ? el.value : ""; });
      c.concerns = $$('input[name="concerns"]:checked', cf).map(function (el) { return el.value; });
      c.allergies = $("#allergies").value.trim(); c.meds = $("#meds").value.trim();
      ["name", "cell", "email", "notes"].forEach(function (k) { st.details[k] = $("#d-" + k).value.trim(); });
      save(); peelNote();
    }
    [cf, df].forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); $("[data-next]", f.closest(".step")).click(); }); });
    cf.addEventListener("change", collect); cf.addEventListener("input", collect);
    df.addEventListener("input", collect);
    function peelNote() { var n = $("#preg-note"); n.hidden = !((st.treatment === "peel" || st.treatment === "deep-cleanse") && (st.consult.pregnant === "Pregnant" || st.consult.pregnant === "Breastfeeding")); }

    /* summary */
    function summary() {
      var t = S.tById[st.treatment];
      $("#s-treat").textContent = t ? t.name : "Not chosen";
      $("#s-len").textContent = t ? t.mins + " min" : "-";
      $("#s-when").textContent = st.date ? S.niceDate(st.date, true) + (st.time ? ", " + st.time : "") : "Not chosen";
      $("#s-price").textContent = t ? "from " + fmt(t.price * 100) : "-";
    }

    function stepValid(n) {
      if (n === 1) { if (!st.treatment) { err("#t-err", "Choose a treatment to continue.", $('input[name="treatment"]', tList)); return false; } err("#t-err", ""); return true; }
      if (n === 2) {
        if (!st.date) { err("#day-err", "Choose a day.", $('input[name="day"]:not(:disabled)', dayBox)); return false; } err("#day-err", "");
        if (!st.time) { err("#time-err", "Choose a time.", $('input[name="time"]:not(:disabled)', timeBox)); return false; } err("#time-err", ""); return true;
      }
      if (n === 3) return S.validate(cf);
      if (n === 4) return S.validate(df);
      return true;
    }
    function err(sel, msg, focusEl) { var e = $(sel); e.textContent = msg; if (msg) { S.announce(msg); if (focusEl) focusEl.focus(); } }

    function review() {
      var t = S.tById[st.treatment], c = st.consult, d = st.details;
      function row(k, v) { return "<dt>" + k + "</dt><dd>" + esc(v || "None given") + "</dd>"; }
      $("#review").innerHTML =
        sec("Treatment", 1, row("Treatment", t.name) + row("Length", t.mins + " minutes") + row("Price", "from " + fmt(t.price * 100))) +
        sec("Day and time", 2, row("When", S.niceDate(st.date) + ", " + st.time)) +
        sec("Skin form", 3, row("Skin type", c.skin) + row("Concerns", c.concerns.join(", ")) + row("Allergies", c.allergies) + row("Pregnant or breastfeeding", c.pregnant) + row("Retinoids or acne medication", c.retinoid) + row("Other medication", c.meds)) +
        sec("Your details", 4, row("Name", d.name) + row("Cell", d.cell) + row("Email", d.email) + row("Notes", d.notes));
      function sec(title, n, body) { return '<section class="review-sec"><header><h3>' + title + '</h3><button type="button" class="textbtn" data-goto="' + n + '">Edit<span class="sr-only"> ' + title.toLowerCase() + "</span></button></header><dl>" + body + "</dl></section>"; }
    }
    function waText() {
      var t = S.tById[st.treatment], c = st.consult, d = st.details;
      return "New booking " + st.ref + "\n" + t.name + " (" + t.mins + " min, from " + fmt(t.price * 100) + ")\n" + S.niceDate(st.date) + ", " + st.time + "\n\n" +
        "Name: " + d.name + "\nCell: " + d.cell + "\nEmail: " + d.email + "\n\n" +
        "Skin type: " + c.skin + "\nConcerns: " + (c.concerns.join(", ") || "none ticked") + "\nAllergies: " + (c.allergies || "none given") +
        "\nPregnant or breastfeeding: " + c.pregnant + "\nRetinoids or acne medication: " + c.retinoid + "\nOther medication: " + (c.meds || "none given") +
        (d.notes ? "\nNotes: " + d.notes : "");
    }
    function done(focus) {
      var t = S.tById[st.treatment];
      $("#c-ref").textContent = "Reference " + st.ref;
      $("#c-what").textContent = t.name + " on " + S.niceDate(st.date) + " at " + st.time + ".";
      $("#c-wa").textContent = waText();
      $("#c-wa-time").textContent = st.bookedAt || nowTime();
      showStep(B, 6, focus);
      $("#b-summary").hidden = true; B.parentNode.classList.add("flow--done");
    }

    B.addEventListener("click", function (e) {
      var go = e.target.closest("[data-goto]"); if (go) { st.step = +go.dataset.goto; save(); showStep(B, st.step, true); return; }
      if (e.target.closest("[data-next]")) {
        collect();
        if (!stepValid(st.step)) return;
        st.step++; save(); if (st.step === 5) review(); if (st.step === 2) renderTimes(); showStep(B, st.step, true); return;
      }
      if (e.target.closest("[data-back]")) { st.step = Math.max(1, st.step - 1); save(); showStep(B, st.step, true); return; }
      var conf = e.target.closest("#confirm");
      if (conf) {
        if (conf.disabled || st.ref) return;
        if (!stepValid(1) || !stepValid(2)) { st.step = 1; showStep(B, 1, true); return; }
        conf.disabled = true; conf.innerHTML = '<span class="spin" aria-hidden="true"></span> Booking';
        setTimeout(function () {
          st.ref = "SL-" + (Date.now() % 1e6).toString(36).toUpperCase().padStart(4, "0") + Math.floor(Math.random() * 36 * 36).toString(36).toUpperCase().padStart(2, "0");
          st.bookedAt = nowTime(); st.step = 6; save(); done(true);
        }, 700);
        return;
      }
      if (e.target.closest("#ics")) {
        var t = S.tById[st.treatment], p = st.date.split("-"), hmv = st.time.split(":");
        var start = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], +hmv[0] - 2, +hmv[1])); /* SAST = UTC+2, no DST */
        var end = new Date(start.getTime() + t.mins * 60000);
        download("soft-light-" + st.ref + ".ics", ics([
          "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soft Light Skin Studio (demo)//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
          "BEGIN:VEVENT", "UID:" + st.ref + "@softlight.demo", "DTSTAMP:" + utcStamp(new Date()), "DTSTART:" + utcStamp(start), "DTEND:" + utcStamp(end),
          "SUMMARY:" + icsEsc(t.name + " at Soft Light Skin Studio (demo)"),
          "LOCATION:" + icsEsc("Unit 4, 12 Sample Lane, Linden, Johannesburg (made-up address)"),
          "DESCRIPTION:" + icsEsc("Reference " + st.ref + ". Arrive 10 minutes early. Come with a clean face if you can. This is a demo booking for a made-up business."),
          "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(t.name + " in two hours"), "END:VALARM",
          "END:VEVENT", "END:VCALENDAR"]), "text/calendar;charset=utf-8");
        S.announce("Calendar file downloaded.");
        return;
      }
      if (e.target.closest("#again")) { S.write(S.SS, KEY, null); location.href = "book.html"; }
    });

    restore(); renderTimes(); summary(); peelNote();
    if (st.ref) done(false); else showStep(B, st.step, false);
  })();

  /* =================== CHECKOUT =================== */
  var C = $("#checkout");
  if (C) (function () {
    var KEY = "sl-checkout", CODES = { WELCOME10: 0.10 };
    var st = S.read(S.SS, KEY, null) || { step: 1, code: "", delivery: "collect", contact: {}, address: {}, pay: "card", bank: "" };
    var order = S.read(S.SS, "sl-last-order", null);
    function save() { S.write(S.SS, KEY, st); }

    function totals() {
      var sub = S.Bag.subtotal(), rate = CODES[st.code] || 0, disc = Math.round(sub * rate);
      var del = st.delivery === "courier" ? (sub >= S.Bag.FREE_AT ? 0 : S.Bag.COURIER) : 0;
      return { sub: sub, disc: disc, del: del, total: sub - disc + del };
    }
    function delLabel(t) { return st.delivery === "courier" ? (t.del ? "Courier, " + fmt(t.del) : "Courier, free") : "Collect in studio, free"; }

    /* summary sidebar */
    function renderSummary() {
      var t = totals(), items = S.Bag.items();
      $("#sum-items").innerHTML = items.map(function (i) { var p = S.byId[i.id]; return '<div class="mini-item"><img src="img/' + p.img + '-480.webp" alt="" width="52" height="64"><div>' + esc(p.name) + '<div class="q">' + p.sizes[i.size][0] + " &times; " + i.qty + "</div></div><b>" + fmt(S.Bag.unit(i) * i.qty) + "</b></div>"; }).join("") || '<p class="form-note">No items yet.</p>';
      $("#sum-sub").textContent = fmt(t.sub);
      $("#sum-disc-row").hidden = !t.disc; $("#sum-disc").textContent = fmt(-t.disc); $("#sum-code").textContent = st.code;
      $("#sum-del").textContent = st.step >= 2 ? (t.del ? fmt(t.del) : "Free") : (t.sub >= S.Bag.FREE_AT ? "Free" : "From free");
      $("#sum-total").textContent = fmt(t.total);
      $("#sum-toggle-total").textContent = fmt(t.total);
      $$("[data-pay-total]").forEach(function (el) { el.textContent = fmt(t.total); });
      var cb = $("#code-applied"); cb.hidden = !st.code; if (st.code) cb.innerHTML = "<b>" + st.code + "</b> applied: 10% off. " + '<button type="button" class="textbtn" id="code-remove">Remove<span class="sr-only"> discount code</span></button>';
      $("#code-form").hidden = !!st.code;
      $("#courier-price").textContent = t.sub >= S.Bag.FREE_AT ? "Free" : fmt(S.Bag.COURIER);
    }

    /* step 1: bag */
    var bagList = $("#co-bag");
    function renderBag() {
      var items = S.Bag.items();
      if (!items.length) {
        bagList.innerHTML = '<div class="empty"><h3>Your bag is empty</h3><p>Add something from the shop and it will appear here.</p><a class="btn btn--accent" href="shop.html">Browse the shop</a></div>';
        $("#to-delivery").disabled = true; $("#co-ship").innerHTML = "";
      } else {
        bagList.innerHTML = "<ul>" + items.map(function (i) { return S.lineHTML(i); }).join("") + "</ul>";
        $("#to-delivery").disabled = false; $("#co-ship").innerHTML = S.shipHTML(S.Bag.subtotal());
      }
    }
    bagList.addEventListener("click", function (e) {
      S.lineAction(e, function (li, id, size, dir, gone) {
        renderBag(); renderSummary();
        var t = gone ? $("#co-bag-h") : $('.line-item[data-id="' + id + '"][data-size="' + size + '"] [data-q="' + dir + '"]', bagList);
        if (t && !t.disabled) t.focus(); else { var alt = $('.line-item[data-id="' + id + '"][data-size="' + size + '"] [data-q]', bagList); (alt || $("#co-bag-h")).focus(); }
      });
    });
    S.Bag.onChange(function () { if (paying) return; if (st.step < 4 || !order) { if (!S.Bag.count() && st.step > 1 && st.step < 4) { st.step = 1; save(); show(true); } renderBag(); renderSummary(); } });

    /* discount */
    $("#code-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = $("#code"), v = inp.value.trim().toUpperCase().replace(/\s+/g, "");
      if (!v) { inp.setAttribute("aria-invalid", "true"); $("#code-err").textContent = "Enter a code first."; inp.focus(); return; }
      if (!CODES[v]) { inp.setAttribute("aria-invalid", "true"); $("#code-err").textContent = "That code is not valid. Try WELCOME10."; S.announce("That code is not valid."); inp.focus(); return; }
      inp.removeAttribute("aria-invalid"); $("#code-err").textContent = ""; inp.value = "";
      st.code = v; save(); renderSummary(); S.announce("Code " + v + " applied. New total " + fmt(totals().total) + ".");
      var r = $("#code-remove"); if (r) r.focus();
    });
    C.parentNode.addEventListener("click", function (e) {
      if (e.target.closest("#code-remove")) { st.code = ""; save(); renderSummary(); S.announce("Discount code removed. Total " + fmt(totals().total) + "."); $("#code").focus(); }
      var tg = e.target.closest(".sum-toggle"); if (tg) { var sm = tg.closest(".summary"); var closed = sm.classList.toggle("closed"); tg.setAttribute("aria-expanded", !closed); }
    });

    /* step 2: delivery */
    var dForm = $("#delivery-form");
    function restoreDelivery() {
      var r = $('input[name="delivery"][value="' + st.delivery + '"]', dForm); if (r) r.checked = true;
      ["name", "email", "cell"].forEach(function (k) { $("#c-" + k).value = st.contact[k] || ""; });
      ["street", "suburb", "city", "province", "postal"].forEach(function (k) { $("#a-" + k).value = st.address[k] || ""; });
      toggleAddress();
    }
    function toggleAddress() { $("#address").hidden = st.delivery !== "courier"; $("#collect-note").hidden = st.delivery !== "collect"; }
    dForm.addEventListener("change", function (e) { if (e.target.name === "delivery") { st.delivery = e.target.value; save(); toggleAddress(); renderSummary(); S.announce("Delivery: " + delLabel(totals()) + ". Total " + fmt(totals().total) + "."); } });
    dForm.addEventListener("input", function () {
      ["name", "email", "cell"].forEach(function (k) { st.contact[k] = $("#c-" + k).value.trim(); });
      ["street", "suburb", "city", "province", "postal"].forEach(function (k) { st.address[k] = $("#a-" + k).value.trim(); });
      save();
    });
    dForm.addEventListener("submit", function (e) { e.preventDefault(); $("[data-next]", dForm.closest(".step")).click(); });
    dForm.addEventListener("change", function () { st.address.province = $("#a-province").value; save(); });

    /* step 3: payment */
    var pForm = $("#pay-form"), num = $("#card-num"), exp = $("#card-exp"), cvc = $("#card-cvc");
    function luhn(d) { var s = 0, alt = false; for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
    window.slCardCheck = function (el) { var d = el.value.replace(/\D/g, ""); if (d.length < 13 || d.length > 19) return "Card numbers are 13 to 19 digits."; if (!luhn(d)) return "That card number does not look right. For this demo use 4242 4242 4242 4242."; return ""; };
    window.slExpCheck = function (el) { var m = el.value.match(/^(\d{2})\s*\/\s*(\d{2})$/); if (!m) return "Use MM/YY."; var mm = +m[1], yy = 2000 + +m[2]; if (mm < 1 || mm > 12) return "Month must be 01 to 12."; var now = new Date(); if (yy < now.getFullYear() || (yy === now.getFullYear() && mm < now.getMonth() + 1)) return "This card has expired."; return ""; };
    window.slCvcCheck = function (el) { return /^\d{3,4}$/.test(el.value) ? "" : "3 or 4 digits on the back of the card."; };
    num.addEventListener("input", function () {
      var pos = num.selectionStart, before = num.value.slice(0, pos).replace(/\D/g, "").length;
      var d = num.value.replace(/\D/g, "").slice(0, 19), f = d.replace(/(\d{4})(?=\d)/g, "$1 ");
      num.value = f;
      var p = 0, c = 0; while (p < f.length && c < before) { if (/\d/.test(f[p])) c++; p++; } try { num.setSelectionRange(p, p); } catch (e) {}
      $("#card-brand").textContent = /^4/.test(d) ? "Visa" : /^(5[1-5]|2[2-7])/.test(d) ? "Mastercard" : /^3[47]/.test(d) ? "Amex" : "";
    });
    exp.addEventListener("input", function (e) {
      var d = exp.value.replace(/\D/g, "").slice(0, 4);
      if (e.inputType === "deleteContentBackward" && d.length <= 2) { exp.value = d; return; }
      exp.value = d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : (d.length === 2 ? d + "/" : d);
    });
    cvc.addEventListener("input", function () { cvc.value = cvc.value.replace(/\D/g, "").slice(0, 4); });
    function togglePay() { $("#card-box").hidden = st.pay !== "card"; $("#eft-box").hidden = st.pay !== "eft"; $("#pay-btn-label").textContent = st.pay === "card" ? "Pay " : "Continue to bank, "; }
    pForm.addEventListener("change", function (e) { if (e.target.name === "pay") { st.pay = e.target.value; save(); togglePay(); } });

    var paying = false;
    pForm.addEventListener("submit", function (e) {
      e.preventDefault(); if (paying) return;
      if (!S.Bag.count()) { st.step = 1; save(); show(true); return; }
      if (st.pay === "card") { if (!S.validate($("#card-box"))) return; place("Card ending " + num.value.replace(/\D/g, "").slice(-4) + " (demo, not charged)", $("#pay-btn")); }
      else { $("#pay-main").hidden = true; $("#bank-screen").hidden = false; var h = $("#bank-h"); h.setAttribute("tabindex", "-1"); h.focus(); }
    });
    $("#bank-back").addEventListener("click", function () { $("#bank-screen").hidden = true; $("#pay-main").hidden = false; $('input[name="pay"][value="eft"]').focus(); });
    $("#bank-go").addEventListener("click", function () {
      var b = $('input[name="bank"]:checked'); var er = $("#bank-err");
      if (!b) { er.textContent = "Choose your bank to continue."; S.announce(er.textContent); $('input[name="bank"]').focus(); return; }
      er.textContent = ""; place("Instant EFT via " + b.value + " (demo, no bank contacted)", $("#bank-go"));
    });

    function place(method, btn) {
      if (paying) return; paying = true;
      $$("#pay-btn,#bank-go").forEach(function (x) { x.disabled = true; });
      btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Processing';
      S.announce("Processing payment.");
      setTimeout(function () {
        var t = totals();
        order = {
          no: "SL-" + String(10000 + (Date.now() % 90000)), at: nowTime(),
          items: S.Bag.items().map(function (i) { var p = S.byId[i.id]; return { name: p.name, size: p.sizes[i.size][0], qty: i.qty, line: S.Bag.unit(i) * i.qty }; }),
          totals: t, code: st.code, delivery: st.delivery, delLabel: delLabel(t), contact: st.contact, address: st.address, method: method
        };
        S.write(S.SS, "sl-last-order", order);
        S.Bag.clear();
        st = { step: 4, code: "", delivery: st.delivery, contact: st.contact, address: {}, pay: "card", bank: "" }; save();
        num.value = ""; exp.value = ""; cvc.value = ""; $("#card-name").value = "";
        renderDone(); show(true); paying = false;
      }, 1100);
    }
    function renderDone() {
      if (!order) return;
      var t = order.totals, a = order.address || {}, c = order.contact || {};
      $("#o-no").textContent = "Order " + order.no;
      $("#o-email").textContent = c.email || "your email";
      $("#o-items").innerHTML = order.items.map(function (i) { return "<div><dt>" + i.qty + " &times; " + esc(i.name) + " (" + i.size + ")</dt><dd>" + fmt(i.line) + "</dd></div>"; }).join("") +
        "<div><dt>Subtotal</dt><dd>" + fmt(t.sub) + "</dd></div>" + (t.disc ? "<div><dt>Discount (" + order.code + ")</dt><dd>" + fmt(-t.disc) + "</dd></div>" : "") +
        "<div><dt>Delivery</dt><dd>" + esc(order.delLabel) + "</dd></div>";
      $("#o-total").textContent = fmt(t.total);
      var where = order.delivery === "courier" ? "Courier to: " + [a.street, a.suburb, a.city, a.province, a.postal].filter(Boolean).join(", ") : "Collect in studio";
      $("#o-wa").textContent = "New web order " + order.no + "\n" + order.items.map(function (i) { return i.qty + " x " + i.name + " " + i.size + ", " + fmt(i.line); }).join("\n") +
        "\n\nSubtotal " + fmt(t.sub) + (t.disc ? "\nDiscount " + order.code + " " + fmt(-t.disc) : "") + "\nDelivery: " + order.delLabel + "\nTotal " + fmt(t.total) +
        "\n\nPaid: " + order.method + "\n" + where + "\nCustomer: " + (c.name || "") + ", " + (c.cell || "") + ", " + (c.email || "");
      $("#o-wa-time").textContent = order.at;
      $("#o-next").textContent = order.delivery === "courier" ? "We pack orders within one working day and send the tracking link by WhatsApp." : "We will WhatsApp you when it is packed. Collect from reception, Monday to Saturday.";
    }

    function show(focus) {
      if (st.step === 4 && !order) st.step = 1;
      if (st.step > 1 && st.step < 4 && !S.Bag.count()) st.step = 1;
      $("#co-summary").hidden = st.step === 4;
      C.parentNode.classList.toggle("flow--done", st.step === 4);
      showStep(C, st.step, focus);
      renderSummary();
    }
    C.addEventListener("click", function (e) {
      var next = e.target.closest("[data-next]"), back = e.target.closest("[data-back]");
      if (next) {
        if (st.step === 1 && !S.Bag.count()) return;
        if (st.step === 2 && !S.validate(dForm)) return;
        st.step++; save(); show(true);
      } else if (back) { st.step = Math.max(1, st.step - 1); save(); show(true); }
      else if (e.target.closest("#new-order")) { S.write(S.SS, "sl-last-order", null); order = null; st = { step: 1, code: "", delivery: "collect", contact: st.contact || {}, address: {}, pay: "card" }; save(); location.href = "shop.html"; }
    });

    var pr = $('input[name="pay"][value="' + st.pay + '"]'); if (pr) pr.checked = true;
    restoreDelivery(); togglePay(); renderBag(); renderDone(); show(false);
  })();
})();
