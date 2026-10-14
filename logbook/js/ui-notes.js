// Markdown export (More → Export / Import): a zip of Markdown notes, made on the phone with no server.
// Case notes (by month or day, each day with its notes), one note per reflection, Notes.md (undated notes),
// Progress.md, and the figures in images/ if wanted.
// The layout is the user's (Settings → Markdown, markdown.js); this file only gathers the data and zips it.

import { S, h, toast, modal, download, todayISO, cloud, rYear, myYearName } from './ui-core.js';
import { exportNotes } from './markdown.js';
import { mdFormat, mdCtx } from './share.js';
import { progress } from './engine.js';
import { reflectionProgress } from './reflections.js';
import { needZip } from './portfolio.js';
import { ensureNotes } from './ui-notepad.js';

const PRIVACY = 'These files hold your case details. Keep them private, and check hospital policy before putting them into cloud notes or AI tools.';

// The zip as a Blob, with how many notes it holds. o: { cases, reflections, which: 'all' | 'complete',
// progress, images } (all on but the figures by default). Also used by Save to Google Drive / Dropbox.
export async function makeNotesZip(opts = {}) {
  const o = { cases: true, reflections: true, notes: true, which: 'all', progress: true, images: false, ...opts };
  const notes = o.notes ? await ensureNotes().catch(() => []) || [] : [];
  const refls = S.reflections || [];
  const list = o.reflections ? refls.filter(r => o.which === 'all' || r.status === 'complete') : [];
  const Z = await needZip();
  const zip = new Z();
  // figures: fetched one at a time (each is a document of its own); a missing one keeps its caption
  const images = {};
  if (o.reflections && o.images) {
    for (const id of new Set(list.flatMap(r => (r.figures || []).map(f => f.id).filter(Boolean)))) {
      const img = await cloud.loadImage(S.user.email, id).catch(() => null);
      if (!img || !img.data) continue;
      const file = `images/${id}.${/png/.test(img.mime || '') ? 'png' : 'jpg'}`;
      zip.file(file, img.data, { base64: true });
      images[id] = file;
    }
  }
  const files = exportNotes({
    cases: S.cases || [], reflections: list, notes, m: mdFormat(), ctx: mdCtx(), images,
    progress: { rows: progress(S.counts || {}, rYear()), refl: reflectionProgress(refls), year: myYearName(), today: todayISO() },
    opts: { cases: o.cases, reflections: o.reflections, progress: o.progress, notes: o.notes },
  });
  for (const f of files) zip.file(f.path, f.text);
  return { blob: await zip.generateAsync({ type: 'blob' }), files: files.length };
}

export function downloadNotes() {
  const refls = S.reflections || [];
  const o = { cases: true, reflections: true, notes: true, which: 'all', progress: true, images: false };
  const nNotes = () => (Array.isArray(S.notes) ? S.notes.length : 0);
  const nFigs = () => new Set(chosen().flatMap(r => (r.figures || []).map(f => f.id).filter(Boolean))).size;
  const chosen = () => (o.reflections ? refls.filter(r => o.which === 'all' || r.status === 'complete') : []);
  const check = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: o[k], onchange: e => { o[k] = e.target.checked; paint(); } }), label);
  const count = h('p', { class: 'xp-count' });
  const which = h('select', { 'aria-label': 'Which reflections', onchange: e => { o.which = e.target.value; paint(); } },
    h('option', { value: 'all' }, 'All, drafts too'), h('option', { value: 'complete' }, 'Complete only'));
  const figBox = check('images', 'Figures (the pictures, in images/)');
  const paint = () => {
    which.disabled = !o.reflections;
    figBox.querySelector('input').disabled = !o.reflections;
    const n = o.cases ? (S.cases || []).length : 0, r = chosen().length;
    count.textContent = `${n} case${n === 1 ? '' : 's'}, ${r} reflection${r === 1 ? '' : 's'}${o.reflections && o.images ? `, ${nFigs()} figure${nFigs() === 1 ? '' : 's'}` : ''}${o.notes ? `, ${nNotes()} note${nNotes() === 1 ? '' : 's'}` : ''}${o.progress ? ', Progress.md' : ''}.`;
  };
  const go = async () => {
    if (!o.cases && !o.reflections && !o.progress && !o.notes) return toast('Choose something to include');
    btn.disabled = true; btn.textContent = 'Making the zip…';
    try {
      const { blob, files } = await makeNotesZip(o);
      download(`apmes-logbook-notes-${todayISO()}.zip`, blob);
      m.close();
      toast(`Notes downloaded: ${files} file${files === 1 ? '' : 's'}`);
    } catch (err) { toast('Could not make the zip: ' + err.message); btn.disabled = false; btn.textContent = 'Download'; }
  };
  const btn = h('button', { class: 'primary', onclick: go }, 'Download');
  paint();
  ensureNotes().then(paint, () => {});
  const m = modal('Markdown export', [
    h('p', { class: 'hint help', style: 'margin:0 0 8px' }, 'A zip of Markdown notes for Obsidian and other notes apps: unzip it into your vault. The layout follows Settings → Markdown.'),
    check('cases', 'Cases'),
    check('reflections', 'Reflections, one note each'),
    h('label', { class: 'field', style: 'margin:0 0 6px 28px' }, 'Which', which),
    h('div', { style: 'margin-left:28px' }, figBox),
    check('notes', 'Your notes (each with its day; undated ones in Notes.md)'),
    check('progress', 'Progress.md (counts against targets, reflections per heading)'),
    count,
    h('p', { class: 'tip', style: 'margin:8px 0 0' }, PRIVACY),
    h('div', { class: 'bar dlg-actions' }, h('span', { class: 'grow' }), h('button', { onclick: () => m.close() }, 'Cancel'), btn)]);
}
