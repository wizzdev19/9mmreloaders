/* Checkout page - works with client-side cart on static Pages/Workers - includes 15% crypto discount */
(function(){
  'use strict';
  var CART_KEY = '9mm_cart';
  
  function readCart(){
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch(e){ return []; }
  }
  
  function formatPrice(cents) {
    return '$' + (cents / 100).toFixed(2);
  }
  
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
  
  function calculateTotals(cart, paymentMethod) {
    var subtotal = cart.reduce(function(a,l){return a + (l.priceCents * l.qty);},0);
    var discount = 0;
    if(paymentMethod === 'crypto') {
      discount = Math.round(subtotal * 0.15);
    }
    var total = subtotal - discount;
    var itemCount = cart.reduce(function(a,l){return a + (l.qty||0);},0);
    return { subtotal: subtotal, discount: discount, total: total, itemCount: itemCount };
  }
  
  function initCheckout() {
    var isCheckout = location.pathname.startsWith('/order-request') || location.pathname.startsWith('/checkout');
    if(!isCheckout) return;
    
    var cart = readCart();
    
    if(cart.length > 0) {
      var initialTotals = calculateTotals(cart, '');
      
      // Update item count text
      var metaEls = document.querySelectorAll('.meta-updated');
      metaEls.forEach(function(el){
        if(el.textContent.includes('Items attached')) {
          el.innerHTML = 'Items attached to this request: ' + initialTotals.itemCount + ' (' + formatPrice(initialTotals.subtotal) + ' subtotal). <a href="/cart/">Review the list</a><br><small style="color:#8c2f14">Choose Crypto at payment for 15% off</small>';
        }
      });
      
      var form = document.querySelector('form[action="/order-request"]');
      if(form) {
        var existingSummary = document.getElementById('client-order-summary');
        if(!existingSummary) {
          var summaryDiv = document.createElement('div');
          summaryDiv.id = 'client-order-summary';
          summaryDiv.className = 'note';
          summaryDiv.style.marginBottom = '20px';
          summaryDiv.innerHTML = buildSummaryHtml(cart, '', initialTotals);
          form.parentNode.insertBefore(summaryDiv, form);
          
          // Listen for payment method changes to update totals with 15% crypto discount
          var paymentRadios = form.querySelectorAll('input[name="paymentMethod"]');
          paymentRadios.forEach(function(radio){
            radio.addEventListener('change', function(){
              var totals = calculateTotals(cart, radio.value);
              summaryDiv.innerHTML = buildSummaryHtml(cart, radio.value, totals);
              // Update item count text with discount info
              metaEls.forEach(function(el){
                if(el.textContent.includes('Items attached')) {
                  if(radio.value === 'crypto' && totals.discount > 0) {
                    el.innerHTML = 'Items attached to this request: ' + totals.itemCount + ' (' + formatPrice(totals.subtotal) + ' subtotal - ' + formatPrice(totals.discount) + ' crypto discount = <strong>' + formatPrice(totals.total) + ' total</strong>). <a href="/cart/">Review the list</a>';
                  } else {
                    el.innerHTML = 'Items attached to this request: ' + totals.itemCount + ' (' + formatPrice(totals.subtotal) + ' subtotal). <a href="/cart/">Review the list</a><br><small style="color:#8c2f14">Choose Crypto at payment for 15% off</small>';
                  }
                }
              });
            });
          });
          // Check if crypto already selected
          var checked = form.querySelector('input[name="paymentMethod"]:checked');
          if(checked) {
            var totals = calculateTotals(cart, checked.value);
            summaryDiv.innerHTML = buildSummaryHtml(cart, checked.value, totals);
          }
        }
        
        var isStatic = location.hostname.includes('pages.dev') || location.hostname.includes('workers.dev');
        if(isStatic) {
          form.addEventListener('submit', function(e){
            e.preventDefault();
            var formData = new FormData(form);
            var name = formData.get('name') || '';
            var email = formData.get('email') || '';
            var phone = formData.get('phone') || '';
            var message = formData.get('message') || '';
            var paymentMethod = formData.get('paymentMethod') || '';
            
            if(!name || !email || !paymentMethod) {
              alert('Please fill in name, email, and payment method');
              return;
            }
            
            var totals = calculateTotals(cart, paymentMethod);
            
            var orderDetails = 'NEW ORDER from ' + name + ' (' + email + ')\n';
            orderDetails += 'Phone: ' + phone + '\n';
            orderDetails += 'Payment: ' + paymentMethod + (paymentMethod === 'crypto' ? ' (15% discount applied)' : '') + '\n';
            orderDetails += 'Items:\n';
            cart.forEach(function(line){
              orderDetails += '- ' + line.name + ' (SKU ' + line.sku + ') x' + line.qty + ' = ' + formatPrice(line.priceCents * line.qty) + '\n';
            });
            orderDetails += 'Subtotal: ' + formatPrice(totals.subtotal) + '\n';
            if(totals.discount > 0) {
              orderDetails += 'Crypto Discount (15%): -' + formatPrice(totals.discount) + '\n';
              orderDetails += 'TOTAL: ' + formatPrice(totals.total) + '\n';
            } else {
              orderDetails += 'Total: ' + formatPrice(totals.total) + '\n';
            }
            orderDetails += 'Notes: ' + message + '\n';
            
            var wrap = document.querySelector('.section .wrap');
            if(wrap) {
              var discountHtml = totals.discount > 0 ? '<p><strong>Subtotal:</strong> ' + formatPrice(totals.subtotal) + '<br><strong style="color:#0a7d0a">Crypto Discount (15%): -' + formatPrice(totals.discount) + '</strong><br><strong>Total: ' + formatPrice(totals.total) + '</strong></p>' : '<p><strong>Total: ' + formatPrice(totals.total) + '</strong></p>';
              wrap.innerHTML = '<div class="pagehead"><div class="wrap"><h1>Order received</h1><p>Thank you, ' + escapeHtml(name) + '. Your order request has been prepared.</p></div></div><div class="section"><div class="wrap prose"><div class="note note-legal"><h3>What happens next</h3><p>Your payment method <strong>' + escapeHtml(paymentMethod) + '</strong> has been noted. ' + (paymentMethod === 'crypto' ? '<span style="color:#0a7d0a">15% discount applied!</span> ' : '') + 'The shop will confirm availability and ship your items to your dropoff location.</p>' + discountHtml + '<p>Order summary:</p><pre style="background:#f5f5f5;padding:12px;white-space:pre-wrap;font-size:13px">' + escapeHtml(orderDetails) + '</pre><p>Since this is a static demo, please copy this order and send it via the <a href="/contact/">contact form</a> or email the shop directly.</p><p><strong>Next steps:</strong></p><ol><li>Copy your order details above</li><li><a href="/contact/?message=' + encodeURIComponent(orderDetails) + '">Contact shop with order</a></li><li>Shop confirms stock and dropoff location</li><li>Payment processed securely' + (paymentMethod === 'crypto' ? ' with 15% off' : '') + '</li></ol></div><p><a class="btn btn-primary" href="/glock-pistols-for-sale/">Keep browsing</a></p></div></div>';
              localStorage.removeItem(CART_KEY);
            }
          });
        }
      }
    } else {
      var form = document.querySelector('form[action="/order-request"]');
      if(form && location.pathname.startsWith('/order-request')) {
        var wrap = document.querySelector('.section .wrap');
        var isStatic = location.hostname.includes('pages.dev') || location.hostname.includes('workers.dev');
        if(isStatic && wrap) {
          var emptyCheck = document.querySelector('.meta-updated');
          if(emptyCheck && emptyCheck.textContent.includes('0')) {
            var warning = document.createElement('div');
            warning.className = 'form-errors';
            warning.innerHTML = '<h2>Your cart is empty</h2><p>Add items from the <a href="/glock-pistols-for-sale/">catalogue</a> before checkout.</p>';
            form.parentNode.insertBefore(warning, form);
            form.style.display = 'none';
          }
        }
      }
    }
  }
  
  function buildSummaryHtml(cart, paymentMethod, totals) {
    var html = '<h3>Your order (' + totals.itemCount + ' items)</h3><table style="width:100%;font-size:14px"><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>';
    cart.forEach(function(line){
      html += '<tr><td>' + escapeHtml(line.name) + '<br><small>SKU ' + escapeHtml(line.sku) + '</small></td><td>' + line.qty + '</td><td>' + formatPrice(line.priceCents * line.qty) + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div style="border-top:1px solid #ddd;margin-top:10px;padding-top:10px">';
    html += '<p><strong>Subtotal: ' + formatPrice(totals.subtotal) + '</strong></p>';
    if(paymentMethod === 'crypto' && totals.discount > 0) {
      html += '<p style="color:#0a7d0a"><strong>Crypto Discount (15%): -' + formatPrice(totals.discount) + '</strong><br><small>You save ' + formatPrice(totals.discount) + ' with crypto!</small></p>';
      html += '<p style="font-size:18px"><strong>Total: ' + formatPrice(totals.total) + '</strong> <span style="background:#0a7d0a;color:#fff;padding:2px 6px;border-radius:4px;font-size:12px">15% OFF</span></p>';
    } else {
      html += '<p><strong>Total: ' + formatPrice(totals.total) + '</strong></p>';
      html += '<p><small style="color:#8c2f14">Choose <strong>Crypto</strong> payment for 15% off your order</small></p>';
    }
    html += '<p><small>Shipping and tax calculated at checkout to your dropoff location</small></p></div>';
    return html;
  }
  
  document.addEventListener('DOMContentLoaded', initCheckout);
  if(document.readyState !== 'loading') initCheckout();
  setTimeout(initCheckout, 500);
})();
