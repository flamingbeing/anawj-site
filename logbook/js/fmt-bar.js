// Formatting buttons above a text box: they write a little Markdown into it (**bold**, "- " bullets, "1. " numbers;
// the full bar adds *italic*, # headings, "- [ ] " to-dos, [links](…) and Undo). Used by the reflection editor
// (three buttons; Settings → Reflections) and the note editor (full bar; Settings → Notes). Changes go through the
// browser's own editing (execCommand insertText) where it can, so Undo, Ctrl+Z and the box's input handlers all work.
import { h } from './ui-core.js';

// put text in place of [a, b) and select [sa, sb)
export function replaceRange(ta, a, b, text, sa = a + text.length, sb = sa) {
  ta.focus();
  ta.setSelectionRange(a, b);
  let ok = false;
  try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
  if (!ok) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  ta.setSelectionRange(sa, sb);
}

export function fmtBar(ta, { full = false } = {}) {
  const sel = () => {
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    const ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b) < 0 ? v.length : v.indexOf('\n', b);
    return { a, b, v, ls, le };
  };
  const wrap = mark => {
    const { a, b, v } = sel(), n = mark.length;
    if (a === b) return replaceRange(ta, a, b, mark + mark, a + n);
    // already wrapped: take the marks off
    if (v.slice(a - n, a) === mark && v.slice(b, b + n) === mark && (n > 1 || (v[a - 2] !== '*' && v[b + 1] !== '*'))) return replaceRange(ta, a - n, b + n, v.slice(a, b), a - n, b - n);
    replaceRange(ta, a, b, mark + v.slice(a, b) + mark, a + n, b + n);
  };
  // every line of the selection gets the prefix, or loses it when all have it already
  const prefix = (has, add) => {
    const { v, ls, le } = sel();
    const block = v.slice(ls, le).split('\n');
    const done = block.every(l => has.test(l));
    const out = block.map((l, i) => (done ? l.replace(has, '') : add(i) + l.replace(/^(\d+\.|[-*+](\s\[[ xX]\])?|#{1,3})\s/, ''))).join('\n');
    replaceRange(ta, ls, le, out, ls, ls + out.length);
  };
  const link = () => {
    const { a, b, v } = sel(), t = v.slice(a, b);
    if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return replaceRange(ta, a, b, `[link](${t})`, a + 1, a + 5);
    const label = t || 'link', text = `[${label}](https://)`;
    replaceRange(ta, a, b, text, a + label.length + 3, a + text.length - 1);   // the address part, ready to paste over
  };
  const undo = () => { ta.focus(); try { document.execCommand('undo'); } catch { /* not supported */ } };
  const btn = (label, aria, fn) => h('button', { type: 'button', class: 'small', 'aria-label': aria, title: aria, onmousedown: e => e.preventDefault(), onclick: fn }, label);
  const bullets = () => prefix(/^[-*+]\s(?!\[[ xX]\])/, () => '- ');
  const numbers = () => prefix(/^\d+\.\s/, i => `${i + 1}. `);
  if (!full) {
    return h('div', { class: 'fmt-bar', role: 'toolbar', 'aria-label': 'Formatting' },
      btn(h('b', {}, 'B'), 'Bold', () => wrap('**')), btn('• List', 'Bullet list', bullets), btn('1. List', 'Numbered list', numbers));
  }
  return h('div', { class: 'fmt-bar fmt-full', role: 'toolbar', 'aria-label': 'Formatting' },
    btn(h('b', {}, 'B'), 'Bold', () => wrap('**')), btn(h('i', {}, 'I'), 'Italic', () => wrap('*')),
    btn('H', 'Heading', () => prefix(/^#{1,3}\s/, () => '# ')), btn('•', 'Bullet list', bullets), btn('1.', 'Numbered list', numbers),
    btn('☐', 'To-do', () => prefix(/^[-*+]\s\[[ xX]\]\s/, () => '- [ ] ')), btn('Link', 'Link', link), btn('↶', 'Undo', undo));
}
