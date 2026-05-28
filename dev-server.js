const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';

  // Mirror Netlify rewrite: /event/:id  →  /event.html?id=:id
  const eventMatch = url.match(/^\/event\/([A-Za-z0-9_-]+)\/?$/);
  if (eventMatch) {
    const id = eventMatch[1];
    const target = '/event.html?id=' + encodeURIComponent(id) + (qs ? '&' + qs : '');
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  // Try the exact file first
  let filePath = path.join(ROOT, url);

  // If it's a directory, try index.html
  if (url === '/' || url === '') {
    filePath = path.join(ROOT, 'index.html');
  }
  // If no extension, try appending .html (clean URL support)
  else if (!path.extname(url)) {
    filePath = path.join(ROOT, url + '.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
  });
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
