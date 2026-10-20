// Scan imports (owner, 20 Oct 2026): Firetop reads each received scan and writes the values it found to scanImports/{id}
// (firestore.rules). Nothing reaches a patient until an admin picks the patient here and approves. Flagged values start
// unticked, and so does any value that would replace one already saved. Values only: no photos or crops are stored.
import { BY_ID, EXTRA_BY_ID } from './schema.js';

const fieldOf = id => BY_ID[id] || EXTRA_BY_ID[id];

// a scanned value as the app stores it: numbers as numbers, blanks left out (same rule as tools/scan/export-scan.mjs)
export function toValue(f, v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  if ((f.type === 'num' || f.type === 'int' || f.type === 'code') && s.toUpperCase() !== 'NA' && Number.isFinite(Number(s))) return Number(s);
  return s;
}

// the rows to show for one import, flagged first. `current` is the chosen patient's saved value for a field id, or null.
export function rowsFor(imp, current = () => null) {
  const skipped = [], rows = [];
  for (const [id, e] of Object.entries(imp.fields || {})) {
    const f = fieldOf(id);
    if (!f) { skipped.push(id); continue; }
    const v = toValue(f, e?.v), flags = Array.isArray(e?.flags) ? e.flags.map(String) : [];
    if (v == null && !flags.length) continue;
    const cur = current(id);
    const replaces = cur != null && cur !== v;
    rows.push({ id, label: f.label, unit: f.unit || '', value: v == null ? '' : String(v), flags, now: cur, replaces, use: v != null && !flags.length && !replaces });
  }
  rows.sort((a, b) => b.flags.length - a.flags.length);
  return { rows, skipped };
}

export function mount({ view, esc, toast, cloud, patients, sid, val, setField, back }) {
  const when = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const state = { list: [], open: null, pid: '' };
  const patientList = () => Object.values(patients()).filter(p => !p.deleted && !p.lock?.on)
    .sort((a, b) => sid(a).localeCompare(sid(b)));
  const paint = h => { view.innerHTML = h; };

  async function load() {
    paint('<p class="muted">Loading…</p>');
    try { state.list = await cloud.scanImports(); } catch (e) { return paint(`<p class="note">${esc(cloud.friendly(e))}</p>`); }
    list();
  }

  function list() {
    state.open = null;
    const pend = state.list.filter(x => x.status === 'pending'), rest = state.list.filter(x => x.status !== 'pending');
    const line = x => `<li><button class="secondary" data-open="${esc(x.id)}">${esc(when(x.createdAt))} · ${Object.keys(x.fields || {}).length} values${x.status !== 'pending' ? ' · ' + esc(x.status) : ''}</button></li>`;
    paint(`<div class="stack"><p class="muted small">Firetop reads each page you send from Scan pages and lists it here. Nothing reaches a patient until you approve it.</p>
      <h2>Waiting for approval</h2>${pend.length ? `<ul class="plain" role="list">${pend.map(line).join('')}</ul>` : '<p class="muted">Nothing waiting.</p>'}
      ${rest.length ? `<h2>Done</h2><ul class="plain" role="list">${rest.map(line).join('')}</ul>` : ''}
      <button class="secondary" id="sirefresh">Refresh</button></div>`);
    view.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { state.open = state.list.find(x => x.id === b.dataset.open); state.pid = ''; detail(); });
    view.querySelector('#sirefresh').onclick = load;
  }

  function detail() {
    const imp = state.open, p = patients()[state.pid];
    const { rows, skipped } = rowsFor(imp, id => p ? val(p, id) : null);
    const pend = imp.status === 'pending';
    const bad = (imp.pages || []).filter(x => x.accepted === false).length;
    paint(`<div class="stack"><button class="secondary" id="siback">‹ All imports</button>
      <p><b>${esc(when(imp.createdAt))}</b>${pend ? '' : ` · ${esc(imp.status)}${imp.reviewedBy ? ' by ' + esc(imp.reviewedBy) : ''}`}</p>
      ${bad ? `<p class="note">${bad} photo${bad > 1 ? 's' : ''} did not line up and ${bad > 1 ? 'were' : 'was'} not read: retake and send again.</p>` : ''}
      ${skipped.length ? `<p class="muted small">${skipped.length} value${skipped.length > 1 ? 's' : ''} not in this app’s form, left out.</p>` : ''}
      ${pend ? `<label class="lab" for="sipt">Which patient is this?</label>
        <select id="sipt"><option value="">Choose a patient</option>${patientList().map(q => `<option value="${esc(q.id)}"${q.id === state.pid ? ' selected' : ''}>${esc(sid(q))} (${esc(q.site || '')})</option>`).join('')}</select>` : ''}
      <ul class="plain" role="list">${rows.map((r, i) => `<li class="${r.flags.length ? 'flag' : ''}"><label><input type="checkbox" data-use="${i}" ${r.use ? 'checked' : ''} ${pend && p ? '' : 'disabled'}> <b>${esc(r.label)}</b>${r.unit ? ` (${esc(r.unit)})` : ''}</label>
        <input data-val="${i}" value="${esc(r.value)}" aria-label="${esc(r.label)}" ${pend ? '' : 'disabled'}>
        ${r.replaces ? `<small class="muted">Now saved: ${esc(r.now)}. Ticking replaces it.</small>` : ''}
        ${r.flags.map(f => `<small class="note">${esc(f)}</small>`).join('')}</li>`).join('')}</ul>
      ${pend ? `<button class="primary" id="siok" ${p ? '' : 'disabled'}>Approve ticked values</button><button class="secondary" id="sino">Reject this scan</button>` : ''}</div>`);
    view.querySelector('#siback').onclick = list;
    const sel = view.querySelector('#sipt'); if (sel) sel.onchange = () => { state.pid = sel.value; detail(); };
    if (!pend) return;
    // edits and ticks are read from the screen when approving; typing a value ticks it
    view.querySelectorAll('[data-val]').forEach(i => i.oninput = () => { const c = view.querySelector(`[data-use="${i.dataset.val}"]`); if (c && !c.disabled) c.checked = true; });
    view.querySelector('#sino').onclick = async () => {
      if (!confirm('Reject this scan? Nothing is saved to any patient.')) return;
      try { await cloud.reviewScanImport(imp.id, 'rejected'); imp.status = 'rejected'; toast('Rejected'); list(); } catch (e) { toast(cloud.friendly(e)); }
    };
    view.querySelector('#siok').onclick = async () => {
      const q = patients()[state.pid]; if (!q) return;
      const picked = rows.map((r, i) => ({ r, on: view.querySelector(`[data-use="${i}"]`).checked, v: view.querySelector(`[data-val="${i}"]`).value }))
        .filter(x => x.on).map(x => ({ id: x.r.id, v: toValue(fieldOf(x.r.id), x.v) })).filter(x => x.v != null);
      if (!picked.length) return toast('Tick at least one value.');
      if (!confirm(`Save ${picked.length} value${picked.length > 1 ? 's' : ''} to ${sid(q)}?`)) return;
      for (const x of picked) setField(q, x.id, x.v);
      try { await cloud.reviewScanImport(imp.id, 'approved'); imp.status = 'approved'; toast(`Saved to ${sid(q)}`); list(); }
      catch (e) { toast('Saved to the patient, but the import could not be marked approved: ' + cloud.friendly(e)); }
    };
  }

  load();
}
