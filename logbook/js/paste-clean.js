// Paste cleaner for Notes: rich text copied from a web page, Word, Google Docs, OneNote or UpNote arrives as HTML;
// htmlToMarkdown() turns it into the light Markdown the notes use (headings, **bold**, *italic*, lists, to-dos, links,
// simple tables), dropping styles, spans and stray spaces. tidyMarkdown() tidies text that is already Markdown
// (the "Clean up" action in the note editor): stray \ escapes, double spaces, ** around nothing, broken bullets.
// Pure (no DOM), tested in test/paste-clean.test.mjs. The HTML is only read as text, never put into the page.

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…', mdash: '—', ndash: '–', lsquo: "'", rsquo: "'",
  ldquo: '"', rdquo: '"', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', micro: 'µ', copy: '©', reg: '®', trade: '™',
  frac12: '½', frac14: '¼', frac34: '¾', le: '≤', ge: '≥', rarr: '→', larr: '←', uarr: '↑', darr: '↓', shy: '',
};
export function decodeEntities(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; } catch { return ''; }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v == null ? m : v;
  });
}
// curly quotes to straight ones, no-break and odd spaces to plain spaces, invisible characters gone
export const normaliseChars = s => String(s || '')
  .replace(/[\u2018\u2019\u201a\u201b\u2032]/g, "'").replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
  .replace(/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/g, ' ').replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, '');

const BLOCK2 = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'blockquote', 'pre', 'hr', 'figure', 'dl']);
const BLOCK1 = new Set(['div', 'li', 'tr', 'section', 'article', 'header', 'footer', 'dt', 'dd', 'caption', 'address']);
const SKIP = /<(script|style|head|title|template|noscript|svg|xml)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const attr = (attrs, name) => {
  const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(attrs || '');
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const safeLink = href => (/^(https?:|mailto:)/i.test(String(href || '').trim()) ? String(href).trim() : '');

export function htmlToMarkdown(html) {
  let src = String(html || '');
  // what the clipboard wraps around the copied part (Windows), comments and everything that isn't text
  const frag = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i.exec(src);
  if (frag) src = frag[1];
  src = src.replace(/<!--[\s\S]*?-->/g, '').replace(SKIP, '').replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '');
  let out = '';
  const marks = [];        // open bold / italic: { mark, opened }
  const lists = [];        // { ordered, n }
  const links = [];        // { at, href }
  let pre = 0, table = null, quote = 0;
  const tail = () => /\n*$/.exec(out)[0].length;
  const brk = n => {
    if (table && table.cell) { if (!/ $/.test(out)) out += ' '; return; }
    // a list item's own "- " stays on the line its text goes on (<li><p>text</p></li>)
    if (/(^|\n) *(?:- |\d+\. )(?:\[[ x]\] )?$/.test(out)) return;
    out = out.replace(/[ \t]+$/, '');
    if (!out) return;
    const have = tail();
    if (have < n) out += '\n'.repeat(n - have);
  };
  const lineStart = () => !out || /\n$/.test(out);
  // a bold or italic mark is written just before its first visible character, and closed before any trailing
  // spaces, so there is never "** **" or "**word **"
  const openPending = () => { for (const m of marks) if (!m.opened) { out += m.mark; m.opened = true; } };
  const text = t => {
    if (!pre) t = t.replace(/[\s\u00a0]+/g, ' ');
    if (!t) return;
    if (!pre && lineStart()) t = t.replace(/^ +/, '');
    if (!pre && / $/.test(out) && /^ /.test(t)) t = t.slice(1);
    if (!t) return;
    const lead = /^ */.exec(t)[0];
    if (lead.length === t.length) { out += t; return; }
    out += lead; openPending(); out += t.slice(lead.length);
  };
  const closeMark = mark => {
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i].mark !== mark) continue;
      const [m] = marks.splice(i, 1);
      if (m.opened) {
        const sp = / *$/.exec(out)[0];
        out = out.slice(0, out.length - sp.length) + mark + sp;
      }
      return;
    }
  };
  const styleMarks = (tag, attrs) => {
    const style = (attr(attrs, 'style') || '').toLowerCase();
    const w = /font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(style), normal = /font-weight\s*:\s*(normal|[1-4]00)/.test(style);
    const it = /font-style\s*:\s*italic/.test(style);
    const out = [];
    // Google Docs wraps the whole copy in <b style="font-weight:normal">: not bold
    if (((tag === 'b' || tag === 'strong') && !normal) || w) out.push('**');
    if (tag === 'i' || tag === 'em' || it) out.push('*');
    return out;
  };
  const stack = [];        // per open element: the marks it opened
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
  for (const m of src.matchAll(re)) {
    if (m[4] != null || m[5] != null) { text(decodeEntities(m[4] ?? m[5])); continue; }
    if (m[2].includes(':')) continue;   // Word's own tags (<o:p>, <w:…>)
    const close = !!m[1], tag = m[2].toLowerCase(), attrs = m[3] || '';
    const selfClose = /\/\s*$/.test(attrs);
    if (tag === 'br') { if (table && table.cell) out += ' '; else { out = out.replace(/ +$/, ''); out += '\n'; } continue; }
    if (tag === 'img' || tag === 'meta' || tag === 'link' || tag === 'wbr' || tag === 'col') continue;
    if (tag === 'input') {
      // a to-do box: "- [ ] " (inside a list item it follows the item's "- ")
      if (/type\s*=\s*["']?checkbox/i.test(attrs)) out += (lineStart() ? '- ' : /\s$/.test(out) ? '' : ' ') + (/\bchecked\b/i.test(attrs) ? '[x] ' : '[ ] ');
      continue;
    }
    if (!close) {
      if (/^h[1-6]$/.test(tag)) { brk(2); out += '#'.repeat(Math.min(3, Number(tag[1]))) + ' '; }
      else if (tag === 'ul' || tag === 'ol') { if (!lists.length) brk(2); else brk(1); const st = parseInt(attr(attrs, 'start'), 10); lists.push({ ordered: tag === 'ol', n: st > 0 ? st - 1 : 0 }); }
      else if (tag === 'li') {
        brk(1);
        const l = lists[lists.length - 1] || { ordered: false, n: 0 };
        out += '  '.repeat(Math.max(0, lists.length - 1)) + (l.ordered ? `${++l.n}. ` : '- ');
      } else if (tag === 'table') { brk(2); table = { rows: 0, cells: 0, cell: false, prev: table }; }
      else if (tag === 'tr' && table) { brk(1); out += '|'; table.cells = 0; }
      else if ((tag === 'td' || tag === 'th') && table) { out += ' '; table.cell = true; table.cells++; }
      else if (tag === 'pre') { brk(2); pre++; }
      else if (tag === 'blockquote') { brk(2); quote++; }
      else if (tag === 'hr') { brk(2); out += '---'; brk(2); }
      else if (BLOCK2.has(tag)) brk(2);
      else if (BLOCK1.has(tag)) brk(1);
      if (tag === 'a') links.push({ at: out.length, href: safeLink(attr(attrs, 'href')), marks: marks.length });
      const opened = styleMarks(tag, attrs);
      for (const mk of opened) marks.push({ mark: mk, opened: false });
      if (!selfClose) stack.push({ tag, opened });
      continue;
    }
    // closing tag: close what the matching opening tag opened
    let i = stack.length - 1;
    while (i >= 0 && stack[i].tag !== tag) i--;
    if (i < 0) continue;
    const closing = stack.splice(i);
    for (const el of closing.reverse()) {
      for (const mk of [...el.opened].reverse()) closeMark(mk);
      const t = el.tag;
      if (t === 'a') {
        const l = links.pop();
        if (l) {
          const inner = out.slice(l.at), label = inner.trim();
          if (l.href && label && label !== l.href && !/\n/.test(label)) out = out.slice(0, l.at) + inner.replace(label, `[${label.replace(/[[\]*]/g, '')}](${l.href})`);
          else if (l.href && !label) out += l.href;
        }
      } else if (t === 'ul' || t === 'ol') { lists.pop(); brk(lists.length ? 1 : 2); }
      else if ((t === 'td' || t === 'th') && table) { out = out.replace(/ +$/, '') + ' |'; table.cell = false; }
      else if (t === 'tr' && table) {
        table.rows++;
        if (table.rows === 1 && table.cells) out += '\n|' + ' --- |'.repeat(table.cells);
        brk(1);
      } else if (t === 'table' && table) { table = table.prev; brk(2); }
      else if (t === 'pre') { pre = Math.max(0, pre - 1); brk(2); }
      else if (t === 'blockquote') { quote = Math.max(0, quote - 1); brk(2); }
      else if (/^h[1-6]$/.test(t) || BLOCK2.has(t)) brk(2);
      else if (BLOCK1.has(t)) brk(1);
    }
  }
  return tidyMarkdown(out);
}

// Tidy Markdown that is already in the note (or just converted). Changes only what is clearly a leftover.
export function tidyMarkdown(md) {
  let s = normaliseChars(String(md || '').replace(/\r\n?/g, '\n'));
  s = s.split('\n').map(line => {
    let l = line.replace(/\s+$/, '');
    // escapes some exports add (UpNote, Notion, OneNote via converters): 1\. \- \* \# \[ … become plain
    l = l.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1');
    // bullets typed or pasted as symbols, and to-do boxes as symbols
    l = l.replace(/^(\s*)[☐□]\s*/, '$1- [ ] ').replace(/^(\s*)[☑☒✅✓✔]\s+/, '$1- [x] ')
      .replace(/^(\s*)[•·◦▪▫●○■➢►‣⁃]\s*/, '$1- ')
      .replace(/^(\s*)([-*+])\s*\[\s?\]\s*/, '$1$2 [ ] ').replace(/^(\s*)([-*+])\s*\[[xX]\]\s*/, '$1$2 [x] ');
    // ** or __ around nothing, and marks with the spaces inside them moved out
    l = l.replace(/\*\*(\s*)\*\*/g, '$1').replace(/__(\s*)__/g, '$1')
      .replace(/\*\*(\s+)([^\s*](?:[^*\n]*[^\s*])?)\*\*/g, '$1**$2**')
      .replace(/\*\*([^\s*](?:[^*\n]*[^\s*])?)(\s+)\*\*/g, '**$1**$2');
    // double spaces inside the line; the indent of a nested list stays (spaces moved out of a mark don't make one)
    const indent = /^\s*/.exec(line.trimEnd())[0];
    return indent + l.trimStart().replace(/ {2,}/g, ' ');
  }).join('\n');
  // a list broken up by blank lines (loose lists from some exports) becomes one list
  const isItem = l => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l);
  const lines = s.split('\n'), keep = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() && keep.length && isItem(keep[keep.length - 1])) {
      let j = i; while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && isItem(lines[j])) { i = j - 1; continue; }
    }
    keep.push(lines[i]);
  }
  return keep.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
}
