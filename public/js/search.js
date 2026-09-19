/* Client-side search for all product names - works on Pages and Workers static */
(function() {
  'use strict';

  var SEARCH_INDEX_URL = '/search-index.json';
  var indexCache = null;
  var searchInput = null;
  var resultsContainer = null;
  var isSearchPage = location.pathname.startsWith('/search');

  function fetchIndex() {
    if (indexCache) return Promise.resolve(indexCache);
    return fetch(SEARCH_INDEX_URL)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        indexCache = data;
        return data;
      })
      .catch(function() {
        return [];
      });
  }

  function normalize(str) {
    return (str || '').toString().toLowerCase().trim();
  }

  function searchProducts(term, products) {
    var q = normalize(term);
    if (!q) return [];
    var terms = q.split(/\s+/).filter(Boolean);
    return products.filter(function(p) {
      var text = p.searchText || '';
      // All terms must match
      return terms.every(function(t) {
        return text.indexOf(t) !== -1;
      });
    }).slice(0, 48);
  }

  function formatPrice(cents) {
    if (cents == null) return 'Price on request';
    return '$' + (cents / 100).toFixed(2);
  }

  function renderResults(products, term, container) {
    if (!container) return;
    if (!term) {
      container.innerHTML = '<div class="empty"><h2>Enter a search term</h2><p>Try: Glock 19, 9mm, MOS, 43X, trigger, GR-5163</p></div>';
      return;
    }
    if (products.length === 0) {
      container.innerHTML = '<div class="empty"><h2>Nothing matched "' + escapeHtml(term) + '"</h2><p>Check spelling, or browse <a href="/models">all Glock models</a>.</p></div>';
      return;
    }
    var html = '<p>' + products.length + ' listing' + (products.length === 1 ? '' : 's') + ' match "' + escapeHtml(term) + '".</p>';
    html += '<div class="grid grid-4">';
    products.forEach(function(p) {
      var img = p.image ? '/img/products/' + p.image : '/img/brand/logo.png';
      var price = formatPrice(p.price_cents);
      html += '<article class="card"><a href="/product/' + p.slug + '/" class="card-media"><img src="' + img + '" alt="' + escapeHtml(p.name) + '" width="320" height="240" loading="lazy"></a>';
      html += '<div class="card-body"><h2 class="card-title"><a href="/product/' + p.slug + '/">' + escapeHtml(p.name) + '</a></h2>';
      html += '<p class="card-meta">SKU ' + escapeHtml(p.sku || '') + ' · ' + escapeHtml(p.product_class || '') + '</p>';
      html += '<p class="card-price">' + price + '</p></div></article>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function initSearchPage() {
    if (!isSearchPage) return;
    var form = document.querySelector('form[action="/search"]');
    var input = document.getElementById('q') || (form && form.querySelector('input[name="q"]'));
    var wrap = document.querySelector('.section .wrap');
    // Find results container - after form
    var grid = wrap ? wrap.querySelector('.grid.grid-4') : null;
    var empty = wrap ? wrap.querySelector('.empty') : null;
    var resultsArea = document.createElement('div');
    resultsArea.id = 'client-search-results';
    if (grid) {
      grid.parentNode.insertBefore(resultsArea, grid);
      grid.style.display = 'none';
    } else if (empty) {
      empty.parentNode.insertBefore(resultsArea, empty);
      empty.style.display = 'none';
    } else if (wrap) {
      wrap.appendChild(resultsArea);
    }

    function doSearch() {
      var term = input ? input.value : new URLSearchParams(location.search).get('q') || '';
      if (!term) {
        renderResults([], '', resultsArea);
        return;
      }
      fetchIndex().then(function(products) {
        var results = searchProducts(term, products);
        renderResults(results, term, resultsArea);
        // Update count in header
        var headerP = document.querySelector('.pagehead p');
        if (headerP) {
          headerP.textContent = results.length + ' listing' + (results.length === 1 ? '' : 's') + ' match "' + term + '".';
        }
      });
    }

    // Initial search from URL
    var urlTerm = new URLSearchParams(location.search).get('q');
    if (urlTerm && input) input.value = urlTerm;
    if (urlTerm) doSearch();

    // Live search as typing
    if (input) {
      var timeout;
      input.addEventListener('input', function() {
        clearTimeout(timeout);
        timeout = setTimeout(doSearch, 300);
      });
    }

    // Intercept form submit for client-side
    if (form) {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var term = input ? input.value : '';
        var url = new URL(location.href);
        url.searchParams.set('q', term);
        history.pushState(null, '', url.toString());
        doSearch();
      });
    }
  }

  function initHeaderSearch() {
    // Enhance header search to use client-side index for autocomplete
    var headerInput = document.getElementById('site-search');
    if (!headerInput) return;
    var form = headerInput.closest('form');
    if (!form) return;

    // Create dropdown for autocomplete
    var dropdown = document.createElement('div');
    dropdown.id = 'search-autocomplete';
    dropdown.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #ddd;border-top:none;max-height:300px;overflow-y:auto;z-index:100;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.1)';
    form.style.position = 'relative';
    form.appendChild(dropdown);

    function showAutocomplete(term) {
      if (!term || term.length < 2) {
        dropdown.style.display = 'none';
        return;
      }
      fetchIndex().then(function(products) {
        var results = searchProducts(term, products).slice(0, 6);
        if (results.length === 0) {
          dropdown.style.display = 'none';
          return;
        }
        var html = '';
        results.forEach(function(p) {
          html += '<a href="/product/' + p.slug + '/" style="display:flex;align-items:center;gap:10px;padding:8px 12px;text-decoration:none;color:#14171a;border-bottom:1px solid #eee"><img src="/img/products/' + (p.image || '') + '" alt="" width="40" height="30" style="object-fit:cover"><span><strong>' + escapeHtml(p.name) + '</strong><br><small>' + escapeHtml(p.sku || '') + ' · ' + formatPrice(p.price_cents) + '</small></span></a>';
        });
        html += '<a href="/search/?q=' + encodeURIComponent(term) + '" style="display:block;padding:8px 12px;background:#f5f5f5;text-align:center;font-size:14px;color:#8c2f14">View all ' + searchProducts(term, products).length + ' results</a>';
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
      });
    }

    var timeout;
    headerInput.addEventListener('input', function() {
      clearTimeout(timeout);
      var term = headerInput.value;
      timeout = setTimeout(function() { showAutocomplete(term); }, 200);
    });
    headerInput.addEventListener('blur', function() {
      setTimeout(function() { dropdown.style.display = 'none'; }, 200);
    });
    headerInput.addEventListener('focus', function() {
      if (headerInput.value) showAutocomplete(headerInput.value);
    });

    // Intercept header search form for client-side
    form.addEventListener('submit', function(e) {
      // Let it go to /search page which will handle client-side
      // Don't prevent, just ensure term is there
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initSearchPage();
    initHeaderSearch();
  });
  // Run immediately if DOM already loaded
  if (document.readyState !== 'loading') {
    initSearchPage();
    initHeaderSearch();
  }
})();
