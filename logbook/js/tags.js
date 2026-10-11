// Tags: what you tap when logging, laid out your way (Settings → Tag editor). No DOM.
//
// The APMES categories are built-in tags: each counts towards its category, which can't change; you can
// rename them (for yourself), hide them, reorder them and put them under section headers. Your own tags
// can link to any APMES categories (choosing the tag ticks them), or to none (a personal label). A tag
// under a category also counts towards that category. Cases keep their APMES category codes (Totals,
// Progress, targets, exports) and carry your own tags by key in case.tags.
//
// Stored as settings.tagSet, a list in display order:
//   { k: 'c:26', n?, l?, p?, hide? }          built-in category (n = your pill name, l = your long name)
//   { k: 'u:ab12cd', n, l?, p?, links?, hide? } your tag ('26:Interscalene' for older subcategories)
//   { k: 'h:ab12cd', n, hd: true }             a section header
// p = the key of the item it sits under (a header, a category or another tag). Built-in subcategories
// (20i) always sit under their official parent.

import { CATEGORIES, BY_CODE } from './categories.js';

export const MAX_TAGS = 300;
const ACTIVE = CATEGORIES.filter(c => !c.retired);
const TOPS = ACTIVE.filter(c => !c.parent);
const isCode = code => !!(BY_CODE[code] && !BY_CODE[code].retired);
const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const newKey = (kind = 'u') => `${kind}:${Math.random().toString(36).slice(2, 8)}`;

// The default layout: categories in the official order (or settings.catOrder), with the older personal
// subcategories (settings.subcats = { '26': ['Interscalene'] }) as tags under their category.
export function defaultTagSet({ catOrder = null, subcats = null } = {}) {
  let tops = TOPS;
  if (Array.isArray(catOrder) && catOrder.length) {
    const rank = new Map(catOrder.map((c, i) => [String(c), i]));
    tops = [...TOPS].sort((a, b) => (rank.get(a.code) ?? 1e3 + TOPS.indexOf(a)) - (rank.get(b.code) ?? 1e3 + TOPS.indexOf(b)));
  }
  const out = [];
  for (const t of tops) {
    out.push({ k: 'c:' + t.code });
    for (const s of ACTIVE.filter(c => c.parent === t.code)) out.push({ k: 'c:' + s.code });
  }
  for (const [code, names] of Object.entries(subcats || {})) {
    if (!isCode(code)) continue;
    for (const name of names || []) out.push({ k: `${code}:${name}`, n: str(name, 40), p: 'c:' + code });
  }
  return out;
}

// Whitelist and repair a stored tag set: every built-in category exactly once (missing ones added at
// the end), parents that exist, no loops, links to real categories only.
export function cleanTagSet(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw.k !== 'string') continue;
    const k = raw.k.slice(0, 80);
    if (seen.has(k)) continue;
    let e = null;
    if (k.startsWith('c:')) {
      if (!isCode(k.slice(2))) continue;
      e = { k };
      if (str(raw.n, 40)) e.n = str(raw.n, 40);
      if (str(raw.l, 100)) e.l = str(raw.l, 100);
    } else if (k.startsWith('h:')) {
      if (!str(raw.n, 60)) continue;
      e = { k, n: str(raw.n, 60), hd: true };
    } else {
      if (!str(raw.n, 40)) continue;
      e = { k, n: str(raw.n, 40) };
      if (str(raw.l, 100)) e.l = str(raw.l, 100);
      const links = [...new Set((Array.isArray(raw.links) ? raw.links : []).map(String).filter(isCode))].slice(0, 10);
      if (links.length) e.links = links;
    }
    if (typeof raw.p === 'string' && raw.p) e.p = raw.p.slice(0, 80);
    if (raw.hide && !e.hd) e.hide = true;
    seen.add(k);
    out.push(e);
    if (out.length >= MAX_TAGS) break;
  }
  for (const c of ACTIVE) if (!seen.has('c:' + c.code)) { out.push({ k: 'c:' + c.code }); seen.add('c:' + c.code); }
  // built-in subcategories sit under their official parent; other parents must exist and not loop
  const byK = new Map(out.map(e => [e.k, e]));
  for (const e of out) {
    if (e.k.startsWith('c:')) {
      const c = BY_CODE[e.k.slice(2)];
      if (c.parent) e.p = 'c:' + c.parent;
      else if (e.p && !(byK.get(e.p) || {}).hd) delete e.p;   // a top category may only sit under a header
      continue;
    }
    if (e.hd) { delete e.p; continue; }
    if (e.p && (!byK.has(e.p) || e.p === e.k)) delete e.p;
  }
  for (const e of out) {   // break loops
    const path = new Set([e.k]);
    let p = e.p;
    while (p) { if (path.has(p)) { delete e.p; break; } path.add(p); p = (byK.get(p) || {}).p; }
  }
  return out;
}

// The set in effect for these settings.
export const tagSetOf = (settings = {}) => cleanTagSet(Array.isArray(settings.tagSet) && settings.tagSet.length ? settings.tagSet : defaultTagSet(settings));

// A tree: [{ e, kind: 'cat' | 'tag' | 'head', code?, depth, children }] in display order.
export function tagTree(set) {
  const nodes = new Map(set.map(e => [e.k, { e, kind: e.hd ? 'head' : e.k.startsWith('c:') ? 'cat' : 'tag', code: e.k.startsWith('c:') ? e.k.slice(2) : null, children: [] }]));
  const roots = [];
  for (const e of set) {
    const n = nodes.get(e.k);
    const parent = e.p && nodes.get(e.p);
    (parent ? parent.children : roots).push(n);
  }
  const depth = (list, d) => { for (const n of list) { n.depth = d; depth(n.children, d + 1); } };
  depth(roots, 0);
  return roots;
}

// The tree flattened in display order (children after their parent).
export function flatTree(roots) {
  const out = [];
  const walk = list => { for (const n of list) { out.push(n); walk(n.children); } };
  walk(roots);
  return out;
}

// The APMES categories a tag counts towards: its own links, plus its parent's (a category, or a tag's).
export function tagLinks(set, key) {
  const byK = new Map(set.map(e => [e.k, e]));
  const out = new Set();
  let e = byK.get(key);
  const seen = new Set();
  while (e && !seen.has(e.k)) {
    seen.add(e.k);
    if (e.k.startsWith('c:')) { out.add(e.k.slice(2)); break; }
    for (const c of e.links || []) out.add(c);
    e = e.p ? byK.get(e.p) : null;
  }
  return [...out];
}

// Your names for the built-in categories: { code: { n, l } }.
export function userCatNames(set) {
  const out = {};
  for (const e of set) if (e.k.startsWith('c:') && (e.n || e.l)) out[e.k.slice(2)] = { n: e.n || '', l: e.l || '' };
  return out;
}

// A tag's name from its key (your tags; older '26:Interscalene' keys read as 'Interscalene').
export function tagName(set, key) {
  const e = set.find(x => x.k === key);
  if (e && e.n) return e.n;
  const i = String(key).indexOf(':');
  return i >= 0 && !String(key).startsWith('u:') ? String(key).slice(i + 1) : String(key);
}

// ---------- sharing as a CSV file (opens in Excel; human readable) ----------

export const CSV_HEAD = ['Type', 'Tag', 'Long name', 'Under', 'APMES categories', 'Hidden', 'Key'];
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const catRef = code => `${code} ${BY_CODE[code].name}`;

// names(code) -> { pill, long } as shown now (for the built-in rows' default names).
export function tagSetToCsv(set, names = () => ({ pill: '', long: '' })) {
  const byK = new Map(set.map(e => [e.k, e]));
  const label = k => { const e = byK.get(k); if (!e) return ''; return e.n || (e.k.startsWith('c:') ? names(e.k.slice(2)).pill : ''); };
  const rows = [CSV_HEAD];
  for (const n of flatTree(tagTree(set))) {
    const e = n.e;
    const type = n.kind === 'head' ? 'Header' : n.kind === 'cat' ? 'Category' : 'Tag';
    const nm = n.kind === 'cat' ? (e.n || names(n.code).pill) : e.n;
    const long = n.kind === 'cat' ? (e.l || names(n.code).long) : (e.l || '');
    const links = n.kind === 'cat' ? [catRef(n.code)] : (e.links || []).map(catRef);
    rows.push([type, nm, long, e.p ? label(e.p) : '', links.join('; '), e.hide ? 'yes' : '', e.k]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Split CSV text into rows of cells (quotes, doubled quotes, commas and line breaks in quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

// A tag set from a shared CSV: { set, errors: [string], counts: { cats, tags, heads } }. Rows are read by
// the column names, so columns may be moved. Built-in categories are matched by the code at the start
// of "APMES categories" (or the Key); a missing one is kept at the end. "Under" names a row above it
// (by its Tag name, or its Key).
export function tagSetFromCsv(text, names = () => ({ pill: '', long: '' })) {
  const rows = parseCsv(text);
  const errors = [];
  if (!rows.length) return { set: null, errors: ['The file is empty.'], counts: null };
  const head = rows[0].map(c => String(c).trim().toLowerCase());
  const col = name => head.indexOf(name.toLowerCase());
  const ci = { type: col('Type'), tag: col('Tag'), long: col('Long name'), under: col('Under'), links: col('APMES categories'), hidden: col('Hidden'), key: col('Key') };
  if (ci.type < 0 || ci.tag < 0) return { set: null, errors: ['This doesn’t look like a shared tag file (it needs Type and Tag columns).'], counts: null };
  const get = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  const codesIn = s => s.split(/[;\n]+/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(\d{1,2}[ivx]*)\b/i.exec(x);
    const code = m ? m[1].toLowerCase().replace(/^(\d)(?!\d)/, '0$1') : null;
    return code && isCode(code) ? code : { bad: x };
  });
  const set = [], byName = new Map(), keys = new Set();
  const counts = { cats: 0, tags: 0, heads: 0 };
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const type = get(r, ci.type).toLowerCase();
    const name = get(r, ci.tag), long = get(r, ci.long), under = get(r, ci.under), hidden = /^(y|yes|true|1|hidden)$/i.test(get(r, ci.hidden));
    let key = get(r, ci.key);
    const links = codesIn(get(r, ci.links));
    for (const l of links.filter(x => typeof x === 'object')) errors.push(`Row ${line}: “${l.bad}” is not an APMES category`);
    const good = links.filter(x => typeof x === 'string');
    let e;
    if (type.startsWith('cat')) {
      const code = key.startsWith('c:') && isCode(key.slice(2)) ? key.slice(2) : good[0];
      if (!code) { errors.push(`Row ${line}: no APMES category for “${name}”`); return; }
      key = 'c:' + code;
      e = { k: key };
      if (name && name !== names(code).pill) e.n = name;
      if (long && long !== names(code).long) e.l = long;
      counts.cats++;
    } else if (type.startsWith('head')) {
      if (!name) return;
      if (!key.startsWith('h:') || keys.has(key)) key = newKey('h');
      e = { k: key, n: name, hd: true };
      counts.heads++;
    } else if (type.startsWith('tag') || type === '') {
      if (!name) return;
      if (!key || key.startsWith('c:') || key.startsWith('h:') || keys.has(key)) key = newKey('u');
      e = { k: key, n: name };
      if (long) e.l = long;
      if (good.length) e.links = good;
      counts.tags++;
    } else { errors.push(`Row ${line}: unknown type “${get(r, ci.type)}”`); return; }
    if (keys.has(e.k)) { errors.push(`Row ${line}: “${name}” appears twice`); return; }
    if (under) e.p = byName.get(under.toLowerCase()) || (keys.has(under) ? under : `?${under}`);
    if (hidden) e.hide = true;
    keys.add(e.k);
    if (!byName.has((name || '').toLowerCase())) byName.set((name || '').toLowerCase(), e.k);
    set.push(e);
  });
  for (const e of set) if (e.p && e.p.startsWith('?')) { errors.push(`“${e.n || e.k}” is under “${e.p.slice(1)}”, which isn’t above it in the file: put at the top level`); delete e.p; }
  return { set: cleanTagSet(set), errors, counts };
}

// ---------- editing ----------

// The item and everything under it, as a block of keys.
function blockOf(set, key) {
  const keys = new Set([key]);
  let grew = true;
  while (grew) { grew = false; for (const e of set) if (e.p && keys.has(e.p) && !keys.has(e.k)) { keys.add(e.k); grew = true; } }
  return keys;
}

// Move an item (with everything under it) up or down past its neighbour under the same parent.
export function moveTag(set, key, dir) {
  const me = set.find(e => e.k === key);
  if (!me) return set;
  const sibs = set.filter(e => (e.p || '') === (me.p || ''));
  const i = sibs.findIndex(e => e.k === key), j = i + dir;
  if (j < 0 || j >= sibs.length) return set;
  const mine = blockOf(set, key), theirs = blockOf(set, sibs[j].k);
  const rest = set.filter(e => !mine.has(e.k));
  const at = dir < 0 ? rest.findIndex(e => theirs.has(e.k)) : rest.length - [...rest].reverse().findIndex(e => theirs.has(e.k));
  return [...rest.slice(0, at), ...set.filter(e => mine.has(e.k)), ...rest.slice(at)];
}

// Put an item under another (or at the top level with p = ''); it goes to the end of its new siblings.
export function reparentTag(set, key, p) {
  const mine = blockOf(set, key);
  if (p && mine.has(p)) return set;   // not under itself
  const moved = set.filter(e => mine.has(e.k)).map(e => (e.k === key ? { ...e, ...(p ? { p } : {}), ...(p ? {} : { p: undefined }) } : e));
  if (!p) delete moved[0].p;
  const rest = set.filter(e => !mine.has(e.k));
  let at = rest.length;
  if (p) { const under = blockOf(rest, p); at = Math.max(...rest.map((e, i) => (under.has(e.k) ? i : -1))) + 1; }
  return cleanTagSet([...rest.slice(0, at), ...moved, ...rest.slice(at)]);
}

// Remove your tag or a header; what sat under it moves up to its parent. Built-in categories stay.
export function removeTag(set, key) {
  const me = set.find(e => e.k === key);
  if (!me || me.k.startsWith('c:')) return set;
  return cleanTagSet(set.filter(e => e.k !== key).map(e => (e.p === key ? { ...e, p: me.p } : e)));
}
