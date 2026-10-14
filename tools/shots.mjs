// Before-and-after phone screenshots for a PR (.github/workflows/pr-screenshots.yml), or by hand.
//   node tools/shots.mjs pages <base-ref> [pr-body-file]   which pages to show: one per app the PR changes, plus any
//                                                          "Screens: /logbook/?demo#notes, …" line in the PR body
//   node tools/shots.mjs shoot <url> <out-dir> <name> <path>…   390 × 844 screenshots of <url><path> as <name>-<i>.jpg
// Pages are served from a checkout (python3 -m http.server), so apps open in their demo with fake data.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// the page to show for changes in each folder (apps open in their demo: fake data only)
export const PAGES = {
  'logbook/': '/logbook/?demo', 'evals/': '/evals/?demo', 'nuh-roster/': '/nuh-roster/?demo', 'prewarm/': '/prewarm/?demo',
  'hand-babies/': '/hand-babies/', 'bis-dsa/': '/bis-dsa/', 'hand-log/': '/hand-log/', 'cmcj/': '/cmcj/', 'privacy/': '/privacy/',
  'edit/': '/edit/?page=/privacy/', 'nuhsdesign/': '/logbook/?demo', 'index.html': '/',
};
const MAX = 6;

export function pagesFor(files, body = '') {
  const out = [];
  for (const f of files) {
    const key = Object.keys(PAGES).find(k => k.endsWith('/') ? f.startsWith(k) : f === k);
    if (key && !out.includes(PAGES[key])) out.push(PAGES[key]);
  }
  // "Screens: /a/?demo#x, /b/" lines in the PR description add pages (only paths on this site)
  for (const m of String(body).matchAll(/^\s*Screens:\s*(.+)$/gim))
    for (const p of m[1].split(/[,\s]+/).map(s => s.replace(/^`|`$/g, '')).filter(s => /^\/[\w\-./?=&#%]*$/.test(s)))
      if (!out.includes(p)) out.push(p);
  return out.slice(0, MAX);
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'pages') {
  const [base, bodyFile] = args;
  const files = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const body = bodyFile && fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf8') : '';
  console.log(JSON.stringify(pagesFor(files, body)));
} else if (mode === 'shoot') {
  const [url, dir, name, ...paths] = args;
  const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');
  fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const results = [];
  for (const [i, p] of paths.entries()) {
    const page = await ctx.newPage();
    let status = 0;
    try {
      const res = await page.goto(url + p, { waitUntil: 'load', timeout: 30000 });
      status = res ? res.status() : 0;
      await page.waitForTimeout(1500); // apps draw after load
      if (status === 200) await page.screenshot({ path: path.join(dir, `${name}-${i}.jpg`), type: 'jpeg', quality: 70 });
    } catch (e) { status = -1; }
    results.push({ path: p, status });
    await page.close();
  }
  await b.close();
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(results));
  console.log(`${name}: ${results.map(r => `${r.path} ${r.status}`).join(', ')}`);
} else if (mode === 'comment') {
  // the PR comment: before and after side by side for each page (unchanged ones listed, not shown)
  const [dir, imgBase, sha, preview] = args;
  const read = n => { try { return JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8')); } catch (e) { return []; } };
  const before = read('before'), after = read('after');
  const img = f => fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f)) : null;
  let out = `<!-- pr-screenshots -->\n### Phone screenshots (390 px): before → after\n\nCommit \`${sha.slice(0, 7)}\`, pages in demo mode (fake data). `
    + 'The pages come from the folders this PR changes; add others with a line like `Screens: /logbook/?demo#notes` in the PR description.'
    + (preview ? ' On the preview, the 💬 button comments on the change (Comment on PR).' : '') + '\n';
  const same = [];
  after.forEach((a, i) => {
    const b = before[i] || { status: 0 }, bi = img(`before-${i}.jpg`), ai = img(`after-${i}.jpg`);
    if (bi && ai && bi.equals(ai)) { same.push(a.path); return; }
    const cell = (ok, f, st) => ok ? `<img src="${imgBase}/${f}" width="260" alt="">` : st === 404 ? '(no such page)' : '(could not load)';
    const left = !bi && b.status === 404 && ai ? '(new page)' : cell(bi, `before-${i}.jpg`, b.status);
    const open = preview ? ` · [open on the preview](${preview}${a.path})` : '';
    out += `\n**\`${a.path}\`**${open}\n\n| Before (main) | After (this PR) |\n|---|---|\n| ${left} | ${cell(ai, `after-${i}.jpg`, a.status)} |\n`;
  });
  if (same.length) out += `\nNo visible change on the first screen of: ${same.map(p => '`' + p + '`').join(', ')}.\n`;
  if (!after.length) out += '\nNo pages to show for the files this PR changes.\n';
  console.log(out);
} else {
  console.error('usage: node tools/shots.mjs pages <base-ref> [body-file] | shoot <url> <out-dir> <name> <path>…');
  process.exit(2);
}
