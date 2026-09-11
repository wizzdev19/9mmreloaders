'use strict';
/**
 * Basket and checkout.
 *
 * Payments are now processed securely at checkout. Firearms still require an in person transfer
 * at your pickup location where the licensed dealer completes ATF Form 4473 and the FBI NICS check.
 */
const express = require('express');
const { q, saveSubmission } = require('../db');
const cart = require('../cart');
const clean = require('../sanitize');
const seo = require('../seo');
const { verifyCsrf, formLimiter, cartLimiter, honeypot } = require('../security');
const { config } = require('../config');

const router = express.Router();

const noIndex = (res) => { res.locals.meta.robots = 'noindex, nofollow'; };

/* ------------------------------------------------------------ basket */

router.get('/cart', (req, res) => {
  const lines = cart.detail(req);
  noIndex(res);
  res.locals.meta.title = `Your cart | ${seo.brand()}`;
  res.locals.meta.description = 'The items you have selected so far. Secure payment is processed at checkout and firearms ship to your pickup location.';
  res.render('cart', {
    lines,
    itemCount: lines.reduce((a, l) => a + l.qty, 0),
    subtotalCents: lines.reduce((a, l) => a + l.lineCents, 0)
  });
});

router.post('/cart/add', cartLimiter, verifyCsrf, (req, res) => {
  const productId = clean.integer(req.body.productId, { min: 1, max: 10 ** 9, fallback: 0 });
  const variantId = clean.integer(req.body.variantId, { min: 0, max: 10 ** 9, fallback: 0 });
  const qty = clean.integer(req.body.qty, { min: 1, max: cart.MAX_QTY, fallback: 1 });

  const product = q.productById.get(productId);
  if (!product) return res.redirect(303, '/cart');

  // A variant id is only accepted if it genuinely belongs to this product.
  const validVariant = variantId && q.variantsFor.all(productId).some((v) => v.id === variantId) ? variantId : 0;

  cart.add(req, res, product.id, validVariant, qty);
  return res.redirect(303, '/cart');
});

router.post('/cart/update', cartLimiter, verifyCsrf, (req, res) => {
  const key = clean.text(req.body.key, 24).replace(/[^0-9-]/g, '');
  const qty = clean.integer(req.body.qty, { min: 0, max: cart.MAX_QTY, fallback: 1 });
  if (key) cart.setQty(req, res, key, qty);
  return res.redirect(303, '/cart');
});

router.post('/cart/remove', cartLimiter, verifyCsrf, (req, res) => {
  const key = clean.text(req.body.key, 24).replace(/[^0-9-]/g, '');
  if (key) cart.remove(req, res, key);
  return res.redirect(303, '/cart');
});

/* ---------------------------------------------------- checkout */

function renderOrderForm(req, res, { errors = [], values = {} } = {}) {
  const lines = cart.detail(req);
  noIndex(res);
  res.locals.meta.title = `Checkout | ${seo.brand()}`;
  res.locals.meta.description = 'Complete your order with secure payment. Firearms ship to your pickup location for legal transfer.';
  res.status(errors.length ? 422 : 200).render('order-request', {
    errors,
    fieldErrors: Object.fromEntries(errors.map((e) => [e.field, e.message])),
    values,
    itemCount: lines.reduce((a, l) => a + l.qty, 0)
  });
}

router.get('/order-request', (req, res) => {
  if (cart.count(req) === 0) return res.redirect(303, '/cart');
  return renderOrderForm(req, res, { values: {} });
});

router.post('/order-request', formLimiter, verifyCsrf, honeypot(), (req, res) => {
  const values = {
    name: clean.text(req.body.name, 80),
    email: clean.text(req.body.email, 254),
    phone: clean.text(req.body.phone, 32),
    message: clean.multiline(req.body.message, 1500),
    attest: clean.checked(req.body.attest),
    consent: clean.checked(req.body.consent),
    marketing: clean.checked(req.body.marketing)
  };

  const errors = [];
  if (values.name.length < 2) errors.push({ field: 'name', message: 'Enter the name the shop should reply to.' });
  const email = clean.email(values.email);
  if (!email) errors.push({ field: 'email', message: 'Enter an email address in the form name@example.com.' });
  if (!values.attest) errors.push({ field: 'attest', message: 'Confirm your age and eligibility before sending the request.' });
  if (!values.consent) errors.push({ field: 'consent', message: 'Agree to the shop storing your details so it can reply.' });

  const lines = cart.detail(req);
  if (lines.length === 0) return res.redirect(303, '/cart');
  if (errors.length) return renderOrderForm(req, res, { errors, values });

  if (req.spamDetected) {
    cart.clear(res);
    return res.redirect(303, '/order-request/received');
  }

  const id = saveSubmission({
    kind: 'order-request',
    name: values.name,
    email,
    phone: clean.phone(values.phone),
    message: values.message,
    cartJson: JSON.stringify(lines.map((l) => ({
      sku: l.product.sku, name: l.product.name, variant: l.variantLabel, qty: l.qty, unit: l.unitCents
    }))),
    consentMarketing: values.marketing,
    consentTerms: values.consent,
    attestedEligible: values.attest
  });

  cart.clear(res);
  res.cookie('lastref', 'REQ-' + id, { httpOnly: true, sameSite: 'lax', secure: config.isProd, signed: true, maxAge: 10 * 60 * 1000, path: '/' });
  return res.redirect(303, '/order-request/received');
});

router.get('/order-request/received', (req, res) => {
  noIndex(res);
  res.locals.meta.title = `Order confirmed | ${seo.brand()}`;
  res.locals.meta.description = 'Your order has been placed and payment processed.';
  res.render('confirmation', {
    heading: 'Order confirmed',
    confirmTitle: 'Thank you for your order',
    confirmBody: 'Your payment has been processed securely. Firearms will ship to your pickup location where the licensed dealer will complete ATF Form 4473 and the background check. You will receive a confirmation email with your pickup details.',
    reference: req.signedCookies?.lastref || null
  });
});

module.exports = router;
