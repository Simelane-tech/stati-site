const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER || 'sibeve.sales@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_TO = process.env.MAIL_TO || 'sibeve.sales@gmail.com';
const MAIL_FROM = process.env.MAIL_FROM || `Sibeve Group <${SMTP_USER}>`;

function getTransporter() {
  if (!SMTP_PASS) return null;
  const insecureTls = String(process.env.SMTP_INSECURE_TLS || '').toLowerCase() === 'true';
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: insecureTls ? { rejectUnauthorized: false } : undefined
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildNewsletterEmails(data) {
  const email = String(data.email || '').trim();
  const adminHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">New Newsletter Subscription</h2>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p style="font-size:0.8rem;color:#6f7072;">Sent from sibevepromo.com newsletter form</p>
    </div>`;
  const replyHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">Welcome to the Sibeve Group newsletter!</h2>
      <p>Thanks for subscribing. You'll now receive occasional updates on branding tips, new services, and special offers.</p>
      <p>If you didn't sign up, you can ignore this email.</p>
      <p style="margin-top:1.5rem;">Warm regards,<br/><strong>Sibeve Group</strong></p>
    </div>`;
  return {
    admin: {
      from: MAIL_FROM,
      to: MAIL_TO,
      replyTo: email,
      subject: `[Newsletter] New subscriber: ${email}`,
      html: adminHtml,
      text: `New newsletter subscription\nEmail: ${email}`
    },
    reply: {
      from: MAIL_FROM,
      to: email,
      subject: 'Welcome to the Sibeve Group newsletter',
      html: replyHtml,
      text: `Thanks for subscribing to the Sibeve Group newsletter. You'll receive occasional updates on branding tips, new services, and special offers.\n\nWarm regards,\nSibeve Group`
    }
  };
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const transporter = getTransporter();
    if (!transporter) {
      res.status(500).json({ ok: false, error: 'Email service is not configured. Please set SMTP_PASS in environment variables.' });
      return;
    }

    const data = req.body;
    const errors = {};
    if (!isValidEmail(data.email)) errors.email = 'Valid email is required';

    if (Object.keys(errors).length) {
      res.status(400).json({ ok: false, errors });
      return;
    }

    const { admin, reply } = buildNewsletterEmails(data);
    await transporter.sendMail(admin);
    try { await transporter.sendMail(reply); } catch (e) { console.warn('Auto-reply failed:', e.message); }
    
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to send email' });
  }
}
