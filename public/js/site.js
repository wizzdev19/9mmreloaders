/* =========================================================================
   Progressive enhancement only.
   Every feature on this site works with this file blocked: navigation, search,
   the basket, the gallery and both forms are plain links and form posts.
   No animation, no scroll effects, no custom cursor, no third party code.
   ========================================================================= */
(function () {
  'use strict';

  var COOKIE_CONSENT = 'cc';
  var COOKIE_AGE = 'agenotice';
  var SIX_MONTHS = 60 * 60 * 24 * 182;

  function readCookie(name) {
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split('=');
      if (decodeURIComponent(pair[0]) === name) return decodeURIComponent(pair.slice(1).join('='));
    }
    return null;
  }

  function writeCookie(name, value, maxAgeSeconds) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = encodeURIComponent(name) + '=' + encodeURIComponent(value) +
      '; Max-Age=' + maxAgeSeconds + '; Path=/; SameSite=Lax' + secure;
  }

  /* ------------------------------------------------------ cookie consent */

  var bar = document.getElementById('cookiebar');
  if (bar) {
    var choice = readCookie(COOKIE_CONSENT);
    if (!choice) {
      bar.hidden = false;
    } else if (choice === 'all') {
      loadMeasurement();
    }

    var accept = document.getElementById('cookie-accept');
    var reject = document.getElementById('cookie-reject');
    if (accept) accept.addEventListener('click', function () {
      writeCookie(COOKIE_CONSENT, 'all', SIX_MONTHS);
      bar.hidden = true;
      loadMeasurement();
    });
    if (reject) reject.addEventListener('click', function () {
      writeCookie(COOKIE_CONSENT, 'required', SIX_MONTHS);
      bar.hidden = true;
    });
    var cookieClose = document.getElementById('cookiebar-close');
    if (cookieClose) cookieClose.addEventListener('click', function () {
      writeCookie(COOKIE_CONSENT, 'required', SIX_MONTHS);
      bar.hidden = true;
    });
  }

  /**
   * Measurement is loaded here and nowhere else, only after an explicit yes.
   * With no measurement id configured this function does nothing at all, so no
   * request leaves the browser.
   */
  function loadMeasurement() {
    if (!bar) return;
    var id = bar.getAttribute('data-analytics-id');
    if (!id) return;
    if (document.getElementById('measurement-script')) return;
    var s = document.createElement('script');
    s.id = 'measurement-script';
    s.async = true;
    s.src = '/js/measurement.js';
    s.setAttribute('data-id', id);
    document.head.appendChild(s);
  }

  /* --------------------------------------------------- age gate modal */

  var agegate = document.getElementById('agegate');
  if (agegate) {
    var ageCookie = readCookie(COOKIE_AGE);
    if (!ageCookie) {
      agegate.hidden = false;
      // trap focus inside modal while open
      document.body.style.overflow = 'hidden';
    }
    var ageYes = document.getElementById('agegate-yes');
    var ageNo = document.getElementById('agegate-no');
    var ageClose = document.getElementById('agegate-close');
    var ageBackdrop = document.getElementById('agegate-backdrop');
    var ageUnder = document.getElementById('agegate-under');

    function closeAgeGate(value) {
      writeCookie(COOKIE_AGE, value, SIX_MONTHS);
      agegate.hidden = true;
      document.body.style.overflow = '';
    }

    if (ageYes) ageYes.addEventListener('click', function () {
      closeAgeGate('21plus');
    });
    if (ageNo) ageNo.addEventListener('click', function () {
      // show under 21 message inside same modal, then allow close
      if (ageUnder) ageUnder.hidden = false;
      writeCookie(COOKIE_AGE, 'under21', SIX_MONTHS);
      // keep modal open so user reads message, but change yes button to continue browsing
      if (ageYes) {
        ageYes.textContent = 'Continue browsing';
        ageYes.focus();
      }
    });
    if (ageClose) ageClose.addEventListener('click', function () {
      // X closes as required cookies only for cookie bar, and as under21 for age gate if no choice yet
      var current = readCookie(COOKIE_AGE);
      if (!current) {
        closeAgeGate('seen');
      } else {
        agegate.hidden = true;
        document.body.style.overflow = '';
      }
    });
    if (ageBackdrop) ageBackdrop.addEventListener('click', function () {
      var current = readCookie(COOKIE_AGE);
      if (current) {
        agegate.hidden = true;
        document.body.style.overflow = '';
      }
    });
    // esc closes if already chosen, otherwise stores seen
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !agegate.hidden) {
        var current = readCookie(COOKIE_AGE);
        if (!current) {
          closeAgeGate('seen');
        } else {
          agegate.hidden = true;
          document.body.style.overflow = '';
        }
      }
    });
  }

  /* ------------------------------------------------------- mobile menu */

  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('primary-nav');
  var navWrap = document.getElementById('mainnav');
  if (toggle && nav && navWrap) {
    var small = window.matchMedia('(max-width: 720px)');
    function sync() {
      if (small.matches) {
        navWrap.setAttribute('data-collapsible', 'true');
        nav.hidden = toggle.getAttribute('aria-expanded') !== 'true';
      } else {
        navWrap.removeAttribute('data-collapsible');
        nav.hidden = false;
      }
    }
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      sync();
    });
    if (small.addEventListener) small.addEventListener('change', sync);
    sync();
  }

  /* ---------------------------------------------------------- gallery */

  var thumbs = document.getElementById('gallery-thumbs');
  var mainImage = document.getElementById('gallery-image');
  var mainSource = document.getElementById('gallery-source');
  if (thumbs && mainImage) {
    thumbs.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a[data-full]') : null;
      if (!link) return;
      event.preventDefault();
      // The <source> has to change too, otherwise the browser keeps serving the
      // WebP candidate for the previous image and the swap appears to do nothing.
      if (mainSource) mainSource.setAttribute('srcset', link.getAttribute('data-srcset') || '');
      mainImage.setAttribute('src', link.getAttribute('data-full'));
      mainImage.setAttribute('alt', link.getAttribute('data-alt') || '');
      var all = thumbs.querySelectorAll('a[data-full]');
      for (var i = 0; i < all.length; i++) all[i].removeAttribute('aria-current');
      link.setAttribute('aria-current', 'true');
    });
  }

  /* ------------------------------------------------- form error focus */

  var errorSummary = document.getElementById('form-errors');
  if (errorSummary) errorSummary.focus();
})();
