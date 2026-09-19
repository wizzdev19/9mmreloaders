/* Checkout page - works with client-side cart on static Pages/Workers */
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
  
  function initCheckout() {
    var isCheckout = location.pathname.startsWith('/order-request') || location.pathname.startsWith('/checkout');
    if(!isCheckout) return;
    
    var cart = readCart();
    var itemCountEl = document.querySelector('.meta-updated');
    // Find the element showing item count
    var countText = document.body.innerHTML.match(/Items attached to this request:\s*(\d+)/);
    
    // If on static and cart has items, update the count display
    if(cart.length > 0) {
      var itemCount = cart.reduce(function(a,l){return a + (l.qty||0);},0);
      var subtotal = cart.reduce(function(a,l){return a + (l.priceCents * l.qty);},0);
      
      // Update item count text
      var metaEls = document.querySelectorAll('.meta-updated');
      metaEls.forEach(function(el){
        if(el.textContent.includes('Items attached')) {
          el.innerHTML = 'Items attached to this request: ' + itemCount + ' (' + formatPrice(subtotal) + ' subtotal). <a href="/cart/">Review the list</a>';
        }
      });
      
      // Add order summary above form if on checkout page
      var form = document.querySelector('form[action="/order-request"]');
      if(form) {
        var existingSummary = document.getElementById('client-order-summary');
        if(!existingSummary) {
          var summaryDiv = document.createElement('div');
          summaryDiv.id = 'client-order-summary';
          summaryDiv.className = 'note';
          summaryDiv.style.marginBottom = '20px';
          var html = '<h3>Your order (' + itemCount + ' items)</h3><table style="width:100%;font-size:14px"><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>';
          cart.forEach(function(line){
            html += '<tr><td>' + escapeHtml(line.name) + '<br><small>SKU ' + escapeHtml(line.sku) + '</small></td><td>' + line.qty + '</td><td>' + formatPrice(line.priceCents * line.qty) + '</td></tr>';
          });
          html += '</tbody></table><p><strong>Subtotal: ' + formatPrice(subtotal) + '</strong><br><small>Shipping and tax calculated at checkout to your dropoff location</small></p>';
          summaryDiv.innerHTML = html;
          form.parentNode.insertBefore(summaryDiv, form);
        }
        
        // Intercept form submit for static sites
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
            
            // Build order details
            var orderDetails = 'NEW ORDER from ' + name + ' (' + email + ')\n';
            orderDetails += 'Phone: ' + phone + '\n';
            orderDetails += 'Payment: ' + paymentMethod + '\n';
            orderDetails += 'Items:\n';
            cart.forEach(function(line){
              orderDetails += '- ' + line.name + ' (SKU ' + line.sku + ') x' + line.qty + ' = ' + formatPrice(line.priceCents * line.qty) + '\n';
            });
            orderDetails += 'Subtotal: ' + formatPrice(subtotal) + '\n';
            orderDetails += 'Notes: ' + message + '\n';
            
            // For static, show success and clear cart, redirect to contact or show message
            var wrap = document.querySelector('.section .wrap');
            if(wrap) {
              wrap.innerHTML = '<div class="pagehead"><div class="wrap"><h1>Order received</h1><p>Thank you, ' + escapeHtml(name) + '. Your order request has been prepared.</p></div></div><div class="section"><div class="wrap prose"><div class="note note-legal"><h3>What happens next</h3><p>Your payment method <strong>' + escapeHtml(paymentMethod) + '</strong> has been noted. The shop will confirm availability and ship your items to your dropoff location.</p><p>Order summary:</p><pre style="background:#f5f5f5;padding:12px;white-space:pre-wrap;font-size:13px">' + escapeHtml(orderDetails) + '</pre><p>Since this is a static demo, please copy this order and send it via the <a href="/contact/">contact form</a> or email the shop directly.</p><p><strong>Next steps:</strong></p><ol><li>Copy your order details above</li><li><a href="/contact/?message=' + encodeURIComponent(orderDetails) + '">Contact shop with order</a></li><li>Shop confirms stock and dropoff location</li><li>Payment processed securely</li></ol></div><p><a class="btn btn-primary" href="/glock-pistols-for-sale/">Keep browsing</a></p></div></div>';
              localStorage.removeItem(CART_KEY);
            }
          });
        }
      }
    } else {
      // No cart items, show message on checkout
      var form = document.querySelector('form[action="/order-request"]');
      if(form && location.pathname.startsWith('/order-request')) {
        var wrap = document.querySelector('.section .wrap');
        var isStatic = location.hostname.includes('pages.dev') || location.hostname.includes('workers.dev');
        if(isStatic && wrap) {
          var emptyCheck = document.querySelector('.meta-updated');
          if(emptyCheck && emptyCheck.textContent.includes('0')) {
            // Add warning
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
  
  document.addEventListener('DOMContentLoaded', initCheckout);
  if(document.readyState !== 'loading') initCheckout();
  setTimeout(initCheckout, 500);
})();
