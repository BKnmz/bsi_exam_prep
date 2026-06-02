const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 12121;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url);
  
  // Guard against favicon
  if (urlPath === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/x-icon' });
    res.end();
    return;
  }

  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  
  const ext = path.extname(filePath);
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  if (ext === '.css') contentType = 'text/css';
  if (ext === '.pdf') contentType = 'application/pdf';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`==================================================`);
  console.log(`🚀 BSI PRUEFUNGSVORBEREITUNG LOKALER SERVER`);
  console.log(`==================================================`);
  console.log(`Server laeuft offline unter: http://localhost:${PORT}`);
  console.log(`Halte dieses Fenster offen, solange du die App nutzt.`);
  console.log(`Zum Beenden: Schliesse dieses Fenster oder druecke STRG+C.`);
  console.log(`==================================================`);
});
