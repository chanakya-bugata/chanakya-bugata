// Usage: node render.mjs --stills 1,4,8   (writes out/still_*.jpg)
//        node render.mjs                    (renders out/reel.mp4 + out/reel.webp)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'out'); fs.mkdirSync(out, { recursive: true });
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FPS = 30, T = 28;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(0);
await new Promise(r => server.once('listening', r));
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('requestfailed', r => console.log('[reqfail]', r.url())); page.on('response', r => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); }); page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction('window.ready === true', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);

const stillsArg = process.argv.indexOf('--stills');
if (stillsArg > 0) {
  for (const s of process.argv[stillsArg + 1].split(',').map(Number)) {
    await page.evaluate(t => window.frame(t), s);
    await page.screenshot({ path: path.join(out, `still_${String(s).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
    console.log('still', s);
  }
} else {
  const mp4 = path.join(out, 'reel.mp4');
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = T * FPS, t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate(t => window.frame(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 30 === 0) console.log(`frame ${i}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end(); await new Promise(r => ff.once('close', r));
  console.log('mp4 done');
}
await browser.close(); server.close();
