// Makes hand/gifs/<figure>.gif from the page's animated figures, for sharing in chats.
// Run from the repo root with a static server on port 8080 (python3 -m http.server 8080):
//   node hand/tools/make-gifs.mjs            needs ffmpeg; rerun after changing a figure in hand/app.js
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = new URL('../gifs/', import.meta.url).pathname;
const FPS = 12, WIDTH = 560;
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const page = await (await b.newContext({ viewport: { width: WIDTH + 40, height: 900 }, reducedMotion: 'reduce' })).newPage();
await page.goto(`http://localhost:${process.env.PORT || 8080}/hand/`);
const names = await page.$$eval('[data-fig]', els => els.map(e => e.dataset.fig));
for (const name of names) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handgif-'));
  const dur = await page.evaluate(n => window.handFigs.FIGS[n].dur, name);
  await page.evaluate(w => { document.body.innerHTML = `<div id="g" style="width:${w}px;padding:8px;background:#fff"></div>`; }, WIDTH);
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(({ name, s }) => { document.getElementById('g').innerHTML = window.handFigs.FIGS[name](s); document.querySelector('#g svg').style.width = '100%'; }, { name, s: i / FPS });
    await (await page.$('#g')).screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.png`) });
  }
  const gif = path.join(OUT, `${name}.gif`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.png'),
    '-vf', 'split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', gif]);
  fs.rmSync(tmp, { recursive: true });
  console.log(`${name}.gif  ${(fs.statSync(gif).size / 1024).toFixed(0)} KB`);
}
await b.close();
