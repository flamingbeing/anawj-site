// Hand log: DOPS and Mini-CEX entries kept in this browser only (localStorage 'handlog.entries').
import * as F from './forms.js';

const KEY = 'handlog.entries';
const PROCEDURES = F.PROCEDURES || [];
const CASES = F.CASES || [];
const RATING = F.RATING || [];
const FORMS = F.FORMS || {};
const TYPE_LABEL = { dops: 'DOPS', minicex: 'Mini-CEX' };
const $ = (id) => document.getElementById(id);

function load() {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k in n) n[k] = v; else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ratingLabel = (v) => {
  if (v === '' || v == null) return '';
  const r = RATING.find((x) => String(x.value) === String(v));
  return r ? `${r.value} ${r.label}` : String(v);
};
const itemName = (e) => {
  const src = e.type === 'dops' ? PROCEDURES : CASES;
  const f = src.find((x) => x.id === e.item);
  return f ? f.name : (e.itemName || e.item || '');
};
const domainsOf = (type) => (FORMS[type] && FORMS[type].domains) || [];

// ---------- form ----------
let formType = 'dops';
function buildForm(type) {
  formType = type;
  const form = $('entry-form');
  form.reset();
  $('form-error').textContent = '';
  $('form-title').textContent = 'New ' + ((FORMS[type] && FORMS[type].title) || TYPE_LABEL[type]);
  $('f-date').value = today();
  $('f-item-label').textContent = type === 'dops' ? 'Procedure' : 'Clinical presentation';

  const item = $('f-item');
  item.replaceChildren(el('option', { value: '', textContent: 'Choose…' }));
  const src = type === 'dops' ? PROCEDURES : CASES;
  const groups = new Map();
  for (const p of src) {
    const opt = el('option', { value: p.id, textContent: p.name });
    if (p.group) {
      if (!groups.has(p.group)) { const g = el('optgroup', { label: p.group }); groups.set(p.group, g); item.append(g); }
      groups.get(p.group).append(opt);
    } else item.append(opt);
  }

  const g = $('f-global');
  g.replaceChildren(el('option', { value: '', textContent: 'Choose…' }), ...RATING.map((r) => el('option', { value: String(r.value), textContent: `${r.value} ${r.label}` })));

  const box = $('domains');
  box.replaceChildren();
  for (const d of domainsOf(type)) {
    const name = 'd-' + d.id;
    const fs = el('fieldset', {}, el('legend', { textContent: d.label }));
    if (d.hint) fs.append(el('p', { class: 'small hint', textContent: d.hint }));
    const scale = el('div', { class: 'scale' });
    const opts = [...RATING.map((r) => ({ value: String(r.value), text: String(r.value), title: r.label })), { value: 'n/a', text: 'n/a', title: 'Not assessed' }];
    for (const o of opts) {
      scale.append(el('label', { title: o.title }, el('input', { type: 'radio', name, value: o.value }), el('span', { textContent: o.text })));
    }
    fs.append(scale);
    box.append(fs);
  }
}

$('entry-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const err = $('form-error');
  if (!$('f-item').value) { err.textContent = 'Choose a ' + (formType === 'dops' ? 'procedure.' : 'clinical presentation.'); $('f-item').focus(); return; }
  if (!$('f-global').value) { err.textContent = 'Choose a global rating.'; $('f-global').focus(); return; }
  const domains = {};
  for (const d of domainsOf(formType)) {
    const c = f.querySelector(`input[name="d-${d.id}"]:checked`);
    domains[d.id] = c ? c.value : '';
  }
  const entry = {
    id: newId(), type: formType, date: $('f-date').value || today(),
    item: $('f-item').value, itemName: $('f-item').selectedOptions[0]?.textContent || '',
    assessor: $('f-assessor').value.trim(), setting: $('f-setting').value, complexity: $('f-complexity').value,
    domains, global: $('f-global').value,
    good: $('f-good').value.trim(), improve: $('f-improve').value.trim(), action: $('f-action').value.trim(),
    created: new Date().toISOString(),
  };
  const list = load(); list.push(entry);
  if (!save(list)) { err.textContent = 'Could not save on this device (storage full or blocked).'; return; }
  location.hash = '#list';
});

// ---------- list ----------
function sorted() { return load().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '')); }
function renderList() {
  const list = sorted();
  $('empty').hidden = list.length > 0;
  $('entries').replaceChildren(...list.map((e) => el('li', { class: 'entry' },
    el('a', { href: '#entry/' + encodeURIComponent(e.id) },
      el('span', { class: 'item', textContent: itemName(e) }),
      el('span', { class: 'meta', textContent: `${e.date} · ${TYPE_LABEL[e.type] || e.type}` }),
      el('span', { class: 'rating', textContent: e.global !== '' && e.global != null ? 'Global ' + e.global : '' })))));
}

// ---------- detail ----------
let current = null;
function renderEntry(id) {
  const e = load().find((x) => x.id === id);
  current = e || null;
  const dl = $('entry-detail');
  if (!e) { $('entry-title').textContent = 'Entry not found'; dl.replaceChildren(); return; }
  $('entry-title').textContent = `${TYPE_LABEL[e.type] || e.type}: ${itemName(e)}`;
  const rows = [['Date', e.date], ['Assessor', e.assessor], ['Setting', e.setting], ['Complexity', e.complexity]];
  for (const d of domainsOf(e.type)) rows.push([d.label, e.domains?.[d.id] === 'n/a' ? 'n/a' : ratingLabel(e.domains?.[d.id])]);
  rows.push(['Global rating', ratingLabel(e.global)], ['What went well', e.good], ['To improve', e.improve], ['Agreed action', e.action]);
  dl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v || '—' })]));
}
$('delete').addEventListener('click', () => {
  if (!current || !confirm('Delete this entry? This cannot be undone.')) return;
  save(load().filter((x) => x.id !== current.id));
  location.hash = '#list';
});
$('export-one').addEventListener('click', () => { if (current) download(`handlog-${current.id}.csv`, toCSV([current]), 'text/csv'); });

// ---------- summary ----------
function renderSummary() {
  const list = load();
  const byType = {}, byItem = {};
  for (const e of list) {
    const t = TYPE_LABEL[e.type] || e.type; byType[t] = (byType[t] || 0) + 1;
    const k = `${t}: ${itemName(e)}`; byItem[k] = (byItem[k] || 0) + 1;
  }
  const li = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => el('li', { textContent: `${k} — ${n}` }));
  $('sum-type').replaceChildren(...(list.length ? li(byType) : [el('li', { textContent: 'No entries yet.' })]));
  $('sum-item').replaceChildren(...li(byItem));
}

function csvCell(v) { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCSV(list) {
  const domIds = [...new Set([...domainsOf('dops'), ...domainsOf('minicex')].map((d) => d.id))];
  const head = ['id', 'date', 'type', 'item', 'assessor', 'setting', 'complexity', ...domIds.map((d) => 'd_' + d), 'global', 'good', 'improve', 'action'];
  const rows = list.map((e) => [e.id, e.date, TYPE_LABEL[e.type] || e.type, itemName(e), e.assessor, e.setting, e.complexity,
    ...domIds.map((d) => e.domains?.[d] ?? ''), e.global, e.good, e.improve, e.action]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-csv').addEventListener('click', () => download(`handlog-${today()}.csv`, toCSV(sorted()), 'text/csv'));
$('export-json').addEventListener('click', () => download(`handlog-backup-${today()}.json`, JSON.stringify(load(), null, 2), 'application/json'));
$('import-json').addEventListener('change', async (ev) => {
  const file = ev.target.files[0]; const msg = $('import-msg');
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('not a list');
    const list = load(); const ids = new Set(list.map((x) => x.id)); let added = 0;
    for (const e of data) {
      if (e && typeof e === 'object' && typeof e.id === 'string' && (e.type === 'dops' || e.type === 'minicex') && !ids.has(e.id)) { list.push(e); ids.add(e.id); added++; }
    }
    save(list);
    msg.textContent = `Restored ${added} new ${added === 1 ? 'entry' : 'entries'}.`;
    renderSummary();
  } catch { msg.textContent = 'That file is not a Hand log backup.'; }
  ev.target.value = '';
});

// ---------- routing ----------
function route() {
  const h = location.hash || '#list';
  let view = 'list';
  if (h === '#new-dops' || h === '#new-minicex') { view = 'form'; buildForm(h === '#new-dops' ? 'dops' : 'minicex'); }
  else if (h.startsWith('#entry/')) { view = 'entry'; renderEntry(decodeURIComponent(h.slice(7))); }
  else if (h === '#summary') { view = 'summary'; renderSummary(); }
  else renderList();
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'view-' + view;
  for (const a of document.querySelectorAll('.bar nav a')) {
    const on = a.getAttribute('href') === (view === 'entry' ? '#list' : h);
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch { /* no SW */ }
