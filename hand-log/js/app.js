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

// Tappable phrase chips under each feedback box (speed of entry); added once.
const PHRASES = {
  'f-good': ['Safe tissue handling', 'Good knowledge of anatomy', 'Clear consent', 'Efficient', 'Good exposure'],
  'f-improve': ['Tourniquet time awareness', 'Knot tying', 'Plan before incision', 'Documentation', 'Haemostasis'],
  'f-action': ['Repeat with supervision', 'Read on zone II anatomy', 'Practise on sawbones', 'Re-assess in 1 month'],
};
function addPhraseChips() {
  for (const [id, list] of Object.entries(PHRASES)) {
    const ta = $(id);
    if (!ta || (ta.nextElementSibling && ta.nextElementSibling.classList.contains('chips'))) continue;
    const row = el('div', { class: 'chips' });
    for (const p of list) {
      const b = el('button', { type: 'button', class: 'chip', textContent: p });
      b.addEventListener('click', () => {
        const v = ta.value.trim();
        ta.value = v ? v + '; ' + p : p;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      row.append(b);
    }
    ta.after(row);
  }
}

// ---------- form ----------
let formType = 'dops';
const LAST_KEY = 'handlog.last';
let prefill = null;
function buildForm(type) {
  formType = type;
  const form = $('entry-form');
  form.reset();
  $('form-error').textContent = '';
  $('form-title').textContent = 'New ' + ((FORMS[type] && FORMS[type].title) || TYPE_LABEL[type]);
  $('f-date').value = today();
  // Prefill assessor, setting and complexity from the last saved entry (speed of entry).
  try {
    const last = JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
    if (last && typeof last === 'object') {
      if (typeof last.assessor === 'string') $('f-assessor').value = last.assessor;
      for (const k of ['setting', 'complexity']) {
        const s = $('f-' + k);
        if (typeof last[k] === 'string' && [...s.options].some((o) => o.value === last[k])) s.value = last[k];
      }
    }
  } catch { /* ignore */ }
  $('f-item-label').textContent = type === 'dops' ? 'Procedure' : 'Clinical presentation';

  const item = $('f-item');
  item.replaceChildren(el('option', { value: '', textContent: 'Choose…' }));
  const src = type === 'dops' ? PROCEDURES : CASES;
  // "Recent": up to 5 distinct items of this form type, most recently logged first.
  const recent = [];
  for (const e of load().filter((x) => x && x.type === type).sort((a, b) => (b.created || '').localeCompare(a.created || ''))) {
    const p = src.find((x) => x.id === e.item);
    if (p && !recent.includes(p)) recent.push(p);
    if (recent.length >= 5) break;
  }
  if (recent.length) item.append(el('optgroup', { label: 'Recent' }, ...recent.map((p) => el('option', { value: p.id, textContent: p.name }))));
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
  // Suggest the global rating from the domain ratings until the user picks one themselves.
  g.dataset.manual = '';
  let gHint = $('f-global-hint');
  if (!gHint) { gHint = el('p', { id: 'f-global-hint', class: 'small hint' }); g.insertAdjacentElement('afterend', gHint); }
  gHint.textContent = '';
  gHint.hidden = true;
  if (!form.dataset.globalSuggest) {
    form.dataset.globalSuggest = '1';
    form.addEventListener('change', (ev) => {
      const t = ev.target;
      const gs = $('f-global');
      const h = $('f-global-hint');
      if (t === gs) { gs.dataset.manual = '1'; if (h) h.hidden = true; return; }
      if (!t || !t.name || !t.name.startsWith('d-') || gs.dataset.manual) return;
      const nums = [...form.querySelectorAll('input[type="radio"][name^="d-"]:checked')]
        .map((i) => Number(i.value)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      if (!nums.length) return;
      const m = nums.length >> 1;
      const median = nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2;
      gs.value = String(Math.round(median));
      if (h && gs.value) { h.textContent = 'Suggested from domain ratings; change if needed.'; h.hidden = false; }
    });
  }

  const box = $('domains');
  box.replaceChildren();
  const quick = el('div', { class: 'quick-all-row' }, el('span', { class: 'small', textContent: 'Rate all domains:' }));
  for (const r of RATING) {
    const b = el('button', { type: 'button', class: 'quick-all', title: r.label, textContent: String(r.value) });
    b.addEventListener('click', () => {
      for (const dd of domainsOf(type)) {
        const inp = box.querySelector(`input[name="d-${dd.id}"][value="${String(r.value)}"]`);
        if (inp) inp.checked = true;
      }
      // fire from a radio so the global-rating suggestion and draft autosave see it
      const any = box.querySelector(`input[name^="d-"][value="${String(r.value)}"]`);
      if (any) any.dispatchEvent(new Event('change', { bubbles: true }));
    });
    quick.append(b);
  }
  box.append(quick);
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
  addPhraseChips();
  // "Log another like this": preselect item, setting, complexity once, then clear.
  if (prefill && prefill.type === type) {
    $('f-item').value = prefill.item || '';
    $('f-setting').value = prefill.setting || '';
    $('f-complexity').value = prefill.complexity || '';
  }
  prefill = null;
  restoreDraft(type);
}

// ---------- draft autosave (keeps a half-filled form if the phone locks) ----------
const draftKey = (type) => 'handlog.draft.' + type;
let draftTimer = null;
function readDraft(type) {
  try { const d = JSON.parse(localStorage.getItem(draftKey(type)) || 'null'); return d && typeof d === 'object' ? d : null; } catch { return null; }
}
function clearDraft(type) {
  clearTimeout(draftTimer); draftTimer = null;
  try { localStorage.removeItem(draftKey(type)); } catch { /* storage blocked */ }
}
function saveDraft() {
  const form = $('entry-form');
  const data = {};
  for (const f of form.querySelectorAll('input[id^="f-"], select[id^="f-"], textarea[id^="f-"]')) data[f.id] = f.value;
  for (const r of form.querySelectorAll('input[type="radio"][name^="d-"]:checked')) data[r.name] = r.value;
  try { localStorage.setItem(draftKey(formType), JSON.stringify(data)); } catch { /* storage full or blocked */ }
}
function restoreDraft(type) {
  const form = $('entry-form');
  const old = document.getElementById('draft-note');
  if (old) old.remove();
  const d = readDraft(type);
  if (!d) return;
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string') continue;
    if (k.startsWith('f-')) { const f = document.getElementById(k); if (f && form.contains(f) && 'value' in f) f.value = v; }
    else if (k.startsWith('d-')) { const r = [...form.querySelectorAll('input[type="radio"]')].find((x) => x.name === k && x.value === v); if (r) r.checked = true; }
  }
  const btn = el('button', { type: 'button', class: 'secondary', textContent: 'Discard draft' });
  btn.addEventListener('click', () => { clearDraft(type); buildForm(type); });
  form.prepend(el('p', { id: 'draft-note', class: 'small hint' }, 'Draft restored ', btn));
}
$('entry-form').addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300); });
$('entry-form').addEventListener('change', () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 300); });

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
  clearDraft(formType);
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ assessor: entry.assessor, setting: entry.setting, complexity: entry.complexity })); } catch { /* ignore */ }
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
  applyListFilter();
}
function applyListFilter() {
  const q = ($('list-filter')?.value || '').trim().toLowerCase();
  for (const li of $('entries').querySelectorAll('li.entry')) li.hidden = !!q && !li.textContent.toLowerCase().includes(q);
}
$('list-filter')?.addEventListener('input', applyListFilter);

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
  let again = $('log-again');
  if (!again) {
    again = el('button', { type: 'button', id: 'log-again', class: 'btn', textContent: 'Log another like this' });
    $('export-one').before(again);
    again.addEventListener('click', () => {
      if (!current) return;
      prefill = { type: current.type, item: current.item, setting: current.setting, complexity: current.complexity };
      location.hash = current.type === 'minicex' ? '#new-minicex' : '#new-dops';
    });
  }
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
