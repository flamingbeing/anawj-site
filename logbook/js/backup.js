// Personal backup (More → Export / Import): everything in your logbook as one JSON file you keep, and a
// restore that adds back whatever is missing (it never overwrites or deletes anything). Photos are
// left out (they are for the Word portfolio only); older backups that have them still restore them.

import { S, h, toast, modal, cloud, download, fileButton, saveMany, patchLogbook, todayISO, displayName } from './ui-core.js';
import { cleanCase } from './demo-backend.js';
import { cleanReflection } from './reflections.js';

const mine = () => S.user.email;
const FORMAT = 'apmes-logbook-backup';

export async function makeBackup() {
  const reflections = S.reflections || [];
  const lb = S.logbook || {};
  return {
    format: FORMAT, version: 1, exportedAt: new Date().toISOString(), email: mine(), name: displayName(),
    logbook: { name: lb.name || '', settings: lb.settings || {}, templates: lb.templates || [], profile: lb.profile || null },
    cases: S.cases || [], reflections,
  };
}

export async function downloadBackup(btn) {
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
  // portfolio details, name and settings: only what this account doesn't have yet
  const lbNow = S.logbook || {}, bk = data.logbook || {};
  const profile = bk.profile && !lbNow.profile ? bk.profile : null;
  const name = bk.name && !String(lbNow.name || '').trim() ? bk.name : null;
  const setNow = lbNow.settings || {};
  const newSettings = Object.fromEntries(Object.entries(bk.settings && typeof bk.settings === 'object' ? bk.settings : {}).filter(([k]) => !(k in setNow)));
  const extra = [profile ? 'your portfolio details' : '', name ? 'your name' : '', Object.keys(newSettings).length ? 'settings you haven’t set here' : ''].filter(Boolean);
  const nothing = !cases.length && !refl.length && !newTpl.length && !extra.length;
  const m = modal('Restore from backup', [
    other,
    h('p', {}, nothing ? 'Everything in this backup is already in your logbook.'
      : `Add ${cases.length} case${cases.length === 1 ? '' : 's'}, ${refl.length} reflection${refl.length === 1 ? '' : 's'} and ${newTpl.length} tag group${newTpl.length === 1 ? '' : 's'} that are missing here${extra.length ? ', and ' + extra.join(', ') : ''}?`),
    h('p', { class: 'hint' }, `Backup from ${data.exportedAt ? new Date(data.exportedAt).toLocaleString() : 'an unknown date'}. Nothing already in your logbook is changed or deleted.`),
    h('div', { class: 'bar', style: 'margin-top:12px' }, h('span', { class: 'grow' }),
      h('button', { onclick: () => m.close() }, nothing ? 'Close' : 'Cancel'),
      nothing ? null : h('button', { class: 'primary', onclick: async () => {
        m.close();
        try {
          if (cases.length) await saveMany(cases);
          if (S.resident) for (const img of images) await cloud.saveImage(mine(), img);   // photos: programme residents only (rules)
          for (const r of refl) await cloud.saveReflection(mine(), r);
          if (newTpl.length) await patchLogbook({ templates: [...((S.logbook && S.logbook.templates) || []), ...newTpl] });
          if (extra.length) await patchLogbook({ ...(profile ? { profile } : {}), ...(name ? { name } : {}), ...(Object.keys(newSettings).length ? { settings: newSettings } : {}) });
          toast(`Restored ${cases.length} cases, ${refl.length} reflections`);
        } catch (err) { toast('Restore stopped: ' + err.message); }
      } }, 'Restore')),
  ]);
}

// extra: more ways to keep a copy, shown under the backup file (the Excel spreadsheet)
export function backupCard(...extra) {
  const btn = h('button', { onclick: () => downloadBackup(btn) }, 'Download backup');
  return h('section', { class: 'card' },
    h('h2', {}, 'Backup'),
    extra.length ? h('h3', {}, 'Backup file') : null,
    h('p', { class: 'hint' }, 'Keep your own copy of your cases, reflections, tag groups, settings and portfolio details as one file. Photos are not included. Restoring adds back anything missing and never deletes.'),
    h('div', { class: 'bar', style: 'margin-bottom:0' }, btn, fileButton('Restore from backup…', '.json,application/json', restoreBackup)),
    ...extra);
}
