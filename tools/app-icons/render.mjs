// App icon set: one hand-drawn SVG per app in icons/<id>.svg, grouped in families (apps.json). Renders them with
// headless Chromium (same output on any machine: shapes only, no fonts) and checks them first.
//   node tools/app-icons/render.mjs --out <dir> [--only id,id]   writes <dir>/<id>/ icon.svg (also the SVG favicon),
//        icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180, opaque), favicon-32.png
//   node tools/app-icons/render.mjs --sheet <file.png>            every icon on one sheet: rounded, maskable (cropped
//        to the circle, safe-zone ring dashed) and at 32 px
//   node tools/app-icons/render.mjs                               checks only
// Checks: each icon starts with its family's container, uses only its family's colours, has no text, gradients or
// filters, and keeps the maskable art inside the safe zone (pixels outside the central 80% circle are background).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const { families, apps } = JSON.parse(fs.readFileSync(path.join(DIR, 'apps.json'), 'utf8'));
const MASK_SCALE = 0.84; // maskable art shrinks to this, so a 512 icon's glyph box (96-416) stays inside the safe circle

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const out = opt('--out'), sheet = opt('--sheet'), only = opt('--only')?.split(',');
const list = only ? apps.filter(a => only.includes(a.id)) : apps;
if (only && list.length !== only.length) throw new Error(`unknown app in --only: ${only.filter(id => !apps.some(a => a.id === id))}`);

const errors = [];
const icons = {};
for (const app of apps) {
  const file = path.join(DIR, 'icons', `${app.id}.svg`);
  const fam = families[app.family];
  if (!fam) { errors.push(`${app.id}: no family '${app.family}'`); continue; }
  if (!fs.existsSync(file)) { errors.push(`${app.id}: no icons/${app.id}.svg`); continue; }
  const svg = fs.readFileSync(file, 'utf8');
  const container = `<rect width="512" height="512" rx="112" fill="${fam.bg}"/>`;
  if (!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">') || !svg.includes(container))
    errors.push(`${app.id}: should be a 512 viewBox starting with the ${fam.name} container ${container}`);
  for (const c of svg.match(/#[0-9a-f]{3,6}\b/gi) || [])
    if (!fam.colours.includes(c.toLowerCase())) errors.push(`${app.id}: colour ${c} is not in the ${fam.name} family`);
  if (/<(text|image|linearGradient|radialGradient|filter|style|foreignObject)\b|opacity=|font/i.test(svg))
    errors.push(`${app.id}: no text, images, gradients, filters, styles or opacity in icons`);
  icons[app.id] = svg;
}
for (const f of fs.readdirSync(path.join(DIR, 'icons')))
  if (!apps.some(a => `${a.id}.svg` === f)) errors.push(`icons/${f}: not listed in apps.json`);

// variants of one source SVG: square container (iOS and Android crop it themselves), maskable art scaled down
const square = svg => svg.replace(/rx="112"/, 'rx="0"');
const maskable = svg => {
  const m = svg.match(/^(<svg[^>]*>\s*<rect width="512" height="512" rx="112" fill="[^"]+"\/>)([\s\S]*)(<\/svg>\s*)$/);
  const off = 256 * (1 - MASK_SCALE);
  return square(m[1]) + `<g transform="translate(${off} ${off}) scale(${MASK_SCALE})">${m[2]}</g>` + m[3];
};
const dataUrl = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

async function chromium() {
  let pw;
  try { pw = await import('playwright'); } catch {
    const root = process.env.PLAYWRIGHT_PATH || path.join(execSync('npm root -g').toString().trim(), 'playwright', 'index.mjs');
    pw = await import(root);
  }
  return (pw.chromium || pw.default.chromium).launch();
}

if (!errors.length) {
  const browser = await chromium();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // safe zone: draw each maskable icon on a canvas and look for glyph pixels outside the 80% circle
  await page.setContent('<canvas width="512" height="512"></canvas>');
  for (const app of apps) {
    const bad = await page.evaluate(async ([url, bg]) => {
      const img = new Image(); img.src = url; await img.decode();
      const ctx = document.querySelector('canvas').getContext('2d');
      ctx.clearRect(0, 0, 512, 512); ctx.drawImage(img, 0, 0, 512, 512);
      const px = ctx.getImageData(0, 0, 512, 512).data;
      const want = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
      let n = 0;
      for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
        if ((x + 0.5 - 256) ** 2 + (y + 0.5 - 256) ** 2 <= 204.8 ** 2) continue;
        const i = (y * 512 + x) * 4;
        if (want.some((v, k) => Math.abs(px[i + k] - v) > 6)) n++;
      }
      return n;
    }, [dataUrl(maskable(icons[app.id])), families[app.family].bg]);
    if (bad) errors.push(`${app.id}: ${bad} maskable pixels outside the safe zone (keep the glyph inside 96-416)`);
  }

  if (!errors.length && out) {
    for (const app of list) {
      const dir = path.join(out, app.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'icon.svg'), icons[app.id]);
      for (const [name, size, svg, transparent] of [
        ['icon-192.png', 192, icons[app.id], true],
        ['icon-512.png', 512, icons[app.id], true],
        ['icon-maskable-512.png', 512, maskable(icons[app.id]), false],
        ['apple-touch-icon.png', 180, square(icons[app.id]), false],
        ['favicon-32.png', 32, icons[app.id], true],
      ]) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${dataUrl(svg)}">`);
        await page.locator('img').evaluate(img => img.decode());
        await page.screenshot({ path: path.join(dir, name), omitBackground: transparent });
      }
    }
    console.log(`render: wrote ${list.length} app(s) to ${out}`);
  }

  if (!errors.length && sheet) {
    const cell = app => `<figure>
      <img src="${dataUrl(icons[app.id])}" width="128" height="128">
      <span class="mask"><img src="${dataUrl(maskable(icons[app.id]))}" width="128" height="128"><i></i></span>
      <img src="${dataUrl(icons[app.id])}" width="32" height="32" class="small">
      <figcaption>${app.name}<small>${app.repo}</small></figcaption></figure>`;
    const html = `<style>
      body{margin:0;padding:24px 28px;background:#f2f2f4;font:15px/1.3 system-ui,sans-serif;color:#222;width:1144px}
      h2{font-size:18px;margin:18px 0 10px} section{display:flex;flex-wrap:wrap;gap:14px}
      figure{margin:0;background:#fff;border-radius:14px;padding:12px;display:grid;grid-template-columns:128px 128px 32px;
        gap:10px;align-items:end;width:330px}
      figcaption{grid-column:1/-1;font-weight:600} small{display:block;font-weight:400;color:#666;font-size:12px}
      .mask{position:relative;width:128px;height:128px}
      .mask img{border-radius:50%;display:block}
      .mask i{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 1px #0003}
      .mask i::after{content:'';position:absolute;inset:12.8px;border-radius:50%;border:1.5px dashed #ff3b30cc}
      .small{align-self:center}
    </style>
    <p>Each app: home-screen icon, maskable (Android crops to any shape; red ring = safe zone), favicon at 32 px.</p>
    ${Object.entries(families).map(([key, fam]) => `<h2>${fam.name}</h2><section>${apps.filter(a => a.family === key).map(cell).join('')}</section>`).join('')}`;
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.setContent(html);
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    await page.screenshot({ path: sheet, fullPage: true });
    console.log(`render: sheet of ${apps.length} icons in ${sheet}`);
  }
  await browser.close();
}

if (errors.length) {
  console.error(`app-icons: ${errors.length} problem(s)\n- ` + errors.join('\n- '));
  process.exit(1);
}
if (!out && !sheet) console.log(`app-icons: ok (${apps.length} icons)`);
