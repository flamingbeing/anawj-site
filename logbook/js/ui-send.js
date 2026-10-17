// Send to… (Logbook tab: a day or a case; Settings → Send to): open the text in another app by a link, so it
// goes to Obsidian, WhatsApp, UpNote or anything with a link. The destinations are in destinations.js.
// Nothing is sent without a tap, and what is sent is remembered per device (fingerprints only).

import { S, h, toast, modal, confirmBox, settings, patchLogbook, okNoIds } from './ui-core.js';
import { PRESETS, cleanDestinations, cleanDestination, sendLink, linkHost, linkOk, markSent, sentState, cleanLedger, MAX_DESTINATIONS } from './destinations.js';
import { copyText } from './share.js';

export const destinations = () => cleanDestinations(settings().destinations);

// the ledger of what was sent from this device, per signed-in account
const ledgerKey = () => 'apmes-logbook-sent:' + String((S.user && S.user.email) || (S.logbook && S.logbook.email) || 'local').toLowerCase();
// (places removed since are dropped, so they never crowd out the ones in use)
const readLedger = () => { try { return cleanLedger(JSON.parse(localStorage.getItem(ledgerKey()) || '{}'), destinations().map(d => d.id)); } catch { return {}; } };
const writeLedger = l => { try { localStorage.setItem(ledgerKey(), JSON.stringify(l)); } catch { /* storage blocked: the app still works, it just forgets */ } };

// open a link: a home-screen app opens another app by a plain navigation; web links open in a new tab
function openLink(url) {
  const a = document.createElement('a');
  a.href = url;
  if (/^https?:/i.test(url)) { a.target = '_blank'; a.rel = 'noopener'; }
  document.body.append(a); a.click(); a.remove();
}

async function sendTo(dest, { text, title, date, fileDate }) {
  if (!(await okNoIds(text))) return false;
  const { url, tooLong } = sendLink(dest, { content: text, title, date, fileDate });
  if (tooLong) {
    if (!(await copyText(text, 'Copied: paste it in the app'))) return false;
  }
  openLink(url);
  if (date) writeLedger(markSent(readLedger(), dest.id, date, text));
  return true;
}

// Send… for a day (date given: remembers what was sent) or a case. `text` is the Markdown to send.
// fileDate: a case's day, for the file name only
export function openSend({ text, title = 'Logbook', date = '', fileDate = '' }) {
  const list = destinations();
  if (!list.length) {
    toast('No place to send to yet', { action: 'Set up', onaction: () => { location.hash = '#sendto'; } });
    return;
  }
  const ledger = readLedger();
  const m = modal('Send to…', h('div', { class: 'row-menu-list' },
    list.map(d => {
      const st = date ? sentState(ledger, d.id, date, text) : 'new';
      return h('button', { onclick: async () => { if (await sendTo(d, { text, title, date, fileDate })) m.close(); } },
        d.name, ' ', h('small', { class: 'hint' }, st === 'same' ? 'sent, unchanged' : st === 'changed' ? 'changed since sent' : linkHost(d.uri)));
    }),
    h('button', { class: 'linkish', onclick: () => { m.close(); location.hash = '#sendto'; } }, 'Set up places to send to'),
    h('button', { class: 'linkish', onclick: () => m.close() }, 'Cancel')));
}

// the hosts a settings file would add, for the import question
export const destinationHosts = list => [...new Set(cleanDestinations(list).map(d => `${d.name} (${linkHost(d.uri)})`))];

// Settings → Send to
export function renderSendSettings() {
  let list = destinations().map(d => ({ ...d }));
  const box = h('div', {});
  const field = (d, k, label, hint, attrs = {}) => h('label', { class: 'field', style: 'margin-top:8px' }, label,
    h('input', { type: 'text', value: d[k], spellcheck: 'false', autocapitalize: 'off', 'aria-label': label, oninput: e => { d[k] = e.target.value; }, ...attrs }),
    hint ? h('span', { class: 'hint help' }, hint) : null);
  const draw = () => box.replaceChildren(...list.map((d, i) => h('div', { class: 'card', style: 'margin:10px 0;box-shadow:none;border:1px solid var(--line, #ccc)' },
    field(d, 'name', 'Name'),
    field(d, 'uri', 'Link', 'Put {content} where the text goes. Also {title}, {file} and {date}. The text is sent to whatever this link opens.', { style: 'font-family:ui-monospace,Menlo,Consolas,monospace' }),
    field(d, 'fileName', 'File name', 'For apps that make a file, like {date} or Logbook/{date}.'),
    h('div', { class: 'bar', style: 'margin:10px 0 0' },
      h('button', { class: 'small', onclick: () => {
        const c = cleanDestination(d);
        if (!c) return toast('Needs a name and a link with {content} in it');
        openLink(sendLink(c, { content: 'Test from the Logbook', title: 'Test', date: 'test' }).url);
      } }, 'Try it'),
      h('span', { class: 'grow' }),
      h('button', { class: 'small linkish', onclick: () => { list.splice(i, 1); draw(); } }, 'Remove')))));
  draw();
  const add = id => {
    if (list.length >= MAX_DESTINATIONS) return toast('That is the most places to send to');
    const p = PRESETS.find(x => x.id === id);
    list.push({ id: Math.random().toString(36).slice(2, 8), name: p.name, uri: p.uri, fileName: p.fileName, mode: p.mode });
    draw(); toast(p.hint);
  };
  const save = async () => {
    const bad = list.filter(d => !cleanDestination(d));
    if (bad.length) return toast('Each place needs a name and a link with {content} in it' + (bad.some(d => d.uri && !linkOk(d.uri) && /^\s*(javascript|data|vbscript|file|blob|intent):/i.test(d.uri)) ? ' (that kind of link is not allowed)' : ''));
    await patchLogbook({ settings: { destinations: list.length ? cleanDestinations(list) : null } });
    toast('Saved');
  };
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Send to'),
      h('p', { class: 'hint help', style: 'margin:0' }, 'Places you can send a day or a case: Obsidian, WhatsApp, Apple Notes, Email, Telegram, Drafts, Bear, Things, Day One, UpNote, or any app that opens from a link. A Send button then appears on the Logbook tab. Nothing is sent until you tap.'),
      h('p', { class: 'hint' }, 'The text goes to the app the link opens. The case text holds your case details: keep it de-identified, and check hospital policy before sending it to cloud notes or chat apps.'),
      h('p', { class: 'hint' }, 'Only add a link you trust, and look at where it goes before using a link someone gave you. The layout of the text is under Settings → Markdown.'),
      h('p', { class: 'hint' }, 'To keep a file per day in Google Drive, Dropbox or GitHub, updated when you tap Sync: ', h('a', { href: '#sync' }, 'Settings → Sync'), '.'),
      box,
      h('details', { class: 'fold help send-help' }, h('summary', {}, 'Apple Notes on an iPhone'),
        h('p', { class: 'hint' }, 'Apple Notes can’t be opened with text from a link, so a small Shortcut does it, once set up:'),
        h('ol', { class: 'hint' },
          h('li', {}, 'Open the Shortcuts app and tap + to make a new shortcut.'),
          h('li', {}, 'Add the action “Create Note” (Notes), and set its text to “Shortcut Input”.'),
          h('li', {}, 'Name the shortcut exactly “Logbook to Notes”.'),
          h('li', {}, 'Here, Add → Apple Notes, Save, then Try it.'))),
      h('p', { class: 'hint' }, 'Google Keep, Notion and OneNote have no link that takes text: use Share on the Logbook tab instead and pick the app.'),
      h('div', { class: 'bar', style: 'margin:10px 0 0' },
        h('label', { class: 'field', style: 'margin:0' }, 'Add',
          h('select', { 'aria-label': 'Add a place to send to', onchange: e => { const v = e.target.value; e.target.value = ''; if (v) add(v); } },
            h('option', { value: '' }, 'Choose…'), PRESETS.map(p => h('option', { value: p.id }, p.name)))),
        h('span', { class: 'grow' }),
        h('button', { class: 'primary', onclick: save }, 'Save'))));
}
