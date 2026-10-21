// Custom CSS (Settings → Themes, advanced; per device). Styling can't run code, but it can leak what's on screen
// to another site (a url() that carries text from the page) and it can hide or fake things. So: anything that loads
// from elsewhere is refused (url(), @import, image-set(), @font-face, @namespace, old script hooks, and backslash
// escapes that could spell those), it is capped in size, it never applies on Themes or Layout (so a bad rule can
// always be fixed there), and ?nocss in the address turns it off for that visit. Pure; tested.

export const MAX_CSS = 10 * 1024;
const BLOCKED = [
  [/url\s*\(/i, 'url() (loading anything from another address)'],
  [/@import/i, '@import'],
  [/image-set\s*\(/i, 'image-set()'],
  [/@font-face/i, '@font-face (use Your own font file in Themes instead)'],
  [/@namespace/i, '@namespace'],
  [/expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding/i, 'script hooks'],
  [/\\/, 'backslash escapes'],
  [/<\/?\s*style|<!--|-->/i, 'HTML'],
];

// { ok, css, problems: [why] }. css is trimmed; refused CSS is never applied, nothing is silently rewritten.
export function checkCss(text) {
  const css = String(text || '').replace(/\r\n?/g, '\n').trim();
  const problems = [];
  if (css.length > MAX_CSS) problems.push(`over ${MAX_CSS / 1024} KB`);
  for (const [re, why] of BLOCKED) if (re.test(css)) problems.push(why);
  // braces must balance, or one rule could swallow the app's own styles after it
  let depth = 0;
  for (const ch of css.replace(/"[^"\n]*"|'[^'\n]*'/g, '')) { if (ch === '{') depth++; else if (ch === '}' && --depth < 0) break; }
  if (depth !== 0) problems.push('unbalanced { }');
  return { ok: !problems.length, css, problems };
}
