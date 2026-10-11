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

// ---------- sharing as a CSV file (opens in Excel; meant to be edited by hand) ----------
//
// One row per item, in list order. Type is APMES (a built-in category), Personal (your own tag) or Header.
// Under names the row it sits under, by its Name. "APMES categories" says which category an APMES row is,
// or what a Personal tag counts towards ("26 Peripheral nerve blocks; 18"; the number is enough).
// ID is how a re-loaded file keeps your cases linked to your tags: leave it as is, blank for new rows.

export const CSV_HEAD = ['Type', 'Name', 'Full name', 'Under', 'APMES categories', 'Hidden', 'ID'];
// older and hand-typed column names
const COLS = {
  type: ['type', 'kind'],
  name: ['name', 'tag', 'pill', 'short name'],
  long: ['full name', 'long name', 'full'],
  under: ['under', 'parent', 'sits under'],
  links: ['apmes categories', 'apmes category', 'apmes', 'counts towards', 'categories', 'category', 'code', 'codes'],
  hidden: ['hidden', 'hide'],
  key: ['id', 'key'],
};
const TYPE_OUT = { cat: 'APMES', tag: 'Personal', head: 'Header' };
const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const catRef = code => `${code} ${BY_CODE[code].name}`;
const norm = s => String(s ?? '').toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim();

// names(code) -> { pill, long } as shown now (for the built-in rows' default names).
export function tagSetToCsv(set, names = () => ({ pill: '', long: '' })) {
  const byK = new Map(set.map(e => [e.k, e]));
  const label = k => { const e = byK.get(k); if (!e) return ''; return e.n || (e.k.startsWith('c:') ? names(e.k.slice(2)).pill : ''); };
  const rows = [CSV_HEAD];
  for (const n of flatTree(tagTree(set))) {
    const e = n.e;
    const nm = n.kind === 'cat' ? (e.n || names(n.code).pill) : e.n;
    const long = n.kind === 'cat' ? (e.l || names(n.code).long) : n.kind === 'head' ? '' : (e.l || '');
    const links = n.kind === 'cat' ? [catRef(n.code)] : (e.links || []).map(catRef);
    rows.push([TYPE_OUT[n.kind], nm, long, e.p ? label(e.p) : '', links.join('; '), n.kind === 'head' ? '' : e.hide ? 'yes' : 'no', e.k]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// Split CSV text into rows of cells (quotes, doubled quotes, separators and line breaks in quotes).
// The separator is a comma, or a semicolon or tab when the first line uses those (Excel in some regions).
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/, 1)[0] || '';
  const count = ch => first.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((x, y) => count(y) - count(x))[0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}

// A tag set from a CSV, forgiving of hand edits:
//   { set, errors, notes, counts: { cats, tags, heads }, missing: [codes], dropped: [names] }
// errors: rows or values that were skipped or changed; notes: the APMES categories not in the file
// (added at the end) and your tags not in it (taken off the list; cases keep them).
// Columns are found by name (any order, old names too, extra columns ignored; the header row may sit
// below a title). APMES categories match by number, or by the official, programme or your own name.
// Under matches a Name anywhere in the file (or an APMES number). Personal rows without a known ID
// take the ID of your tag with the same name, so your cases stay linked.
// names(code) -> { pill, long } (programme names); current = your tag set now.
export function tagSetFromCsv(text, names = () => ({ pill: '', long: '' }), current = []) {
  const rows = parseCsv(text);
  const errors = [], notes = [];
  const fail = msg => ({ set: null, errors: [msg], notes: [], counts: null, missing: [], dropped: [] });
  if (!rows.length) return fail('The file is empty.');
  const find = r => {
    const head = r.map(norm);
    const ix = list => head.findIndex(c => list.includes(c));
    return Object.fromEntries(Object.entries(COLS).map(([k, list]) => [k, ix(list)]));
  };
  const hr = rows.slice(0, 10).findIndex(r => { const ci = find(r); return ci.name >= 0 && (ci.type >= 0 || ci.links >= 0); });
  if (hr < 0) return fail('This doesn’t look like a tag file: it needs a Name column, and a Type or APMES categories column.');
  const ci = find(rows[hr]);
  const get = (r, i) => (i >= 0 ? String(r[i] ?? '').replace(/\s+/g, ' ').trim() : '');

  // APMES category from a code ("26", "26i", "8", "26) ...") or a name
  const byName = new Map();
  const addName = (nm, code) => { const k = norm(nm); if (k && !byName.has(k)) byName.set(k, code); };
  for (const c of ACTIVE) {
    addName(c.name, c.code); addName(c.full, c.code); addName(names(c.code).pill, c.code); addName(names(c.code).long, c.code);
    addName(c.label, c.code); addName(catRef(c.code), c.code);
  }
  for (const e of current || []) if (e.k && e.k.startsWith('c:') && isCode(e.k.slice(2))) { addName(e.n, e.k.slice(2)); addName(e.l, e.k.slice(2)); }
  const codeOf = x => {
    const m = /^(\d{1,2}[a-z]?)(?=$|[\s).:\-–])/i.exec(x);
    if (m) { const code = m[1].toLowerCase().replace(/^(\d)(?!\d)/, '0$1'); if (isCode(code)) return code; }
    return byName.get(norm(x)) || null;
  };
  const codesIn = s => s.split(/[;\n|]+/).map(x => x.trim()).filter(Boolean).map(x => codeOf(x) || { bad: x });

  // your current tags, to keep their IDs
  const mine = (current || []).filter(e => e && e.k && !e.k.startsWith('c:') && !e.hd);
  const mineKeys = new Set(mine.map(e => e.k));
  const mineByName = new Map();
  for (const e of mine) if (!mineByName.has(norm(e.n))) mineByName.set(norm(e.n), e.k);
  const heads = (current || []).filter(e => e && e.hd);

  const set = [], keys = new Set(), unders = [];
  const counts = { cats: 0, tags: 0, heads: 0 };
  rows.slice(hr + 1).forEach((r, i) => {
    const line = hr + i + 2;
    const rawType = get(r, ci.type), t = norm(rawType);
    const name = get(r, ci.name), long = get(r, ci.long), under = get(r, ci.under);
    const hidden = /^(y|yes|true|1|hidden|x|✓)$/i.test(get(r, ci.hidden));
    let key = get(r, ci.key);
    const links = codesIn(get(r, ci.links));
    const good = [...new Set(links.filter(x => typeof x === 'string'))];
    const bad = links.filter(x => typeof x === 'object').map(x => x.bad);
    let kind = /^(apmes|cat|built)/.test(t) ? 'cat' : /^(head|section)/.test(t) ? 'head' : /^(personal|tag|own|my|)$/.test(t) || t.startsWith('personal') || t.startsWith('tag') ? 'tag' : null;
    if (!kind) { errors.push(`Row ${line}: Type “${rawType}” isn’t APMES, Personal or Header, so it was read as Personal`); kind = 'tag'; }
    let e;
    if (kind === 'cat') {
      const code = (key.startsWith('c:') && isCode(key.slice(2)) && key.slice(2)) || good[0] || codeOf(name);
      if (!code) { errors.push(`Row ${line}: “${name || rawType}” is marked APMES but no APMES category was recognised, so it was skipped`); return; }
      if (keys.has('c:' + code)) { errors.push(`Row ${line}: APMES category ${catRef(code)} appears twice; the later row was skipped`); return; }
      e = { k: 'c:' + code };
      if (name && name !== names(code).pill) e.n = name;
      if (long && long !== names(code).long) e.l = long;
      counts.cats++;
    } else if (kind === 'head') {
      if (!name) return;
      if (!key.startsWith('h:') || keys.has(key)) key = (heads.find(x => norm(x.n) === norm(name) && !keys.has(x.k)) || {}).k || newKey('h');
      e = { k: key, n: name, hd: true };
      counts.heads++;
    } else {
      if (!name) { if (good.length || long) errors.push(`Row ${line}: no Name, so it was skipped`); return; }
      if (!mineKeys.has(key) || keys.has(key)) {
        const same = mineByName.get(norm(name));
        key = same && !keys.has(same) ? same : (key && !key.startsWith('c:') && !key.startsWith('h:') && !keys.has(key) && /^[\w:]{3,80}$/.test(key) ? key : newKey('u'));
      }
      e = { k: key, n: name };
      if (long) e.l = long;
      if (good.length) e.links = good.slice(0, 10);
      counts.tags++;
    }
    for (const x of bad) errors.push(`Row ${line}: “${x}” isn’t an APMES category, so it was left out`);
    if (under) unders.push([e, under, line]);
    if (hidden && kind !== 'head') e.hide = true;
    keys.add(e.k);
    set.push(e);
  });
  // Under: a Name anywhere in the file (first match), an APMES number or name, or an ID
  const nameKey = new Map();
  for (const e of set) {
    const nms = e.k.startsWith('c:') ? [e.n, names(e.k.slice(2)).pill, names(e.k.slice(2)).long] : [e.n];
    for (const n of nms) if (n && !nameKey.has(norm(n))) nameKey.set(norm(n), e.k);
  }
  for (const [e, under, line] of unders) {
    const code = codeOf(under);
    const p = nameKey.get(norm(under)) || (code && keys.has('c:' + code) ? 'c:' + code : null) || (keys.has(under) ? under : null);
    if (!p || p === e.k) errors.push(`Row ${line}: “${e.n || catRef(e.k.slice(2))}” is under “${under}”, which isn’t in the file, so it was put at the top level`);
    else e.p = p;
  }
  const missing = ACTIVE.filter(c => !keys.has('c:' + c.code)).map(c => c.code);
  if (missing.length) notes.push(`${missing.length} APMES categor${missing.length === 1 ? 'y isn’t' : 'ies aren’t'} in the file, so ${missing.length === 1 ? 'it goes' : 'they go'} at the end of the list: ${missing.map(catRef).join(', ')}`);
  const dropped = mine.filter(x => !keys.has(x.k)).map(x => x.n);
  if (dropped.length) notes.push(`${dropped.length} of your tags ${dropped.length === 1 ? 'isn’t' : 'aren’t'} in the file, so ${dropped.length === 1 ? 'it comes' : 'they come'} off the list (cases keep them): ${dropped.join(', ')}`);
  return { set: cleanTagSet(set), errors, notes, counts, missing, dropped };
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

// Can the item sit under p ('' = the top level)? Built-in subcategories stay under their official
// parent; other categories go at the top or under a header; headers only at the top; your tags anywhere
// but under themselves.
export function canPlace(set, key, p) {
  const me = set.find(e => e.k === key);
  if (!me) return false;
  const target = p ? set.find(e => e.k === p) : null;
  if (p && !target) return false;
  if (me.k.startsWith('c:')) {
    const c = BY_CODE[me.k.slice(2)];
    if (c.parent) return p === 'c:' + c.parent;
    return !p || !!target.hd;
  }
  if (me.hd) return !p;
  return !p || !blockOf(set, key).has(p);
}

// Drag and drop in the editor: put the item (with everything under it) before or after another item, as
// its sibling, or inside it (as its last child). Returns the set unchanged when that isn't allowed.
export function dropTag(set, key, target, where) {
  if (key === target) return set;
  const t = set.find(e => e.k === target);
  if (!t) return set;
  const p = where === 'inside' ? target : (t.p || '');
  if (!canPlace(set, key, p)) return set;
  const mine = blockOf(set, key);
  if (mine.has(target)) return set;
  const moved = set.filter(e => mine.has(e.k)).map(e => (e.k === key ? (() => { const x = { ...e }; if (p) x.p = p; else delete x.p; return x; })() : e));
  const rest = set.filter(e => !mine.has(e.k));
  const theirs = blockOf(rest, target);
  const idx = rest.map((e, i) => (theirs.has(e.k) ? i : -1)).filter(i => i >= 0);
  const at = where === 'before' ? idx[0] : idx[idx.length - 1] + 1;
  return cleanTagSet([...rest.slice(0, at), ...moved, ...rest.slice(at)]);
}
