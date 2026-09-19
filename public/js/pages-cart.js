/* Universal cart - works on Pages, Workers, and localhost without backend */
(function(){
  'use strict';
  var CART_KEY = '9mm_cart';
  var isStatic = location.hostname.includes('pages.dev') || location.hostname.includes('workers.dev') || location.hostname.includes('cloudflare') || document.documentElement.getAttribute('data-pages') === '1' || document.documentElement.getAttribute('data-static') === '1';
  var useClientCart = isStatic;

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
          span.style.cssText='background:#8c2f14;color:#fff;border-radius:10px;padding:2px 6px;font-size:11px;margin-left:6px';
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

  document.addEventListener('submit', function(e){
    var form = e.target;
    if(!form || form.getAttribute('action') !== '/cart/add') return;
    var isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if(isLocalhost && !useClientCart) return;

    e.preventDefault();
    var productId = form.querySelector('[name="productId"]')?.value || '';
    var qty = parseInt(form.querySelector('[name="qty"]')?.value || '1',10);
    var variantId = form.querySelector('[name="variantId"]')?.value || '';
    var h1 = document.querySelector('.pdp-info h1')?.textContent?.trim() || document.title.split('|')[0].trim();
    var skuMatch = document.querySelector('.pdp-meta')?.textContent?.match(/SKU\s+(\S+)/);
    var sku = skuMatch ? skuMatch[1] : productId;
    var priceText = document.querySelector('.pdp-price')?.textContent?.match(/\$([\d.,]+)/);
    var priceCents = 0;
    if(priceText) priceCents = Math.round(parseFloat(priceText[1].replace(/,/g,''))*100) || 0;
    var img = document.querySelector('#gallery-image')?.getAttribute('src') || '';

    var cart = readCart();
    var existing = cart.find(function(l){return l.productId===productId && l.variantId===variantId;});
    if(existing){
      existing.qty = Math.min(5, existing.qty + qty);
    } else {
      cart.push({productId: productId, variantId: variantId, qty: qty, name: h1, sku: sku, priceCents: priceCents, image: img, slug: location.pathname.split('/').filter(Boolean).pop()});
    }
    writeCart(cart);
    var btn = form.querySelector('button[type="submit"]');
    if(btn) {
      var orig = btn.textContent;
      btn.textContent = 'Added!';
      btn.disabled = true;
      setTimeout(function() {
        btn.textContent = orig;
        btn.disabled = false;
        location.href = '/cart/';
      }, 500);
    } else {
      location.href = '/cart/';
    }
  });

  function renderClientCart(){
    var isCartPage = location.pathname.startsWith('/cart');
    if(!isCartPage) return;
    var cart = readCart();
    var wrap = document.querySelector('.section .wrap');
    if(!wrap) return;
    var serverTable = wrap.querySelector('.cart-table');
    var emptyMsg = wrap.querySelector('.empty');
    var hasServerItems = serverTable && serverTable.querySelector('tbody tr');
    if(hasServerItems && !useClientCart) return;
    
    if(cart.length === 0) {
      if(!emptyMsg && !serverTable) {
        wrap.innerHTML = '<div class="empty"><h2>Your cart is empty</h2><p>Browse <a href="/glock-pistols-for-sale/">all Glock pistols</a> or <a href="/models">browse by model</a>.</p></div>';
      }
      return;
    }
    
    var html = '<div class="grid grid-2"><div><table class="cart-table"><thead><tr><th>Image</th><th>Item</th><th>Unit</th><th>Qty</th><th>Total</th><th>Remove</th></tr></thead><tbody>';
    var subtotal=0, itemCount=0;
    cart.forEach(function(line, idx){
      var lineTotal = line.priceCents * line.qty;
      subtotal+=lineTotal;
      itemCount+=line.qty;
      var productLink = line.slug ? '/product/' + line.slug + '/' : '#';
      html+='<tr><td>'+(line.image?'<a href="'+productLink+'"><img src="'+line.image+'" alt="" width="76" height="57" style="object-fit:cover"></a>':'')+'</td><td><a href="'+productLink+'"><strong>'+escapeHtml(line.name)+'</strong></a><br><span class="meta-updated">SKU '+escapeHtml(line.sku)+'</span></td><td>$'+(line.priceCents/100).toFixed(2)+'</td><td><input type="number" value="'+line.qty+'" min="1" max="5" data-idx="'+idx+'" class="pages-qty" style="width:60px"> <button class="btn btn-secondary btn-sm pages-update" data-idx="'+idx+'">Update</button></td><td>$'+(lineTotal/100).toFixed(2)+'</td><td><button class="btn btn-secondary btn-sm pages-remove" data-idx="'+idx+'">Remove</button></td></tr>';
    });
    html+='</tbody></table><p><button class="btn btn-secondary btn-sm" id="clear-cart">Clear cart</button></p></div><div><div class="cart-summary"><h2>Summary</h2><dl><dt>Items</dt><dd>'+itemCount+'</dd><dt>Subtotal</dt><dd>$'+(subtotal/100).toFixed(2)+'</dd><dt>Shipping</dt><dd>Calculated at checkout to your dropoff location</dd><dt>Tax</dt><dd>Calculated at checkout</dd></dl><p class="meta-updated">Firearms ship to your dropoff location where the licensed dealer completes the transfer. Parts can ship directly to you.</p>';
    // PROCEED TO CHECKOUT BUTTON - main requirement
    html+='<p><a class="btn btn-primary btn-block" href="/order-request/" id="proceed-checkout">Proceed to checkout</a></p>';
    html+='<p><a class="btn btn-secondary btn-block" href="/glock-pistols-for-sale/">Keep browsing the catalogue</a></p><p class="meta-updated"><small>Cart saved in browser. You will enter shipping and payment details at checkout.</small></p></div></div></div>';
    wrap.innerHTML = html;
    
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
    var clearBtn = document.getElementById('clear-cart');
    if(clearBtn) {
      clearBtn.addEventListener('click', function(){
        if(confirm('Clear cart?')) { localStorage.removeItem(CART_KEY); location.reload(); }
      });
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('[data-add-to-cart]');
    if(!btn) return;
    e.preventDefault();
    var productId = btn.getAttribute('data-product-id') || '';
    var name = btn.getAttribute('data-name') || '';
    var sku = btn.getAttribute('data-sku') || '';
    var priceCents = parseInt(btn.getAttribute('data-price') || '0',10);
    var image = btn.getAttribute('data-image') || '';
    var slug = btn.getAttribute('data-slug') || '';
    var cart = readCart();
    var existing = cart.find(function(l){return l.productId===productId;});
    if(existing){
      existing.qty = Math.min(5, existing.qty + 1);
    } else {
      cart.push({productId: productId, qty: 1, name: name, sku: sku, priceCents: priceCents, image: image, slug: slug});
    }
    writeCart(cart);
    var orig = btn.textContent;
    btn.textContent = 'Added!';
    setTimeout(function(){ btn.textContent = orig; }, 1000);
  });

  document.addEventListener('DOMContentLoaded', function(){
    updateBadge();
    renderClientCart();
  });
  updateBadge();
  if(document.readyState !== 'loading') {
    renderClientCart();
  } else {
    document.addEventListener('DOMContentLoaded', renderClientCart);
  }
  setTimeout(function(){ updateBadge(); renderClientCart(); }, 500);
})();
