/* Brightline Solar (made-up business): shared behaviour for every page. */
(function () {
  'use strict';

  // Header shadow once scrolled
  var top = document.querySelector('.top');
  if (top) {
    var onScroll = function () { top.classList.toggle('is-stuck', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mobile menu: button toggles, Escape closes and returns focus
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    var setOpen = function (open) {
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
    };
    btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { setOpen(false); btn.focus(); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 900) setOpen(false); });
  }

  // Session storage that never throws (private mode, blocked storage)
  var store = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  // SA cell: 06x, 07x or 08x and 10 digits, or +27 / 27 then 9 digits
  function saCell(v) {
    var d = String(v || '').replace(/[\s()-]/g, '');
    return /^(\+?27|0)[678]\d{8}$/.test(d);
  }
  function email(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()); }

  function ref(prefix) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return prefix + '-' + s.slice(0, 3) + s.slice(3);
  }

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  window.BL = { store: store, saCell: saCell, email: email, ref: ref, reducedMotion: reducedMotion };
})();
