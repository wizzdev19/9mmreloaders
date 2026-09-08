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

  /* --------------------------------------------------- eligibility notice */

  var agebar = document.getElementById('agebar');
  if (agebar) {
    if (!readCookie(COOKIE_AGE)) agebar.hidden = false;
    var dismiss = document.getElementById('agebar-dismiss');
    if (dismiss) dismiss.addEventListener('click', function () {
      writeCookie(COOKIE_AGE, 'seen', SIX_MONTHS);
      agebar.hidden = true;
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
