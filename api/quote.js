import nodemailer from 'nodemailer';

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

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  try {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch (e) {
    return null;
  }
}

function buildQuoteEmails(data) {
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim();
  const phone = String(data.phone || '').trim();
  const service = String(data.service || '').trim();
  const description = String(data.description || '').trim();
  const fileName = String(data.fileName || '').trim();
  const parsed = parseDataUrl(data.file);
  const attachments = parsed && fileName ? [{ filename: fileName, content: parsed.buffer, contentType: parsed.mime }] : [];
  const adminHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">New Quote Request</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ''}
      <p><strong>Service:</strong> ${escapeHtml(service)}</p>
      <p><strong>Description:</strong></p>
      <p style="white-space:pre-wrap;background:#f7f7f7;padding:1rem;border-radius:8px;">${escapeHtml(description)}</p>
      ${attachments.length ? `<p><strong>Attachment:</strong> ${escapeHtml(fileName)} (${Math.round(parsed.buffer.length / 1024)} KB)</p>` : ''}
      <hr style="margin:1.5rem 0;border:none;border-top:1px solid #ededee;" />
      <p style="font-size:0.8rem;color:#6f7072;">Sent from sibevegroup.com quote form</p>
    </div>`;
  const replyHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#252627;">
      <h2 style="color:#1e8f45;margin:0 0 1rem;">Thanks for your quote request, ${escapeHtml(name)}!</h2>
      <p>We've received your request for <strong>${escapeHtml(service)}</strong> and will review it shortly. You can expect a customized quote within 24 hours.</p>
      <p style="background:#f7f7f7;padding:1rem;border-radius:8px;white-space:pre-wrap;"><strong>Your request:</strong><br/>${escapeHtml(description)}</p>
      <p>If you'd like to chat directly, message us on WhatsApp at +268 7654 9020.</p>
      <p style="margin-top:1.5rem;">Warm regards,<br/><strong>Sibeve Group</strong><br/>Promotional &amp; Branding Solutions</p>
    </div>`;
  return {
    admin: {
      from: MAIL_FROM,
      to: MAIL_TO,
      replyTo: email,
      subject: `[Quote] ${service || 'Request'} — ${name}`,
      html: adminHtml,
      text: `New quote request\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\n\n${description}${attachments.length ? `\n\nAttachment: ${fileName}` : ''}`,
      attachments
    },
    reply: {
      from: MAIL_FROM,
      to: email,
      subject: 'We received your quote request — Sibeve Group',
      html: replyHtml,
      text: `Hi ${name},\n\nThanks for your quote request for ${service}. We will get back to you within 24 hours with a customized quote.\n\nYour request:\n${description}${attachments.length ? `\n\nAttached: ${fileName}` : ''}\n\nWarm regards,\nSibeve Group`,
      attachments
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
    if (!String(data.service || '').trim()) errors.service = 'Service is required';
    if (!String(data.description || '').trim()) errors.description = 'Description is required';

    if (Object.keys(errors).length) {
      res.status(400).json({ ok: false, errors });
      return;
    }

    const { admin, reply } = buildQuoteEmails(data);
    console.log(`[quote] from=${data.email} fileField=${data.file ? 'present' : 'missing'} fileName=${data.fileName || '(none)'} fileLen=${data.file ? data.file.length : 0} attachments=${(admin.attachments || []).length}`);
    await transporter.sendMail(admin);
    try { await transporter.sendMail(reply); } catch (e) { console.warn('Auto-reply failed:', e.message); }
    
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to send email' });
  }
}
