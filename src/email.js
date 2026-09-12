'use strict';
/**
 * Email abstraction - ready for when custom domain is available.
 * Supports:
 *   1. Resend API (recommended)
 *   2. SMTP via nodemailer (fallback, uses SMTP_HOST etc from .env)
 *   3. No-op when no credentials configured (logs to console, safe for deploy now)
 *
 * The site works without email today. Order requests and contact forms are saved to
 * data/app.db and can be exported. When RESEND_API_KEY and EMAIL_FROM are set,
 * this module sends transactional emails.
 *
 * Why Resend?
 *   - Simple API, good free tier (3k/mo, 100/day), great deliverability
 *   - Works well for firearms dealers selling legally (check their TOS at time of use)
 *   - React Email compatible if you later want templated receipts
 *
 * Alternatives considered:
 *   - Postmark: best deliverability for transactional, $15/mo for 10k, stricter approval but allows legal firearms
 *   - AWS SES: cheapest at scale ($0.10 per 1k), but requires domain verification and production access request
 *   - Mailgun / SendGrid: workable but have historically flagged firearms content more aggressively
 *
 * Recommendation: Start with Resend. If you outgrow it or want the absolute best inbox placement,
 * switch to Postmark. If you move to AWS infrastructure, switch to SES for cost.
 */

const { config } = require('./config');

let resendClient = null;
let nodemailerTransport = null;

function getResend() {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    // lazy require so the package is optional until needed
    const { Resend } = require('resend');
    resendClient = new Resend(key);
    return resendClient;
  } catch {
    console.warn('[email] RESEND_API_KEY set but resend package not installed. Run npm install resend');
    return null;
  }
}

function getSmtp() {
  if (nodemailerTransport) return nodemailerTransport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  try {
    const nodemailer = require('nodemailer');
    nodemailerTransport = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    return nodemailerTransport;
  } catch {
    console.warn('[email] SMTP_HOST set but nodemailer not installed. Run npm install nodemailer');
    return null;
  }
}

/**
 * Send an email. Returns { sent: boolean, id: string|null, provider: string }
 * Never throws - logs and returns sent:false if not configured.
 */
async function sendEmail({ to, subject, html, text, replyTo = null }) {
  const from = process.env.EMAIL_FROM || process.env.INQUIRY_NOTIFY_EMAIL || config.business?.contact?.email || null;
  if (!from) {
    console.log(`[email:noop] Would send to ${to} subject "${subject}" - no EMAIL_FROM configured`);
    return { sent: false, id: null, provider: 'noop' };
  }

  // 1. Try Resend first
  const resend = getResend();
  if (resend) {
    try {
      const result = await resend.emails.send({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
        replyTo: replyTo || undefined
      });
      console.log(`[email:resend] Sent to ${to} id ${result.data?.id || result.id}`);
      return { sent: true, id: result.data?.id || result.id || null, provider: 'resend' };
    } catch (err) {
      console.error('[email:resend] Failed', err.message);
      // fall through to SMTP
    }
  }

  // 2. Try SMTP
  const smtp = getSmtp();
  if (smtp) {
    try {
      const info = await smtp.sendMail({
        from,
        to,
        subject,
        html,
        text,
        replyTo: replyTo || undefined
      });
      console.log(`[email:smtp] Sent to ${to} id ${info.messageId}`);
      return { sent: true, id: info.messageId, provider: 'smtp' };
    } catch (err) {
      console.error('[email:smtp] Failed', err.message);
      return { sent: false, id: null, provider: 'smtp' };
    }
  }

  console.log(`[email:noop] No provider configured. Would send to ${to} subject "${subject}"`);
  return { sent: false, id: null, provider: 'noop' };
}

// Templates - kept minimal, no external dependencies
function orderReceivedEmail({ orderId, name, email, paymentMethod, subtotalCents, discountCents, totalCents, items }) {
  const brand = config.business?.tradingName || '9mmreloaders';
  const sub = (subtotalCents / 100).toFixed(2);
  const disc = (discountCents / 100).toFixed(2);
  const tot = (totalCents / 100).toFixed(2);
  const itemList = items.map(i => `- ${i.name} (${i.sku}) x${i.qty} $${(i.unit/100).toFixed(2)}`).join('\n');
  return {
    subject: `${brand} - Order ${orderId} received`,
    text: `Hi ${name},\n\nYour order ${orderId} has been received.\n\nPayment method: ${paymentMethod}${discountCents ? ` (15% crypto discount -$${disc} applied)` : ''}\nSubtotal: $${sub}\nTotal: $${tot}\n\nItems:\n${itemList}\n\nNext: The shop confirms availability and ships to your pickup FFL. For firearms, you complete ATF Form 4473 and the NICS check at the dealer.\n\nThanks,\n${brand}`,
    html: `<p>Hi ${name},</p><p>Your order <strong>${orderId}</strong> has been received.</p><p>Payment method: <strong>${paymentMethod}</strong>${discountCents ? ` (15% crypto discount -$${disc} applied)` : ''}<br>Subtotal: $${sub}<br>Total: <strong>$${tot}</strong></p><p>Items:</p><pre>${itemList}</pre><p>Next: The shop confirms availability and ships to your pickup FFL. For firearms, you complete ATF Form 4473 and the NICS check at the dealer.</p><p>Thanks,<br>${brand}</p>`
  };
}

function contactReceivedEmail({ name }) {
  const brand = config.business?.tradingName || '9mmreloaders';
  return {
    subject: `${brand} - Message received`,
    text: `Hi ${name},\n\nYour message has been received. A person will reply to your email address.\n\nThanks,\n${brand}`,
    html: `<p>Hi ${name},</p><p>Your message has been received. A person will reply to your email address.</p><p>Thanks,<br>${brand}</p>`
  };
}

function notifyShopNewSubmission({ kind, id, name, email, paymentMethod, state, phone }) {
  const brand = config.business?.tradingName || '9mmreloaders';
  return {
    subject: `${brand} - New ${kind} #${id} from ${name}`,
    text: `New ${kind} submission #${id}\nName: ${name}\nEmail: ${email}\nState: ${state || 'n/a'}\nPhone: ${phone || 'n/a'}\nPayment: ${paymentMethod || 'n/a'}\n\nCheck data/app.db or admin panel.`,
    html: `<p>New ${kind} <strong>#${id}</strong></p><p>Name: ${name}<br>Email: ${email}<br>State: ${state || 'n/a'}<br>Phone: ${phone || 'n/a'}<br>Payment: ${paymentMethod || 'n/a'}</p><p>Check data/app.db or admin panel.</p>`
  };
}

module.exports = { sendEmail, orderReceivedEmail, contactReceivedEmail, notifyShopNewSubmission };
