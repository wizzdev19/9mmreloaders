'use strict';
/**
 * Static content, policy pages and the contact form.
 */
const express = require('express');
const { q, saveSubmission, listProducts } = require('../db');
const seo = require('../seo');
const clean = require('../sanitize');
const { config } = require('../config');
const { verifyCsrf, formLimiter, honeypot } = require('../security');

const router = express.Router();

function page(res, view, meta, data = {}) {
  res.locals.meta = {
    title: `${meta.title} | ${seo.brand()}`,
    description: meta.description,
    canonical: seo.absoluteUrl(meta.path),
    robots: meta.robots || null
  };
  res.locals.jsonLd = [seo.breadcrumbLd([
    { label: 'Home', href: '/' },
    { label: meta.title, href: meta.path }
  ])];
  res.render(view, data);
}

router.get('/about', (req, res) => {
  const range = q.priceRange.get();
  const models = q.categories.all().filter((c) => c.grp === 'Models');
  page(res, 'pages/about', {
    title: 'About the business',
    description: 'Who operates this shop, where the catalogue data comes from, and what this site deliberately does not claim.',
    path: '/about'
  }, {
    stats: { total: q.countAll.get().c, modelCount: models.length, minPrice: range.lo, maxPrice: range.hi }
  });
});

router.get('/compliance', (req, res) => {
  page(res, 'pages/compliance', {
    title: 'Compliance and eligibility',
    description: 'Age limits, prohibited persons, local law and the checks this dealer performs before a firearm is released.',
    path: '/compliance'
  }, {
    restricted: Array.isArray(config.business?.policy?.restrictedDestinations) ? config.business.policy.restrictedDestinations : []
  });
});

router.get('/shipping-and-transfer-policy', (req, res) => {
  page(res, 'pages/shipping-and-transfer-policy', {
    title: 'Shipping and transfers',
    description: 'How a firearm or part listed on this site physically reaches you, and how shipping, transfer fees and tax are quoted.',
    path: '/shipping-and-transfer-policy'
  });
});

router.get('/returns-policy', (req, res) => {
  page(res, 'pages/returns-policy', {
    title: 'Returns policy',
    description: 'The return window, what can be returned, and why a firearm return has to follow an agreed route.',
    path: '/returns-policy'
  });
});

router.get('/privacy-policy', (req, res) => {
  page(res, 'pages/privacy-policy', {
    title: 'Privacy policy',
    description: 'Exactly what personal data this website collects, why, who processes it and how long it is kept.',
    path: '/privacy-policy'
  }, {
    reviewedOn: config.business?.policy?.complianceReviewedOn || 'not yet reviewed'
  });
});

router.get('/cookie-policy', (req, res) => {
  page(res, 'pages/cookie-policy', {
    title: 'Cookie policy',
    description: 'Every cookie this site can set, what it does and how long it lasts. No advertising or tracking cookies are used.',
    path: '/cookie-policy'
  }, {
    analyticsConfigured: Boolean(config.analyticsMeasurementId)
  });
});

router.get('/terms-of-service', (req, res) => {
  page(res, 'pages/terms-of-service', {
    title: 'Terms of service',
    description: 'The terms that cover use of this website, the accuracy of listings and the order request process.',
    path: '/terms-of-service'
  });
});

router.get('/accessibility', (req, res) => {
  page(res, 'pages/accessibility', {
    title: 'Accessibility',
    description: 'What this site does to remain usable with a keyboard or a screen reader, and the gaps that are still open.',
    path: '/accessibility'
  });
});

/* -------------------------------------------------------------- contact */

function renderContact(req, res, { errors = [], values = {}, status = 200 } = {}) {
  res.locals.meta = {
    title: `Contact the shop | ${seo.brand()}`,
    description: 'Ask about a SKU, availability or how a transfer would work for your location.',
    canonical: seo.absoluteUrl('/contact'),
    robots: null
  };
  res.locals.jsonLd = [seo.breadcrumbLd([
    { label: 'Home', href: '/' },
    { label: 'Contact', href: '/contact' }
  ])];
  res.status(status).render('contact', {
    errors,
    fieldErrors: Object.fromEntries(errors.map((e) => [e.field, e.message])),
    values
  });
}

router.get('/contact', (req, res) => {
  const sku = clean.text(req.query.sku, 40);
  renderContact(req, res, {
    values: { message: sku ? `Question about SKU ${sku}: ` : '' }
  });
});

router.post('/contact', formLimiter, verifyCsrf, honeypot(), (req, res) => {
  const values = {
    name: clean.text(req.body.name, 80),
    email: clean.text(req.body.email, 254),
    message: clean.multiline(req.body.message, 1500),
    consent: clean.checked(req.body.consent)
  };

  const errors = [];
  if (values.name.length < 2) errors.push({ field: 'name', message: 'Enter the name the shop should reply to.' });
  const email = clean.email(values.email);
  if (!email) errors.push({ field: 'email', message: 'Enter an email address in the form name@example.com.' });
  if (values.message.length < 10) errors.push({ field: 'message', message: 'Write at least a sentence so the shop knows what you need.' });
  if (!values.consent) errors.push({ field: 'consent', message: 'Agree to the shop storing your details so it can reply.' });

  if (errors.length) return renderContact(req, res, { errors, values, status: 422 });

  if (!req.spamDetected) {
    saveSubmission({
      kind: 'contact',
      name: values.name,
      email,
      phone: null,
      message: values.message,
      cartJson: null,
      consentMarketing: false,
      consentTerms: values.consent,
      attestedEligible: false
    });
  }

  return res.redirect(303, '/contact/received');
});

router.get('/contact/received', (req, res) => {
  res.locals.meta = {
    title: `Message received | ${seo.brand()}`,
    description: 'Your message has reached the shop.',
    canonical: seo.absoluteUrl('/contact/received'),
    robots: 'noindex, nofollow'
  };
  res.render('confirmation', {
    heading: 'Message received',
    confirmTitle: 'Your message is with the shop',
    confirmBody: 'A member of staff replies to the email address you gave. Nothing else about you was stored.',
    reference: null
  });
});

module.exports = router;
