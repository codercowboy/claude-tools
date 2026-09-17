#!/usr/bin/env node
/*
 * Tiny dependency-free static file server for a directory of tools.
 *
 * Serves a directory over http:// (handy for behavior that differs from file://,
 * e.g. some fetch/permissions). The directory is the first CLI argument, resolved
 * against the current working directory; with no argument it serves the cwd.
 *
 *   node scripts/serve.mjs src/tools   # from the repo root: the whole tools gallery
 *   npm run serve                      # inside a tool folder: just that tool (cwd)
 *
 * Port: $PORT or 8080.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep, resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
    const filePath = normalize(join(root, urlPath));
    // Prevent path traversal outside the served directory.
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const s = await stat(filePath).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(port, () => {
  console.log(`Serving ${root}\n  → http://localhost:${port}/   (Ctrl+C to stop)`);
});
