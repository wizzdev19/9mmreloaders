/* Cloudflare Pages cart - client side only, works without backend */
(function(){
  'use strict';
  var CART_KEY = '9mm_cart';
  var isPages = location.hostname.includes('pages.dev') || location.hostname.includes('cloudflare') || document.documentElement.getAttribute('data-pages') === '1';

  function readCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch(e){ return []; }
  }
  function writeCart(cart){
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
    updateBadge();
  }
  function updateBadge(){
    var cart = readCart();
    var count = cart.reduce(function(a,l){return a + (l.qty||0);},0);
    var badge = document.querySelector('a[href="/cart"]');
    if(badge){
      var existing = badge.querySelector('.cart-count');
      if(count>0){
        if(!existing){
          var span = document.createElement('span');
          span.className='cart-count';
          span.textContent=count;
          badge.appendChild(span);
        } else {
          existing.textContent=count;
        }
      } else if(existing){
        existing.remove();
      }
    }
  }

  // Intercept add to cart forms
  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!form || form.getAttribute('action') !== '/cart/add') return;
    // If backend is available (not Pages), let it handle normally unless we are on Pages
    if(!isPages && location.hostname === 'localhost') return; // let server handle on localhost
    // For Pages, handle client side
    if(isPages || location.hostname.includes('pages.dev')){
      e.preventDefault();
      var productId = form.querySelector('[name="productId"]')?.value || '';
      var qty = parseInt(form.querySelector('[name="qty"]')?.value || '1',10);
      var variantId = form.querySelector('[name="variantId"]')?.value || '';
      // Try to get product info from page
      var h1 = document.querySelector('.pdp-info h1')?.textContent?.trim() || document.title;
      var sku = document.querySelector('.pdp-meta')?.textContent?.match(/SKU\s+(\S+)/)?.[1] || productId;
      var priceText = document.querySelector('.pdp-price')?.textContent?.match(/\$([\d.,]+)/)?.[1] || '0';
      var priceCents = Math.round(parseFloat(priceText.replace(/,/g,''))*100) || 0;
      var img = document.querySelector('#gallery-image')?.getAttribute('src') || '';

      var cart = readCart();
      var existing = cart.find(function(l){return l.productId===productId && l.variantId===variantId;});
      if(existing){
        existing.qty = Math.min(5, existing.qty + qty);
      } else {
        cart.push({productId: productId, variantId: variantId, qty: qty, name: h1, sku: sku, priceCents: priceCents, image: img});
      }
      writeCart(cart);
      // Redirect to cart
      location.href = '/cart/';
    }
  });

  // Render cart page from localStorage if server says empty
  function renderPagesCart(){
    if(!isPages) return;
    var empty = document.querySelector('.empty h2');
    if(!empty || empty.textContent.indexOf('empty')===-1) return;
    var cart = readCart();
    if(cart.length===0) return;
    // Build table
    var wrap = document.querySelector('.section .wrap');
    if(!wrap) return;
    var html = '<div class="grid grid-2"><div><table class="cart-table"><thead><tr><th>Image</th><th>Item</th><th>Unit</th><th>Qty</th><th>Total</th><th>Remove</th></tr></thead><tbody>';
    var subtotal=0, itemCount=0;
    cart.forEach(function(line, idx){
      var lineTotal = line.priceCents * line.qty;
      subtotal+=lineTotal;
      itemCount+=line.qty;
      html+='<tr><td>'+(line.image?'<img src="'+line.image+'" alt="" width="76" height="57">':'')+'</td><td><strong>'+line.name+'</strong><br><span class="meta-updated">SKU '+line.sku+'</span></td><td>$'+(line.priceCents/100).toFixed(2)+'</td><td><input type="number" value="'+line.qty+'" min="1" max="5" data-idx="'+idx+'" class="pages-qty" style="width:60px"> <button class="btn btn-secondary btn-sm pages-update" data-idx="'+idx+'">Update</button></td><td>$'+(lineTotal/100).toFixed(2)+'</td><td><button class="btn btn-secondary btn-sm pages-remove" data-idx="'+idx+'">Remove</button></td></tr>';
    });
    html+='</tbody></table></div><div><div class="cart-summary"><h2>Summary</h2><dl><dt>Items</dt><dd>'+itemCount+'</dd><dt>Subtotal</dt><dd>$'+(subtotal/100).toFixed(2)+'</dd><dt>Shipping</dt><dd>Calculated at checkout</dd></dl><p class="meta-updated">Static Pages demo - checkout will need backend on Fly.io. For now, contact shop with SKUs.</p><p><a class="btn btn-primary btn-block" href="/contact">Contact about these items</a></p><p><a class="btn btn-secondary btn-block" href="/glock-pistols-for-sale/">Keep browsing</a></p></div></div></div>';
    wrap.innerHTML = html;
    // Bind events
    wrap.querySelectorAll('.pages-remove').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx=parseInt(btn.getAttribute('data-idx'),10);
        var c=readCart(); c.splice(idx,1); writeCart(c); location.reload();
      });
    });
    wrap.querySelectorAll('.pages-update').forEach(function(btn){
      btn.addEventListener('click', function(){
        var idx=parseInt(btn.getAttribute('data-idx'),10);
        var input=wrap.querySelector('.pages-qty[data-idx="'+idx+'"]');
        var qty=parseInt(input.value,10)||1;
        var c=readCart(); c[idx].qty=Math.min(5,Math.max(1,qty)); writeCart(c); location.reload();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    updateBadge();
    if(location.pathname.startsWith('/cart')) renderPagesCart();
  });
  // Also run now in case DOM already loaded
  updateBadge();
  if(location.pathname.startsWith('/cart')) {
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', renderPagesCart);
    else renderPagesCart();
  }
})();
