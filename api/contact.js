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

function buildContactEmails(data) {
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const subject = String(data.subject || 'New Contact Enquiry').trim();
  const message = String(data.message || '').trim();
  const adminHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">New Contact Enquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap;background:#f7f7f7;padding:1rem;border-radius:8px;">${escapeHtml(message)}</p>
      <hr style="margin:1.5rem 0;border:none;border-top:1px solid #ededee;" />
      <p style="font-size:0.8rem;color:#6f7072;">Sent from sibevegroup.com contact form</p>
    </div>`;
  const replyHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">Thanks for reaching out, ${escapeHtml(name)}!</h2>
      <p>We've received your message and our team will get back to you within 24 hours.</p>
      <p style="background:#f7f7f7;padding:1rem;border-radius:8px;white-space:pre-wrap;"><strong>Your message:</strong><br/>${escapeHtml(message)}</p>
      <p>If your enquiry is urgent, you can also reach us via WhatsApp at +268 7654 9020.</p>
      <p style="margin-top:1.5rem;">Warm regards,<br/><strong>Sibeve Group</strong><br/>Promotional &amp; Branding Solutions</p>
    </div>`;
  return {
    admin: {
      from: MAIL_FROM,
      to: MAIL_TO,
      replyTo: email,
      subject: `[Contact] ${subject} — ${name}`,
      html: adminHtml,
      text: `New contact enquiry\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nSubject: ${subject}\n\n${message}`
    },
    reply: {
      from: MAIL_FROM,
      to: email,
      subject: 'We received your message — Sibeve Group',
      html: replyHtml,
      text: `Hi ${name},\n\nThanks for reaching out. We have received your message and will get back to you within 24 hours.\n\nYour message:\n${message}\n\nWarm regards,\nSibeve Group`
    }
  };
}

export default async function handler(req, res) {
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
    if (!String(data.name || '').trim()) errors.name = 'Name is required';
    if (!String(data.message || '').trim()) errors.message = 'Message is required';

    if (Object.keys(errors).length) {
      res.status(400).json({ ok: false, errors });
      return;
    }

    const { admin, reply } = buildContactEmails(data);
    await transporter.sendMail(admin);
    try { await transporter.sendMail(reply); } catch (e) { console.warn('Auto-reply failed:', e.message); }
    
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to send email' });
  }
}
