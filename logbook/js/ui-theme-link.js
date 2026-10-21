// Theme links (theme-revamp S5; my-themes.js themeLink / themeFromLink): Share as a link on Themes, and the offer shown
// when the app opens from one. The offer shows the theme at once (display.js previewLook, nothing saved), with Use and
// Cancel; Use sets it on this device like any theme and keeps it in Your themes unless unticked. Loaded on first use.
import { h, toast, modal, hooks } from './ui-core.js';
import { display, setDisplay, applyDisplay, previewLook } from './display.js';
import { themeLink, themeFromLink, minePatch, saveMine, cleanMine } from './my-themes.js';

const base = () => location.origin + location.pathname;

// the QR code of a link (the shared generator in /feedback/, loaded on first use and kept for offline by sw.js)
function qrBox(link) {
  const box = h('div', { class: 'theme-qr', role: 'img', 'aria-label': 'QR code of the theme link' });
  import('../../feedback/qr.js').then(m => box.replaceChildren(m.qrSvg(link, 'QR code of the theme link')))
    .catch(() => { box.textContent = 'QR code unavailable offline: use Copy link.'; });
  return box;
}

// Share: the link and its QR code (to scan from the other phone), with Share (the phone's share sheet, so WhatsApp)
// where there is one, and Copy
export function shareThemeDialog(t) {
  const link = themeLink(base(), t);
  const box = h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Theme link', class: 'theme-link', onfocus: e => e.target.select() });
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied'); }
    catch { box.focus(); box.select(); toast('Select the link and copy it'); }
  };
  const share = navigator.share ? h('button', { type: 'button', class: 'primary', onclick: () => navigator.share({ title: `Logbook theme: ${t.name}`, text: `My logbook theme “${t.name}”: open the link and tap Use.`, url: link }).catch(() => {}) }, 'Share…') : null;
  const m = modal(`Share “${t.name}”`, [
    h('p', { class: 'hint', style: 'margin:0 0 8px' }, 'Only the look travels (colours, fonts, spacing and the like), never cases, names, a photo or your own font file.'),
    box,
    qrBox(link),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }), h('button', { type: 'button', onclick: () => m.close() }, 'Close'),
      h('button', { type: 'button', class: share ? '' : 'primary', onclick: copy }, 'Copy link'), share),
  ]);
}

// Opened from a link: the theme on screen now, Use or Cancel (Esc and the back button cancel too)
export function offerSharedTheme(hash) {
  let t;
  try { t = themeFromLink(hash); } catch (err) { toast(err.message); return; }
  if (!t) return;
  const before = display();
  previewLook({ ...before, ...minePatch(t, before) });
  let used = false;
  const keep = h('input', { type: 'checkbox', checked: true });
  const m = modal(`Theme: ${t.name}`, [
    h('p', { style: 'margin:0' }, 'Sent to you as a link. You’re seeing it now; nothing is changed until you tap Use.'),
    h('label', { class: 'check', style: 'margin-top:8px' }, keep, ' Also keep it in Your themes'),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { type: 'button', onclick: () => m.close() }, 'Cancel'),
      h('button', { type: 'button', class: 'primary', onclick: () => { used = true; m.close(); } }, 'Use')),
  ], { sticky: true, cls: 'theme-offer', onclose: ({ accountChanged } = {}) => {
    previewLook(null);
    if (!used || accountChanged) { applyDisplay(); return; }
    const now = display();
    let mine = null;
    if (keep.checked) { try { mine = saveMine(now.myThemes, t.name, minePatch(t, now), t.mode || null); } catch (err) { toast(err.message); } }
    applyDisplay(setDisplay({ ...minePatch(t, now), themeMode: null, ...(mine ? { myThemes: cleanMine(mine) } : {}) }));
    hooks.render?.();
    toast(`Theme: ${t.name}${mine ? ' (kept in Your themes)' : ''}`, { action: 'Undo', onaction: () => { applyDisplay(setDisplay(before)); hooks.render?.(); } });
  } });
}
