'use strict';
/**
 * Values every template needs. Registered once so no route has to remember them.
 */
const { config } = require('./config');
const seo = require('./seo');
const cart = require('./cart');
const { jsonForScript } = require('./sanitize');

const real = (value) => typeof value === 'string' && value.trim() !== '' && !/PLACEHOLDER/.test(value);

// Cache buster derived from boot time. Static assets are served with a long max-age,
// so the query string is what makes a deploy visible to a returning browser.
const ASSET_VERSION = String(Date.now()).slice(-8);

function locals(req, res, next) {
  const biz = config.business || {};
  res.locals.business = biz;
  res.locals.brand = seo.brand();
  res.locals.year = new Date().getFullYear();
  res.locals.isProd = config.isProd;
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.placeholderCount = config.businessPlaceholders.length;
  res.locals.analyticsId = config.analyticsMeasurementId || '';
  res.locals.currentPath = req.path;
  res.locals.cartCount = cart.count(req);
  res.locals.money = seo.money;
  res.locals.jsonForScript = jsonForScript;
  res.locals.transferConfirmed = biz.policy?.transferProcessConfirmed === true;
  res.locals.complianceSignedOff = real(biz.policy?.complianceReviewedBy);
  res.locals.hasRealPhone = real(biz.contact?.phone);
  res.locals.hasRealEmail = real(biz.contact?.email);
  res.locals.hasRealPrivacyEmail = real(biz.contact?.privacyEmail);
  res.locals.hasRealHours = real(biz.contact?.supportHours);
  res.locals.hasRealFfl = real(biz.fflLicenceNumber);
  res.locals.hasRealAddress = real(biz.address?.street) && real(biz.address?.locality);
  res.locals.jurisdiction = biz.jurisdiction || {};
  res.locals.jurisdictionPending = !real(biz.jurisdiction?.country);
  res.locals.retentionMonths = Number(biz.policy?.dataRetentionMonths || 24);
  res.locals.returnsWindowDays = Number(biz.policy?.returnsWindowDays || 30);
  res.locals.minAge = Number(biz.jurisdiction?.minimumAgeHandgun || 21);
  res.locals.searchTerm = '';
  res.locals.jsonLd = [];
  res.locals.meta = {
    title: seo.brand(),
    description: '',
    canonical: seo.absoluteUrl(req.path),
    robots: null
  };
  next();
}

module.exports = { locals, real, ASSET_VERSION };
