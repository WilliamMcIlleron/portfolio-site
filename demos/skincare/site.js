/* Soft Light Skin Studio (demo). Shared: catalogue, bag, drawer, nav, shop, product, small forms. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- storage (every access guarded) ---------- */
  function getStore(kind) { try { var s = window[kind]; var k = "__sl"; s.setItem(k, "1"); s.removeItem(k); return s; } catch (e) { return null; } }
  var LS = getStore("localStorage"), SS = getStore("sessionStorage");
  function read(store, key, fallback) { if (!store) return fallback; try { var v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function write(store, key, val) { if (!store) return; try { if (val === null) store.removeItem(key); else store.setItem(key, JSON.stringify(val)); } catch (e) {} }

  /* ---------- money: work in cents ---------- */
  function fmt(cents) {
    var neg = cents < 0; cents = Math.abs(Math.round(cents));
    var r = Math.floor(cents / 100), c = cents % 100;
    var s = String(r).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return (neg ? "-" : "") + "R" + s + (c ? "." + (c < 10 ? "0" : "") + c : "");
  }

  /* ---------- catalogue ---------- */
  var PRODUCTS = [
    { id: "oat-cleanser", name: "Oat Milk Cleanser", type: "Cleanser", img: "cleanser", alt: "A white foaming pump bottle on a woven mat with sprigs of eucalyptus", concerns: ["Dry", "Sensitive"], sizes: [["150 ml", 265], ["300 ml", 420]], short: "A soft gel that turns milky with water. Takes off sunscreen and make-up without the tight feeling.", ingredients: ["Colloidal oat", "Glycerin", "Coco-glucoside (a mild cleanser)", "Panthenol", "Fragrance free"], how: "Massage into damp skin for a minute, morning and evening. Rinse with lukewarm water.", gallery: ["cleanser", "texture-cream", "hands"], pairs: ["soft-toner", "barrier-cream", "mineral-spf"], featured: 1 },
    { id: "soft-toner", name: "Soft Rose Toner", type: "Toner", img: "toner", alt: "A square glass bottle with a blank label lying on a handwritten note", concerns: ["Dry", "Dull", "Sensitive"], sizes: [["200 ml", 230]], short: "A watery toner with no alcohol. Press it in after cleansing, before serum.", ingredients: ["Rose water", "Glycerin", "Sodium PCA", "Allantoin"], how: "Shake a few drops into your palms and press over the face. Use morning and evening.", gallery: ["toner", "texture-gel"], pairs: ["oat-cleanser", "vitamin-c-serum", "barrier-cream"], featured: 0 },
    { id: "vitamin-c-serum", name: "Vitamin C Serum", type: "Serum", img: "serum", alt: "A small glass dropper bottle of amber serum against a dusky pink wall with dried grass", concerns: ["Dull"], sizes: [["30 ml", 495], ["50 ml", 720]], short: "A light morning serum with 10% vitamin C. Follow it with SPF every day.", ingredients: ["Ascorbyl glucoside 10%", "Ferulic acid", "Vitamin E", "Hyaluronic acid"], how: "Three to four drops in the morning after toner. Always follow with sunscreen. Patch test first if your skin is reactive.", gallery: ["serum", "texture-gel", "hands"], pairs: ["mineral-spf", "soft-toner", "eye-balm"], featured: 1 },
    { id: "barrier-cream", name: "Barrier Cream", type: "Moisturiser", img: "moisturiser", alt: "A frosted glass jar with a white lid beside a plain card box on stone", concerns: ["Dry", "Sensitive"], sizes: [["50 ml", 385], ["100 ml", 620]], short: "A rich, plain moisturiser for dry or easily upset skin. No fragrance, no essential oils.", ingredients: ["Ceramides", "Shea butter", "Squalane", "Niacinamide 4%"], how: "Warm a pea-sized amount between your fingers and press into the skin, morning and evening.", gallery: ["moisturiser", "texture-cream", "hands"], pairs: ["oat-cleanser", "mineral-spf", "eye-balm"], featured: 1 },
    { id: "mineral-spf", name: "Mineral SPF 50", type: "Sunscreen", img: "spf", alt: "A swipe of white cream on a warm beige surface", concerns: ["Oily", "Sensitive"], sizes: [["50 ml", 345]], short: "A zinc-based daily sunscreen that sits flat under make-up. Reapply every two hours outdoors.", ingredients: ["Zinc oxide", "Squalane", "Vitamin E", "Fragrance free"], how: "Two finger lengths for face and neck as the last step every morning. Reapply when outdoors.", gallery: ["spf", "texture-cream"], pairs: ["vitamin-c-serum", "barrier-cream", "oat-cleanser"], featured: 1 },
    { id: "green-clay-mask", name: "Green Clay Mask", type: "Mask", img: "clay", alt: "A small dish of green clay mask with a wooden spatula and green leaves", concerns: ["Oily"], sizes: [["75 ml", 310]], short: "A once-a-week clay mask for oily or congested areas. Rinse before it fully dries.", ingredients: ["Green clay", "Kaolin", "Aloe leaf juice", "Zinc PCA"], how: "Apply a thin layer to clean skin once a week. Leave for 8 to 10 minutes, then rinse with warm water.", gallery: ["clay", "texture-cream"], pairs: ["oat-cleanser", "soft-toner", "mineral-spf"], featured: 0 },
    { id: "eye-balm", name: "Eye Balm", type: "Eye cream", img: "eye", alt: "An open amber jar of rich cream seen from above on grey stone", concerns: ["Dry"], sizes: [["15 ml", 360]], short: "A thick, unscented balm for the skin around the eyes. A little goes a long way.", ingredients: ["Shea butter", "Caffeine", "Peptides", "Squalane"], how: "Tap a rice-grain amount along the orbital bone with your ring finger at night.", gallery: ["eye", "texture-cream"], pairs: ["barrier-cream", "vitamin-c-serum", "body-oil"], featured: 0 },
    { id: "body-oil", name: "Body Oil", type: "Body oil", img: "oil", alt: "An amber dropper bottle on a turned wooden stand with a palm leaf shadow behind", concerns: ["Dry", "Dull"], sizes: [["100 ml", 395], ["200 ml", 650]], short: "A dry-touch oil for after the shower. Lightly scented with neroli.", ingredients: ["Marula oil", "Jojoba oil", "Vitamin E", "Neroli"], how: "Smooth over damp skin after a shower or bath. Avoid the face.", gallery: ["oil", "texture-gel", "hands"], pairs: ["barrier-cream", "eye-balm", "oat-cleanser"], featured: 0 }
  ];
  var byId = {}; PRODUCTS.forEach(function (p) { byId[p.id] = p; });

  var TREATMENTS = [
    { id: "consultation", name: "Skin consultation", mins: 30, price: 250 },
    { id: "signature", name: "Signature facial", mins: 60, price: 650 },
    { id: "hydrating", name: "Hydrating facial", mins: 60, price: 720 },
    { id: "massage", name: "Facial massage", mins: 45, price: 520 },
    { id: "deep-cleanse", name: "Deep cleanse", mins: 75, price: 780 },
    { id: "peel", name: "Gentle peel", mins: 45, price: 550 },
    { id: "hands", name: "Hand treatment", mins: 20, price: 220 },
    { id: "brows", name: "Brow tidy and tint", mins: 30, price: 280 }
  ];
  var tById = {}; TREATMENTS.forEach(function (t) { tById[t.id] = t; });

  /* ---------- opening hours and slots (deterministic) ---------- */
  var HOURS = { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 19], 5: [9, 18], 6: [8.5, 14] };
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseIso(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function nextDays(n) { var out = [], d = new Date(); d.setHours(0, 0, 0, 0); for (var i = 1; i <= n; i++) { var x = new Date(d); x.setDate(d.getDate() + i); out.push(x); } return out; }
  function slotsFor(iso, mins) {
    var d = parseIso(iso), h = HOURS[d.getDay()]; if (!h) return [];
    var out = []; for (var t = h[0] * 60; t + mins <= h[1] * 60; t += 30) {
      var label = pad(Math.floor(t / 60)) + ":" + pad(t % 60);
      out.push({ time: label, taken: hash(iso + "|" + label) % 10 < 4 });
    }
    return out;
  }
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function niceDate(iso, short) { var d = parseIso(iso); return short ? DAYS[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) : DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }

  /* ---------- bag ---------- */
  var BAG_KEY = "sl-bag", MAX_QTY = 10, FREE_AT = 80000, COURIER = 6500;
  function clean(items) {
    if (!Array.isArray(items)) return [];
    return items.filter(function (i) { return i && byId[i.id] && byId[i.id].sizes[i.size] && i.qty > 0; })
      .map(function (i) { return { id: i.id, size: i.size | 0, qty: Math.min(MAX_QTY, Math.max(1, i.qty | 0)) }; });
  }
  var bag = clean(read(LS, BAG_KEY, []));
  var listeners = [];
  function saveBag() { write(LS, BAG_KEY, bag); listeners.forEach(function (fn) { fn(bag); }); }
  function unitCents(i) { return byId[i.id].sizes[i.size][1] * 100; }
  var Bag = {
    items: function () { return bag.slice(); },
    count: function () { return bag.reduce(function (n, i) { return n + i.qty; }, 0); },
    subtotal: function () { return bag.reduce(function (n, i) { return n + unitCents(i) * i.qty; }, 0); },
    add: function (id, size, qty) {
      var line = bag.filter(function (i) { return i.id === id && i.size === size; })[0];
      var capped = false;
      if (line) { var want = line.qty + qty; capped = want > MAX_QTY; line.qty = Math.min(MAX_QTY, want); }
      else { bag.push({ id: id, size: size, qty: Math.min(MAX_QTY, qty) }); capped = qty > MAX_QTY; }
      saveBag(); return capped;
    },
    setQty: function (id, size, qty) {
      bag = bag.map(function (i) { if (i.id === id && i.size === size) i.qty = Math.min(MAX_QTY, Math.max(0, qty)); return i; }).filter(function (i) { return i.qty > 0; });
      saveBag();
    },
    remove: function (id, size) { bag = bag.filter(function (i) { return !(i.id === id && i.size === size); }); saveBag(); },
    clear: function () { bag = []; saveBag(); },
    onChange: function (fn) { listeners.push(fn); },
    unit: unitCents, MAX: MAX_QTY, FREE_AT: FREE_AT, COURIER: COURIER
  };
  window.addEventListener("storage", function (e) { if (e.key === BAG_KEY) { bag = clean(read(LS, BAG_KEY, [])); listeners.forEach(function (fn) { fn(bag); }); } });

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function srcset(name, widths) { return (widths || [480, 960]).map(function (w) { return "img/" + name + "-" + w + ".webp " + w + "w"; }).join(", "); }
  var live = $("#live");
  function announce(msg) { if (!live) return; live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 60); }
  var ICON = {
    minus: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10h12" stroke="currentColor" stroke-width="1.6"/></svg>',
    plus: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10h12M10 4v12" stroke="currentColor" stroke-width="1.6"/></svg>'
  };

  /* ---------- header: counts + mobile menu ---------- */
  function renderCounts(bump) {
    var n = Bag.count();
    $$("[data-bag-count]").forEach(function (el) {
      el.textContent = n; el.hidden = n === 0;
      if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
    $$("[data-bag-btn]").forEach(function (b) { b.setAttribute("aria-label", "Bag, " + n + (n === 1 ? " item" : " items")); });
  }
  var menuBtn = $(".menu-btn"), mnav = $("#mnav");
  function setMenu(open) {
    if (!menuBtn || !mnav) return;
    menuBtn.setAttribute("aria-expanded", open); mnav.classList.toggle("open", open);
    mnav.inert = !open; document.body.style.overflow = open ? "hidden" : "";
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menuBtn.innerHTML = open ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16M4 16h16" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
  }
  if (menuBtn && mnav) {
    mnav.inert = true;
    menuBtn.addEventListener("click", function () { setMenu(menuBtn.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && mnav.classList.contains("open")) { setMenu(false); menuBtn.focus(); } });
    window.addEventListener("resize", function () { if (window.innerWidth > 900 && mnav.classList.contains("open")) setMenu(false); });
  }

  /* ---------- bag drawer ---------- */
  var drawer = $("#bag"), scrim = $(".scrim"), lastFocus = null;
  function focusables(root) { return $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', root).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; }); }
  function openDrawer(trigger) {
    if (!drawer) return;
    lastFocus = trigger || document.activeElement;
    renderDrawer();
    drawer.hidden = false; scrim.hidden = false;
    void drawer.offsetWidth;
    drawer.classList.add("open"); scrim.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    var h = $("#bag-title"); if (h) h.focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains("open")) return;
    drawer.classList.remove("open"); scrim.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(function () { if (!drawer.classList.contains("open")) { drawer.hidden = true; scrim.hidden = true; } }, 460);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function lineHTML(i, compact) {
    var p = byId[i.id], size = p.sizes[i.size];
    return '<li class="line-item" data-id="' + p.id + '" data-size="' + i.size + '">' +
      '<img src="img/' + p.img + '-480.webp" alt="" width="72" height="90" loading="lazy">' +
      '<div><h3><a href="product.html?id=' + p.id + '">' + esc(p.name) + '</a></h3><p class="meta">' + size[0] + " &middot; " + fmt(size[1] * 100) + ' each</p>' +
      '<div class="qty qty--sm" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
      '<button type="button" data-q="-1" aria-label="One less ' + esc(p.name) + '">' + ICON.minus + '</button>' +
      '<span aria-live="polite">' + i.qty + '</span>' +
      '<button type="button" data-q="1" aria-label="One more ' + esc(p.name) + '"' + (i.qty >= MAX_QTY ? " disabled" : "") + '>' + ICON.plus + '</button></div>' +
      (i.qty >= MAX_QTY ? '<p class="form-note">Limit of ' + MAX_QTY + ' per item.</p>' : "") + '</div>' +
      '<div><p class="lp">' + fmt(unitCents(i) * i.qty) + '</p><button type="button" class="textbtn rm" data-rm>Remove</button></div></li>';
  }
  function shipHTML(sub) {
    var left = FREE_AT - sub, pct = Math.min(100, Math.round(sub / FREE_AT * 100));
    return '<div class="ship"><p>' + (left > 0 ? "You are <b>" + fmt(left) + "</b> away from free courier delivery." : "<b>Free courier delivery</b> unlocked.") + '</p><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>';
  }
  function renderDrawer() {
    if (!drawer) return;
    var body = $(".drawer-body", drawer), foot = $(".drawer-foot", drawer), items = Bag.items();
    if (!items.length) {
      body.innerHTML = '<div class="empty"><h3>Your bag is empty</h3><p>Everything on the shelf is made for daily use and priced in rand.</p><a class="btn btn--accent" href="shop.html">Browse the shop</a></div>';
      foot.hidden = true; return;
    }
    foot.hidden = false;
    body.innerHTML = '<ul>' + items.map(function (i) { return lineHTML(i); }).join("") + '</ul>';
    var sub = Bag.subtotal();
    foot.innerHTML = shipHTML(sub) + '<div class="sub-row"><span>Subtotal</span><b>' + fmt(sub) + '</b></div><p class="form-note">Delivery and discount codes at checkout.</p><a class="btn btn--accent btn--block" href="checkout.html">Checkout</a><button type="button" class="btn btn--ghost btn--block" data-close>Keep shopping</button>';
  }
  function lineAction(e, after) {
    var li = e.target.closest(".line-item"); if (!li) return false;
    var id = li.dataset.id, size = +li.dataset.size, p = byId[id];
    var q = e.target.closest("[data-q]"), rm = e.target.closest("[data-rm]");
    var line = Bag.items().filter(function (i) { return i.id === id && i.size === size; })[0]; if (!line) return false;
    if (q) {
      var n = line.qty + (+q.dataset.q);
      Bag.setQty(id, size, n);
      announce(n > 0 ? p.name + ", quantity " + Math.min(n, MAX_QTY) + ". Subtotal " + fmt(Bag.subtotal()) + "." : p.name + " removed from your bag.");
      after(li, id, size, q.dataset.q, n <= 0); return true;
    }
    if (rm) { Bag.remove(id, size); announce(p.name + " removed from your bag. Subtotal " + fmt(Bag.subtotal()) + "."); after(li, id, size, null, true); return true; }
    return false;
  }
  if (drawer) {
    drawer.hidden = true; scrim.hidden = true;
    scrim.addEventListener("click", closeDrawer);
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) { closeDrawer(); return; }
      lineAction(e, function (li, id, size, dir, gone) {
        renderDrawer();
        var target = gone ? $("#bag-title") : $('.line-item[data-id="' + id + '"][data-size="' + size + '"] [data-q="' + dir + '"]', drawer);
        if (target && !target.disabled) target.focus(); else { var alt = $('.line-item[data-id="' + id + '"][data-size="' + size + '"] [data-q]', drawer); (alt || $("#bag-title")).focus(); }
      });
    });
    drawer.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
      if (e.key !== "Tab") return;
      var f = focusables(drawer); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === $("#bag-title"))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }
  $$("[data-bag-btn]").forEach(function (b) { b.addEventListener("click", function () { openDrawer(b); }); });

  /* add to bag buttons anywhere: data-add="id" (size from data-size or product form) */
  function addFrom(btn) {
    if (btn.dataset.busy) return; btn.dataset.busy = "1";
    var id = btn.dataset.add, p = byId[id]; if (!p) return;
    var size = +(btn.dataset.size || 0), qty = +(btn.dataset.qty || 1);
    var capped = Bag.add(id, size, qty);
    renderCounts(true);
    announce("Added " + p.name + ", " + p.sizes[size][0] + ". Your bag has " + Bag.count() + " items." + (capped ? " Limit of " + MAX_QTY + " per item reached." : ""));
    var old = btn.innerHTML; btn.innerHTML = "Added"; btn.classList.add("is-added");
    setTimeout(function () { btn.innerHTML = old; btn.classList.remove("is-added"); delete btn.dataset.busy; }, 900);
    openDrawer(btn);
  }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-add]"); if (b) { e.preventDefault(); addFrom(b); } });

  Bag.onChange(function () { renderCounts(false); if (drawer && drawer.classList.contains("open")) renderDrawer(); });
  renderCounts(false);

  /* ---------- form validation (shared with flow.js) ---------- */
  var RULES = {
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); },
    cell: function (v) { return /^(\+27|0)[6-8]\d{8}$/.test(v.replace(/[\s()-]/g, "")); },
    postal: function (v) { return /^\d{4}$/.test(v); },
    name: function (v) { return v.length >= 2; }
  };
  function errEl(el) { var id = el.id + "-err", e = document.getElementById(id); if (!e) { e = document.createElement("p"); e.className = "err"; e.id = id; (el.closest(".field") || el.parentNode).appendChild(e); } var d = el.getAttribute("aria-describedby") || ""; if (d.indexOf(id) < 0) el.setAttribute("aria-describedby", (d + " " + id).trim()); return e; }
  function setErr(el, msg) { var e = errEl(el); e.textContent = msg || ""; if (msg) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid"); }
  function checkField(el) {
    var v = (el.value || "").trim(), msg = "";
    if (el.type === "checkbox") { if (el.required && !el.checked) msg = el.dataset.msg || "Please tick this box to continue."; }
    else if (el.required && !v) msg = el.dataset.req || "Please fill this in.";
    else if (v && el.dataset.rule && RULES[el.dataset.rule] && !RULES[el.dataset.rule](v)) msg = el.dataset.msg || "Please check this.";
    else if (v && el.dataset.check) msg = (window[el.dataset.check] || function () { return ""; })(el) || "";
    setErr(el, msg); return !msg;
  }
  function checkGroup(fs) {
    var name = fs.dataset.group, ok = !!$("input[name='" + name + "']:checked", fs);
    var e = $(".err", fs); if (!e) { e = document.createElement("p"); e.className = "err"; e.id = name + "-err"; fs.appendChild(e); fs.setAttribute("aria-describedby", e.id); }
    e.textContent = ok ? "" : (fs.dataset.req || "Please choose one."); return ok;
  }
  function validate(root) {
    var bad = null;
    $$("[data-group]", root).forEach(function (fs) { if (fs.offsetParent === null) return; if (!checkGroup(fs) && !bad) bad = $("input", fs); });
    $$("input,select,textarea", root).forEach(function (el) { if (el.offsetParent === null || el.closest("[data-group]") || el.type === "radio") return; if (!checkField(el) && !bad) bad = el; });
    if (bad) { bad.focus(); announce("Please check the highlighted fields."); }
    return !bad;
  }
  document.addEventListener("focusout", function (e) { var el = e.target; if (el.matches && el.matches("input[data-rule],input[required],select[required],textarea[required]") && el.type !== "radio" && el.value) checkField(el); });
  document.addEventListener("input", function (e) { var el = e.target; if (el.getAttribute && el.getAttribute("aria-invalid") === "true") checkField(el); });
  document.addEventListener("change", function (e) { var fs = e.target.closest && e.target.closest("[data-group]"); if (fs && $(".err", fs) && $(".err", fs).textContent) checkGroup(fs); });

  /* demo-only forms (newsletter, contact) */
  $$("form[data-demo]").forEach(function (f) {
    f.setAttribute("novalidate", "");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validate(f)) return;
      var btn = $("button[type=submit]", f); if (btn.disabled) return; btn.disabled = true;
      var out = $("[data-result]", f);
      out.hidden = false; out.textContent = f.dataset.demo; out.setAttribute("tabindex", "-1"); out.focus();
      setTimeout(function () { btn.disabled = false; f.reset(); }, 400);
    });
  });

  /* ---------- home: next free slot ---------- */
  var nextEl = $("[data-next-slot]");
  if (nextEl) {
    var found = null; nextDays(14).some(function (d) { var iso = isoDate(d); return slotsFor(iso, 60).some(function (s) { if (!s.taken) { found = niceDate(iso, true) + ", " + s.time; return true; } }); });
    if (found) nextEl.textContent = found;
  }

  /* ---------- treatments: scroll spy for the sub-nav ---------- */
  var sub = $(".subnav");
  if (sub && "IntersectionObserver" in window) {
    var links = $$("a", sub), map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { links.forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); }); var a = map[en.target.id]; if (a) { a.classList.add("active"); a.setAttribute("aria-current", "true"); if (a.scrollIntoView && sub.scrollWidth > sub.clientWidth) a.parentNode.parentNode.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" }); } }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- mobile book bar ---------- */
  var mbar = $(".mbar");
  if (mbar) {
    document.body.classList.add("has-mbar");
    var onScroll = function () { mbar.classList.toggle("show", window.scrollY > 520); };
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  /* ---------- visit: highlight today in hours ---------- */
  var today = $('.hours tr[data-day="' + new Date().getDay() + '"]');
  if (today) { today.classList.add("today"); var th = $("th", today); if (th) th.insertAdjacentHTML("beforeend", ' <span class="sr-only">(today)</span>'); }

  /* ---------- shop: filters + sort ---------- */
  var grid = $("#shop-grid");
  if (grid) {
    var cards = $$(".pcard", grid), chips = $$(".chip"), sortSel = $("#sort"), countEl = $("#result-count");
    var state = read(SS, "sl-shop", { f: "All", s: "featured" });
    function apply(animate) {
      chips.forEach(function (c) { c.setAttribute("aria-pressed", c.dataset.f === state.f); });
      sortSel.value = state.s;
      var shown = cards.filter(function (c) { var ok = state.f === "All" || c.dataset.concerns.split(",").indexOf(state.f) > -1; c.classList.toggle("out", !ok); if (ok && animate) { c.classList.remove("appear"); void c.offsetWidth; c.classList.add("appear"); } return ok; });
      var sorted = cards.slice().sort(function (a, b) {
        if (state.s === "low") return a.dataset.price - b.dataset.price;
        if (state.s === "high") return b.dataset.price - a.dataset.price;
        if (state.s === "name") return a.dataset.name.localeCompare(b.dataset.name);
        return a.dataset.order - b.dataset.order;
      });
      sorted.forEach(function (c) { grid.appendChild(c); });
      countEl.textContent = shown.length + (shown.length === 1 ? " product" : " products") + (state.f === "All" ? "" : " for " + state.f.toLowerCase() + " skin");
      write(SS, "sl-shop", state);
    }
    chips.forEach(function (c) { c.addEventListener("click", function () { state.f = c.dataset.f; apply(true); }); });
    sortSel.addEventListener("change", function () { state.s = sortSel.value; apply(true); });
    apply(false);
  }

  /* ---------- product page ---------- */
  var prod = $("#product");
  if (prod) {
    var pid = new URLSearchParams(location.search).get("id"), P = byId[pid];
    if (!P) { prod.className = "wrap"; prod.innerHTML = $("#nf-tpl").innerHTML; $("#pairs-sec").hidden = true; $("#p-crumb").textContent = "Not found"; document.title = "Product not found | Soft Light Skin Studio"; }
    else {
      document.title = P.name + " | Soft Light Skin Studio";
      var sel = { size: 0, qty: 1 };
      $("#p-crumb").textContent = P.name;
      $("#p-type").textContent = P.type;
      $("#p-name").textContent = P.name;
      $("#p-short").textContent = P.short;
      $("#p-tags").innerHTML = P.concerns.map(function (c) { return '<span class="tag tag--fill">' + c + "</span>"; }).join("");
      var main = $("#g-main img"), thumbs = $("#thumbs");
      function setMain(i) {
        var g = P.gallery[i], alt = i === 0 ? P.alt : (g === "hands" ? "Hands squeezing a dot of cream onto the back of a hand, with a jade roller on white linen" : g === "texture-gel" ? "Three clear dishes of gel, milk and golden oil textures on a peach background" : "Close-up of a thick, whipped cream texture");
        main.classList.add("fading");
        setTimeout(function () { main.srcset = srcset(g); main.src = "img/" + g + "-960.webp"; main.alt = alt; main.onload = function () { main.classList.remove("fading"); }; if (main.complete) main.classList.remove("fading"); }, i === -1 ? 0 : 160);
        $$("button", thumbs).forEach(function (b, k) { b.setAttribute("aria-current", k === i); });
      }
      main.srcset = srcset(P.img); main.src = "img/" + P.img + "-960.webp"; main.alt = P.alt;
      thumbs.innerHTML = P.gallery.map(function (g, i) { return '<button type="button" aria-label="Show image ' + (i + 1) + " of " + P.gallery.length + '" aria-current="' + (i === 0) + '"><img src="img/' + g + '-480.webp" alt="" width="72" height="90"></button>'; }).join("");
      $$("button", thumbs).forEach(function (b, i) { b.addEventListener("click", function () { setMain(i); }); });
      var sizes = $("#p-sizes"), price = $("#p-price"), qtyOut = $("#p-qty"), addBtn = $("#p-add");
      sizes.innerHTML = P.sizes.map(function (s, i) { return '<label class="pill"><input type="radio" name="size" value="' + i + '"' + (i === 0 ? " checked" : "") + '><span>' + s[0] + " &middot; " + fmt(s[1] * 100) + "</span></label>"; }).join("");
      function upd() {
        price.textContent = fmt(P.sizes[sel.size][1] * 100 * sel.qty);
        qtyOut.textContent = sel.qty;
        $("#q-minus").disabled = sel.qty <= 1; $("#q-plus").disabled = sel.qty >= MAX_QTY;
        addBtn.dataset.size = sel.size; addBtn.dataset.qty = sel.qty;
        addBtn.querySelector("span").textContent = "Add to bag, " + fmt(P.sizes[sel.size][1] * 100 * sel.qty);
      }
      sizes.addEventListener("change", function (e) { sel.size = +e.target.value; upd(); });
      $("#q-minus").addEventListener("click", function () { sel.qty = Math.max(1, sel.qty - 1); upd(); });
      $("#q-plus").addEventListener("click", function () { sel.qty = Math.min(MAX_QTY, sel.qty + 1); upd(); });
      addBtn.dataset.add = P.id;
      $("#p-ingredients").innerHTML = "<ul>" + P.ingredients.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
      $("#p-how").textContent = P.how;
      upd();
      $("#pairs").innerHTML = P.pairs.map(function (id) { var q = byId[id]; return '<article class="pcard"><div class="pcard-img"><img src="img/' + q.img + '-480.webp" srcset="' + srcset(q.img) + '" sizes="(max-width:760px) 46vw, 30vw" alt="' + esc(q.alt) + '" width="480" height="600" loading="lazy"></div><div class="pcard-top"><h3><a href="product.html?id=' + q.id + '">' + esc(q.name) + '</a></h3><span class="price">From ' + fmt(q.sizes[0][1] * 100) + '</span></div><p class="meta">' + q.type + '</p><button type="button" class="btn btn--ghost btn--sm add" data-add="' + q.id + '" aria-label="Add ' + esc(q.name) + ' to bag">Add to bag</button></article>'; }).join("");
    }
  }

  window.SL = { $: $, $$: $$, fmt: fmt, Bag: Bag, byId: byId, PRODUCTS: PRODUCTS, TREATMENTS: TREATMENTS, tById: tById, read: read, write: write, SS: SS, LS: LS, validate: validate, checkField: checkField, announce: announce, esc: esc, nextDays: nextDays, slotsFor: slotsFor, isoDate: isoDate, parseIso: parseIso, niceDate: niceDate, pad: pad, HOURS: HOURS, lineAction: lineAction, lineHTML: lineHTML, shipHTML: shipHTML, renderCounts: renderCounts, ICON: ICON };
})();
