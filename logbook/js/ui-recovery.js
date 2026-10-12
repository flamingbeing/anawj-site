// Recovery is device-only: cloud records keep their existing schema/permissions.
import { S, h, hooks, writes, toast, cloud, confirmBox, setCases } from './ui-core.js';
import { recoverableCaseDrafts, recoverCaseDraft } from './ui-log.js';
import { listDrafts } from './drafts.js';
const summary = r => r?._deleted ? 'Deleted record' : [r?.initials, r?.title || r?.details || r?.summary || r?.diagnosis].filter(Boolean).join(' ').slice(0, 160);
async function restore(job, record) {
  const owner = S.user?.email;
  if (job.owner !== owner) return;
  if (!record || !await confirmBox('Restore this version?', 'Your current version is retained in this device’s Recent changes. Restore the selected version?', 'Restore')) return;
  if (S.user?.email !== owner) return;
  try {
    const list = job.kind === 'case' ? S.cases : S.reflections;
    const base = list.find(x => x.id === job.record.id) || null;
    // Resolve the stopped chain deliberately; keep all versions in the history.
    await writes.archive(job.key);
    if (S.user?.email !== owner) return;
    const saved = await writes.save(job.kind, owner, record, base);
    if (S.user?.email !== owner) return;
    if (job.kind === 'case') setCases([saved, ...S.cases.filter(x => x.id !== saved.id)]);
    toast('Version restored'); hooks.render();
  } catch (err) { toast(err.message); hooks.render(); }
}
export function renderRecovery() {
  const email = S.user?.email;
  const drafts = recoverableCaseDrafts();
  let reflections = [];
  try { reflections = listDrafts('apmes-logbook-reflection-draft', (cloud.demo ? 'demo:' : '') + email).filter(x => x.value.restore); } catch { /* unavailable */ }
  const run = async fn => { if (S.user?.email !== email) return; try { await fn(); } catch (err) { toast(err.message); } hooks.render(); };
  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'Recent changes / Recover drafts'),
      h('p', { class: 'hint' }, 'Private to this browser and account. Keeps the last 100 saved versions and every pending, failed or conflicting change. Signing out clears these recovery copies. This is recovery history, not a backup.'),
      writes.error() ? h('p', { role: 'alert' }, writes.error()) : null),
    h('section', { class: 'card' }, h('h2', {}, 'Recover drafts'),
      !drafts.length && !reflections.length ? h('p', { class: 'muted' }, 'No unfinished drafts on this device.') : null,
      drafts.map(x => h('div', { class: 'card' }, h('p', {}, summary(x.value) || x.value.bulk?.slice(0, 160)),
        h('button', { onclick: () => { if (S.user?.email === email) recoverCaseDraft(x.value); } }, 'Open case draft'),
        h('button', { onclick: () => run(() => localStorage.removeItem(x.key)) }, 'Discard copy'))),
      reflections.map(x => h('div', { class: 'card' }, h('p', {}, summary(x.value)),
        h('button', { onclick: () => { if (S.user?.email === email) hooks.recoverReflection?.(x.value); } }, 'Open reflection draft'),
        h('button', { onclick: () => run(() => localStorage.removeItem(x.key)) }, 'Discard copy')))),
    h('section', { class: 'card' }, h('h2', {}, 'Saved versions and sync'),
      !writes.entries().length ? h('p', { class: 'muted' }, 'No recent changes on this device.') : null,
      writes.entries().map(job => h('article', { class: 'card' },
        h('p', {}, h('b', {}, job.kind === 'case' ? 'Case' : 'Reflection'), ' · ', new Date(job.at).toLocaleString(), ' · ', job.state === 'pending' ? 'Saved locally · pending sync' : job.state),
        h('p', {}, summary(job.record)), job.error ? h('p', { role: 'status' }, job.error) : null,
        job.state === 'failed' || job.state === 'pending' ? h('button', { onclick: () => run(() => writes.retry(job.key)) }, 'Retry sync') : null,
        job.record._deleted ? h('button', { onclick: () => restore(job, job.base) }, 'Restore deleted version') : h('button', { onclick: () => restore(job, job.record) }, job.state === 'conflict' ? 'Restore my version' : 'Restore this version'),
        job.state === 'conflict' ? [h('p', {}, 'Version from elsewhere: ', summary(job.remote) || 'Deleted'),
          h('button', { onclick: () => run(() => writes.archive(job.key)) }, 'Keep version from elsewhere')] : null,
        job.base && !job.record._deleted ? h('button', { onclick: () => restore(job, job.base) }, 'Restore previous version') : null))));
}
