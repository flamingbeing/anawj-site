// Makes hand-babies/gifs/<figure>.gif from the page's animated figures, for sharing in chats.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080):
//   node hand-babies/tools/make-gifs.mjs            needs ffmpeg; rerun after changing a figure in hand-babies/app.js or hand3d.js
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../gifs/', import.meta.url).pathname;
const FPS = 12, WIDTH = 560, WIDTH_3D = 420;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const page = await (await b.newContext({ viewport: { width: WIDTH + 40, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage();
await page.addInitScript(() => { window.HAND_GIF = true; });
await page.goto(`http://localhost:${process.env.PORT || 8080}/hand-babies/`);
await page.waitForFunction(() => [...document.querySelectorAll('[data-fig]')].every(e => e.querySelector('.fig-art svg, .fig-art canvas')));
const names = await page.$$eval('[data-fig]', els => els.map(e => e.dataset.fig));
for (const name of names) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handgif-'));
  const el = await page.$(`[data-fig="${name}"] .fig-art`);
  await el.scrollIntoViewIfNeeded();
  const dur = await page.evaluate(n => window.handFigs.renderAt(n, 0), name);
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(({ name, s }) => window.handFigs.renderAt(name, s), { name, s: i / FPS });
    await el.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.png`) });
  }
  const gif = path.join(OUT, `${name}.gif`), is3d = await el.$('canvas');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'),
    '-vf', `scale=${is3d ? WIDTH_3D : WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${is3d ? 80 : 96}:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`, '-loop', '0', gif]);
  fs.rmSync(tmp, { recursive: true });
  console.log(`${name}.gif  ${(fs.statSync(gif).size / 1024).toFixed(0)} KB`);
}
await b.close();
