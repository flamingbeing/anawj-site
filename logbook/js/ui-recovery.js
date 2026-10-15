// Recovery is device-only: cloud records keep their existing schema/permissions.
import { S, h, hooks, writes, toast, cloud, confirmBox, setCases } from './ui-core.js';
import { recoverableCaseDrafts, recoverCaseDraft, editCaseDialog } from './ui-log.js';
import { hasContent } from './ui-reflect.js';
import { listDrafts } from './drafts.js';
import { renderBin, BIN_DAYS } from './bin.js';
const summary = r => r?._deleted ? 'Deleted record' : [r?.initials, r?.title || r?.details || r?.summary || r?.diagnosis || r?.points?.find(p => p.heading || p.text)?.text || r?.points?.find(p => p.heading)?.heading || Object.values(r?.sections || {}).find(Boolean) || r?.references?.find(Boolean) || (r?.figures?.length ? 'Reflection with images' : '')].filter(Boolean).join(' ').slice(0, 160);
// 'Restore my version': this device's newest version (saves made after the conflict waited behind it), not the oldest
const mine = job => writes.entries().find(x => x.kind === job.kind && x.record.id === job.record.id && (x.state === 'pending' || x.state === 'conflict') && !x.record._deleted)?.record || job.record;
async function restore(job, record) {
  const owner = S.user?.email;
  if (job.owner !== owner) return;
  if (!record || !await confirmBox('Restore this version?', 'Your current version is retained in this device’s Recent changes. Restore the selected version?', 'Restore')) return;
  if (S.user?.email !== owner) return;
  try {
    const list = (job.kind === 'case' ? S.cases : job.kind === 'note' ? S.notes : S.reflections) || [];
    // (the queue picks the base when this record's saves are stopped by a conflict or a failed save)
    const saved = await writes.restore(job.kind, owner, record, list.find(x => x.id === job.record.id) || null);
    if (S.user?.email !== owner) return;
    if (job.kind === 'case') setCases([saved, ...S.cases.filter(x => x.id !== saved.id)]);
    toast('Version restored'); hooks.render();
  } catch (err) { toast(err.message); hooks.render(); }
}
// One Recover page (owner, 15 Oct 2026; in More, can go on the bar): Needs attention (only when there is any), Recently
// deleted (the recycle bin, every device), Unfinished drafts (this device) and Earlier versions (this device), each
// folded with a count and where it lives. It replaced Recent changes / Recover drafts and Settings → Recycle bin.
// open at first: all but Earlier versions (owner: folded by default)
const open = new Set(['attention', 'deleted', 'drafts']);
const fold = (id, title, where, n, ...body) => h('details', { class: 'card fold-card an-sec recover-sec', 'data-sec': id, open: open.has(id),
  ontoggle: e => { if (e.target.open) open.add(id); else open.delete(id); } },
  h('summary', {}, h('span', { class: 'an-t' }, n == null ? title : `${title} (${n})`), h('small', { class: 'an-s' }, where)),
  h('div', { class: 'an-body' }, ...body));
const jobCard = (job, run) => h('article', { class: 'card' },
  h('p', {}, h('b', {}, job.kind === 'case' ? 'Case' : job.kind === 'note' ? 'Note' : 'Reflection'), ' · ', new Date(job.at).toLocaleString(), ' · ', job.state === 'pending' ? 'Saved locally · pending sync' : job.state),
  h('p', {}, summary(job.record)), job.error ? h('p', { role: 'status' }, job.error) : null,
  job.state === 'failed' || job.state === 'pending' ? h('button', { onclick: () => run(() => writes.retry(job.key)) }, 'Retry sync') : null,
  job.record._deleted ? h('button', { onclick: () => restore(job, job.base) }, 'Restore deleted version') : h('button', { onclick: () => restore(job, job.state === 'conflict' ? mine(job) : job.record) }, job.state === 'conflict' ? 'Keep mine' : 'Restore this version'),
  job.state === 'conflict' ? [h('p', {}, 'Version from elsewhere: ', summary(job.remote) || 'Deleted'),
    h('button', { onclick: () => run(() => writes.archive(job.key)) }, 'Keep theirs')] : null,
  job.base && !job.record._deleted ? h('button', { onclick: () => restore(job, job.base) }, 'Restore previous version') : null);
export function renderRecovery() {
  const email = S.user?.email;
  const drafts = recoverableCaseDrafts();
  let reflections = [], edits = [];
  try { reflections = listDrafts('apmes-logbook-reflection-draft', (cloud.demo ? 'demo:' : '') + email).filter(x => hasContent(x.value)); } catch { /* unavailable */ }
  try { edits = listDrafts('logbook-edit-draft', (cloud.demo ? 'demo:' : '') + email); } catch { /* unavailable */ }
  const run = async fn => { if (S.user?.email !== email) return; try { await fn(); } catch (err) { toast(err.message); } hooks.render(); };
  const jobs = writes.entries();
  const attention = jobs.filter(j => ['pending', 'failed', 'conflict'].includes(j.state));
  const earlier = jobs.filter(j => !attention.includes(j));
  const nDrafts = drafts.length + reflections.length + edits.length;
  return h('div', { class: 'recover-page' },
    h('section', { class: 'card' }, h('h2', {}, 'Recover'),
      h('p', { class: 'hint', style: 'margin:0' }, 'Changes waiting to sync, deleted items, unfinished drafts and earlier versions. Drafts and versions are kept on this device only (signing out clears them); this is recovery, not a backup.'),
      writes.error() ? h('p', { role: 'alert' }, writes.error()) : null),
    attention.length ? fold('attention', 'Needs attention', 'This device · not synced yet, or changed in two places', attention.length,
      h('p', { class: 'hint help', style: 'margin:0 0 6px' }, 'Retry sends it again; Keep mine or Keep theirs settles a change made in two places.'),
      attention.map(j => jobCard(j, run))) : null,
    fold('deleted', 'Recently deleted', `All devices · kept ${BIN_DAYS} days`, null, renderBin({ title: false })),
    fold('drafts', 'Unfinished drafts', 'This device', nDrafts,
      !nDrafts ? h('p', { class: 'muted' }, 'No unfinished drafts on this device.') : null,
      drafts.map(x => h('div', { class: 'card' }, h('p', {}, summary(x.value) || x.value.bulk?.slice(0, 160)),
        h('button', { onclick: () => { if (S.user?.email === email) recoverCaseDraft(x.value); } }, 'Open case draft'),
        h('button', { onclick: () => run(() => localStorage.removeItem(x.key)) }, 'Discard copy'))),
      edits.map(x => h('div', { class: 'card' }, h('p', {}, 'Edit case draft: ', summary(x.value.record)),
        h('button', { onclick: () => { if (S.user?.email === email) editCaseDialog(x.value.base, { draft: x.value.record, onCreated: x.value.isNew && !x.value.base.id ? () => {} : undefined }); } }, 'Open edit draft'),
        h('button', { onclick: () => run(() => localStorage.removeItem(x.key)) }, 'Discard copy'))),
      reflections.map(x => h('div', { class: 'card' }, h('p', {}, summary(x.value)),
        h('button', { onclick: () => { if (S.user?.email === email) hooks.recoverReflection?.(x.value); } }, 'Open reflection draft'),
        h('button', { onclick: () => run(() => localStorage.removeItem(x.key)) }, 'Discard copy')))),
    fold('versions', 'Earlier versions', 'This device · the last 100 saves', earlier.length,
      !earlier.length ? h('p', { class: 'muted' }, 'No earlier versions on this device.') : null,
      earlier.map(j => jobCard(j, run))));
}
