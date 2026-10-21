// The chooser for something shared to the app (#share): add it as case(s) (the Add tab's paste-a-list, as a plain
// text share always did), add it to today's note, or start a new note with it. Files shared always come here; text
// does when Settings → Notes → Ask what to do with shared text is on. share-in.js has the plumbing.
import { h, hooks, toast, todayISO } from './ui-core.js';
import { peekShared, popShared, sharedFiles, shareState } from './share-in.js';
import { openDayNote, openNotes } from './ui-notepad.js';
import { takeShared } from './ui-log.js';

export function renderShare() {
  const text = peekShared(), files = sharedFiles();
  shareState.seen = true;
  if (!text.trim()) {
    return h('section', { class: 'card share-in' }, h('h2', {}, 'Shared with the app'),
      h('p', { class: 'hint' }, 'Nothing waiting: it has been added already, or the share was empty.'),
      h('div', { class: 'bar' }, h('a', { class: 'btn', href: '#log' }, 'Add tab'), h('a', { class: 'btn', href: '#notes' }, 'Notes')));
  }
  const lines = text.split('\n').length;
  const asCases = () => { takeShared(true); hooks.navigate('log'); };
  // the text leaves the inbox only once the note has it (left elsewhere meanwhile, or no room: it's still here)
  const toToday = () => openDayNote(todayISO(), { append: text }).then(ok => { if (ok) popShared(); });
  const asNote = () => openNotes({ create: true, body: text, fromShare: true });
  const discard = () => { popShared(); toast('Shared text discarded'); hooks.navigate('log'); };
  return h('section', { class: 'card share-in' },
    h('h2', {}, 'Shared with the app'),
    h('p', { class: 'hint', style: 'margin:0 0 6px' }, `${lines} line${lines === 1 ? '' : 's'}${files ? ` from ${files} file${files === 1 ? '' : 's'}` : ''}. Where should it go?`),
    h('pre', { class: 'share-preview', tabindex: '0', 'aria-label': 'What was shared' }, text.length > 1200 ? text.slice(0, 1200) + '…' : text),
    h('div', { class: 'share-choices' },
      h('button', { class: 'primary', type: 'button', onclick: asCases }, 'Add as case(s)'),
      h('button', { type: 'button', onclick: toToday }, 'Add to today’s note'),
      h('button', { type: 'button', onclick: asNote }, 'New note')),
    h('p', { class: 'hint help', style: 'margin:8px 0 0' }, 'As cases: it opens in Paste list on the Add tab to check before saving. Notes stay private.'),
    h('p', { class: 'reset-row' }, h('button', { class: 'small linkish', type: 'button', onclick: discard }, 'Discard')));
}
