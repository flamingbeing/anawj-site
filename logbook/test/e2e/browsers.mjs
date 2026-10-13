// Fake data only. Shared bits that keep the browser tests portable across Playwright's engines: BROWSER=firefox or
// webkit runs a test in that engine (when Playwright has it installed), chromium by default.
// - clipboard permissions exist only in Chromium; elsewhere the clipboard is stood in for by a page-local one
//   (navigator.clipboard.writeText/readText), so copy-then-read checks still work
// - text read back (clipboard, zip name lists) has its line ends normalised (CRLF on some platforms)
const PW = process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs';

export const engine = process.env.BROWSER || 'chromium';
export const isChromium = engine === 'chromium';

// the engine's launcher, or null when Playwright doesn't have it here (callers skip with a note)
export async function launch() {
  const pw = await import(PW);
  try {
    return await pw[engine].launch(isChromium && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
  } catch (e) {
    if (isChromium) throw e;
    return null;
  }
}

// context options with clipboard access where the engine has it
export const clipboardOpts = () => (isChromium ? { permissions: ['clipboard-read', 'clipboard-write'] } : {});

// call once per context, before the page loads: outside Chromium, a page-local clipboard
export async function portableClipboard(ctx) {
  if (isChromium) return;
  await ctx.addInitScript(() => {
    let text = '';
    const c = navigator.clipboard;
    if (!c) return;
    try {
      Object.defineProperty(c, 'writeText', { configurable: true, value: async v => { text = String(v); } });
      Object.defineProperty(c, 'readText', { configurable: true, value: async () => text });
    } catch { /* read-only here: the test's clipboard checks will say so */ }
  });
}

// CRLF / CR → LF
export const lf = s => String(s ?? '').replace(/\r\n?/g, '\n');
export const readClipboard = async p => lf(await p.evaluate(() => navigator.clipboard.readText()));

// touch phone options (isMobile is Chromium/WebKit only)
export const phoneOpts = () => ({ hasTouch: true, ...(engine === 'firefox' ? {} : { isMobile: true }) });

// console errors from other engines' own noise (Firefox reports the Firebase SDK's blocked preload in demo mode)
export const ignorable = text => !isChromium && /gstatic\.com\/firebasejs/.test(text);

// Poll a check in the page until it's truthy (and return its value). For async checks: page.waitForFunction treats
// the promise an async function returns as truthy and resolves at once, without waiting.
export async function until(p, fn, arg, { timeout = 6000, every = 100, msg = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await p.evaluate(fn, arg);
    if (v) return v;
    if (Date.now() > end) throw new Error('Timed out waiting for ' + msg);
    await new Promise(r => setTimeout(r, every));
  }
}
