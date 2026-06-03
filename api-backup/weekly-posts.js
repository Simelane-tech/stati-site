const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const postsDir = path.join(process.cwd(), 'assets', 'images', 'Weekly Posts');
    const files = fs.readdirSync(postsDir);
    
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
    
    res.status(200).json({ ok: true, posts });
  } catch (err) {
    console.error('Error reading weekly posts:', err);
    res.status(500).json({ ok: false, error: 'Cannot read Weekly Posts folder' });
  }
}
