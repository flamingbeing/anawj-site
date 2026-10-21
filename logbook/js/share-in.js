// Shared to the installed app (Android share sheet → Logbook; manifest share_target). Two ways in:
//   - the old GET: ?share_title=…&share_text=…&share_url=… (app.js reads it)
//   - POST (multipart, text and .md / .txt files): sw.js receives it, keeps it in Cache Storage (SHARE_CACHE) and opens
//     ./?shared=1#log; readInbox() here picks it up once.
// Either way the text waits in sessionStorage (SHARED_KEY) until the Add tab (paste-a-list) or the chooser
// (#share, ui-share-in.js) takes it. The pure parts are tested in test/share-in.test.mjs.

export const SHARED_KEY = 'logbook-shared';
export const SHARED_FILES_KEY = 'logbook-shared-files';   // how many files came with it (files always ask)
// keep in step with sw.js
export const SHARE_CACHE = 'share-inbox-logbook';
export const SHARE_FILE = 'share-inbox.json';
const MAX_TEXT = 100000;

// a file the app can read as text: .md, .markdown, .txt, or any text/* type
export const isTextFile = (name, type) => /^text\//i.test(type || '') || /markdown/i.test(type || '') || /\.(md|markdown|txt)$/i.test(name || '');

// one block of text from what was shared: the title (unless the text already starts with it), the text, the link,
// then each file's text (a file's name on its own line first when more than one file came)
export function sharedText({ title = '', text = '', url = '', files = [] } = {}) {
  const t = String(title || '').trim(), x = String(text || '').trim(), u = String(url || '').trim();
  const parts = [t && !x.startsWith(t) ? t : '', x, u && !x.includes(u) ? u : ''].filter(Boolean);
  const fs = (files || []).filter(f => f && isTextFile(f.name, f.type) && String(f.text || '').trim());
  for (const f of fs) parts.push((fs.length > 1 && f.name ? f.name + '\n' : '') + String(f.text).replace(/\r\n?/g, '\n').trim());
  return parts.join('\n\n').slice(0, MAX_TEXT);
}

// the old GET share: the text and the address without its share_* parameters
export function fromQuery(search) {
  const q = new URLSearchParams(search || '');
  const has = ['share_title', 'share_text', 'share_url'].some(k => q.has(k));
  const text = has ? [q.get('share_title'), q.get('share_text'), q.get('share_url')].filter(Boolean).join('\n').trim() : '';
  for (const k of ['share_title', 'share_text', 'share_url', 'shared']) q.delete(k);
  return { has, text, rest: q.toString().replace(/=(&|$)/g, '$1') };
}

// set once the chooser has been shown: leaving it for the Add tab then means "as cases" (never sent back to it)
export const shareState = { seen: false };

// ---- waiting in this tab (sessionStorage survives a same-tab sign-in) ----
const ss = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };
export function keepShared(text, files = 0) {
  const s = ss();
  if (!s || !String(text || '').trim()) return;
  shareState.seen = false;   // a new share asks again
  try { s.setItem(SHARED_KEY, String(text)); if (files) s.setItem(SHARED_FILES_KEY, String(files)); else s.removeItem(SHARED_FILES_KEY); } catch { /* storage full or blocked */ }
}
export function peekShared() { try { return ss()?.getItem(SHARED_KEY) || ''; } catch { return ''; } }
export function sharedFiles() { try { return Number(ss()?.getItem(SHARED_FILES_KEY)) || 0; } catch { return 0; } }
export function popShared() {
  const text = peekShared();
  try { ss()?.removeItem(SHARED_KEY); ss()?.removeItem(SHARED_FILES_KEY); } catch { /* ignore */ }
  return text;
}

// the service worker's copy of a POST share: read once, then deleted (resolves to the text kept, or '')
export async function readInbox(scope) {
  if (typeof caches === 'undefined') return '';
  try {
    const cache = await caches.open(SHARE_CACHE), key = new URL(SHARE_FILE, scope).href;
    const res = await cache.match(key);
    if (!res) return '';
    await cache.delete(key);
    const data = await res.json();
    const text = sharedText(data);
    keepShared(text, (data.files || []).length);
    return text;
  } catch (err) { console.warn('Shared item not read', err); return ''; }
}
