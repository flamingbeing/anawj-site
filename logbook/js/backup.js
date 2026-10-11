// Personal backup (Settings → Backup): everything in your logbook as one JSON file you keep, and a
// restore that adds back whatever is missing (it never overwrites or deletes anything).

import { S, h, toast, modal, cloud, download, fileButton, saveMany, patchLogbook, todayISO, displayName } from './ui-core.js';
import { cleanCase } from './demo-backend.js';
import { cleanReflection } from './reflections.js';

const mine = () => S.user.email;
const FORMAT = 'apmes-logbook-backup';

export async function makeBackup() {
  const reflections = S.reflections || [];
  const ids = [...new Set(reflections.flatMap(r => (r.figures || []).map(f => f.id)).filter(Boolean))];
  const images = {};
  for (const id of ids) { const img = await cloud.loadImage(mine(), id); if (img) images[id] = img; }
  const lb = S.logbook || {};
  return {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(), email: mine(), name: displayName(),
    logbook: { name: lb.name || '', settings: lb.settings || {}, templates: lb.templates || [], profile: lb.profile || null },
    cases: S.cases || [], reflections, images,
  };
}

async function downloadBackup(btn) {
  btn.disabled = true;
  try {
    const data = await makeBackup();
    download(`logbook-backup-${todayISO()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
    toast(`Backup saved: ${data.cases.length} cases, ${data.reflections.length} reflections`);
  } catch (err) { toast('Could not make the backup: ' + err.message); }
  btn.disabled = false;
}

async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('That file is not a logbook backup'); return; }
  if (!data || data.format !== FORMAT || !Array.isArray(data.cases)) { toast('That file is not a logbook backup'); return; }
  const haveCases = new Set((S.cases || []).map(c => c.id));
  const haveRefl = new Set((S.reflections || []).map(r => r.id));
  const cases = data.cases.filter(c => c && c.id && !haveCases.has(c.id)).map(c => cleanCase(c, c.updatedAt || Date.now()));
  const refl = (data.reflections || []).filter(r => r && r.id && !haveRefl.has(r.id)).map(r => cleanReflection(r));
  const imgIds = new Set(refl.flatMap(r => (r.figures || []).map(f => f.id)));
  const images = Object.values(data.images || {}).filter(img => img && imgIds.has(img.id));
  const tpl = (data.logbook && Array.isArray(data.logbook.templates) ? data.logbook.templates : []);
  const haveTpl = new Set(((S.logbook && S.logbook.templates) || []).map(t => t.id));
  const newTpl = tpl.filter(t => t && t.id && !haveTpl.has(t.id));
  const other = data.email && data.email !== mine() ? h('p', { class: 'tip' }, `This backup is from ${data.email}. Its cases will be added to your logbook (${mine()}).`) : null;
  const nothing = !cases.length && !refl.length && !newTpl.length;
  const m = modal('Restore from backup', [
    other,
    h('p', {}, nothing ? 'Everything in this backup is already in your logbook.'
      : `Add ${cases.length} case${cases.length === 1 ? '' : 's'}, ${refl.length} reflection${refl.length === 1 ? '' : 's'} and ${newTpl.length} template${newTpl.length === 1 ? '' : 's'} that are missing here?`),
    h('p', { class: 'hint' }, `Backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'an unknown date'}. Nothing already in your logbook is changed or deleted.`),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, nothing ? 'Close' : 'Cancel'),
      nothing ? null : h('button', { class: 'primary', onclick: async () => {
        m.close();
        try {
          if (cases.length) await saveMany(cases);
          for (const img of images) await cloud.saveImage(mine(), img);
          for (const r of refl) await cloud.saveReflection(mine(), r);
          if (newTpl.length) await patchLogbook({ templates: [...((S.logbook && S.logbook.templates) || []), ...newTpl] });
          toast(`Restored ${cases.length} cases, ${refl.length} reflections`);
        } catch (err) { toast('Restore stopped: ' + err.message); }
      } }, 'Restore')),
  ]);
}

export function backupCard() {
  const btn = h('button', { onclick: () => downloadBackup(btn) }, 'Download backup');
  return h('section', { class: 'card' },
    h('h2', {}, 'Backup'),
    h('p', { class: 'hint' }, 'Keep your own copy of everything: cases, reflections (with pictures), templates and portfolio details, as one file. Restoring adds back anything missing and never deletes.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' }, btn, fileButton('Restore from backup…', '.json,application/json', restoreBackup)));
}
