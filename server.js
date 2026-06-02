const http = require('http');
const fs = require('fs');
const path = require('path');

// Tiny .env loader (no dependency)
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (e) {
    console.warn('Could not load .env file:', e.message);
  }
})();

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.warn('nodemailer is not installed. Run "npm install" to enable email forms.');
}

const BASE_PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const SMTP_USER = process.env.SMTP_USER || 'sibeve.sales@gmail.com';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_TO = process.env.MAIL_TO || 'sibeve.sales@gmail.com';
const MAIL_FROM = process.env.MAIL_FROM || `Sibeve Group <${SMTP_USER}>`;

let transporter = null;
function getTransporter() {
  if (!nodemailer || !SMTP_PASS) return null;
  if (!transporter) {
    const insecureTls = String(process.env.SMTP_INSECURE_TLS || '').toLowerCase() === 'true';
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: insecureTls ? { rejectUnauthorized: false } : undefined
    });
  }
  return transporter;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([.][.][/\\])+/, '');
  return path.join(ROOT, normalized);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    const MAX = 15 * 1024 * 1024; // 15 MB (allows ~10 MB file + base64 overhead)
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (err) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
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

async function handleSend(kind, req, res) {
  try {
    const t = getTransporter();
    if (!t) {
      sendJson(res, 500, { ok: false, error: 'Email service is not configured. Please set SMTP_PASS in .env and run "npm install".' });
      return;
    }
    const data = await readJsonBody(req);
    const errors = {};
    if (!isValidEmail(data.email)) errors.email = 'Valid email is required';
    if (kind !== 'newsletter' && !String(data.name || '').trim()) errors.name = 'Name is required';
    if (kind === 'contact' && !String(data.message || '').trim()) errors.message = 'Message is required';
    if (kind === 'quote' && !String(data.service || '').trim()) errors.service = 'Service is required';
    if (kind === 'quote' && !String(data.description || '').trim()) errors.description = 'Description is required';
    if (Object.keys(errors).length) {
      sendJson(res, 400, { ok: false, errors });
      return;
    }
    const { admin, reply } = kind === 'contact' ? buildContactEmails(data)
      : kind === 'quote' ? buildQuoteEmails(data)
      : buildNewsletterEmails(data);
    console.log(`[${kind}] from=${data.email} fileField=${data.file ? 'present' : 'missing'} fileName=${data.fileName || '(none)'} fileLen=${data.file ? data.file.length : 0} attachments=${(admin.attachments || []).length}`);
    await t.sendMail(admin);
    try { await t.sendMail(reply); } catch (e) { console.warn('Auto-reply failed:', e.message); }
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('Send error:', err);
    sendJson(res, 500, { ok: false, error: err.message || 'Failed to send email' });
  }
}

const server = http.createServer((req, res) => {
  // CORS headers (helpful if site is opened from file:// or different origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = (req.url || '/').split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/contact') {
    handleSend('contact', req, res);
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/quote') {
    handleSend('quote', req, res);
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/newsletter') {
    handleSend('newsletter', req, res);
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/weekly-posts') {
    const postsDir = path.join(ROOT, 'assets', 'images', 'Weekly Posts');
    fs.readdir(postsDir, (err, files) => {
      if (err) { sendJson(res, 500, { ok: false, error: 'Cannot read Weekly Posts folder' }); return; }
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const months = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11, debember:11, frebruary:1 };
      const posts = files
        .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
        .map(f => {
          const name = path.parse(f).name;
          const parts = name.split(/\s+/);
          let ts = 0;
          if (parts.length >= 3) {
            const day = parseInt(parts[0], 10);
            const mon = (parts[1] || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && months[mon] !== undefined && !isNaN(year)) {
              ts = new Date(year, months[mon], day).getTime();
            }
          }
          const encoded = encodeURIComponent(f).replace(/%20/g, '%20');
          return { date: name, image: 'assets/images/Weekly%20Posts/' + encoded, ts };
        })
        .sort((a, b) => b.ts - a.ts);
      sendJson(res, 200, { ok: true, posts });
    });
    return;
  }

  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = safeResolve(reqPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

let currentPort = BASE_PORT;

server.on('listening', () => {
  console.log(`Static site running at http://localhost:${currentPort}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    currentPort += 1;
    console.warn(`Port in use. Trying http://localhost:${currentPort} ...`);
    server.listen(currentPort);
    return;
  }
  throw error;
});

server.listen(currentPort);
