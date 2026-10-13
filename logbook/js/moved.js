// The old address (anawj.com/logbook/) with logbook choices saved in this browser: say where the logbook is now and offer
// this browser's choices as a file first (Settings -> Settings file at the new address loads it). index.html sets
// window.LOGBOOK_MOVED_TO only then; with nothing saved the old address just forwards.
import { h, download, todayISO } from './ui-core.js';
import { deviceFile } from './settings-file.js';

export function movedPage(to) {
  const go = () => { try { localStorage.setItem('apmes-logbook-moved', '1'); } catch { /* no storage */ } location.replace(to); };
  const save = () => {
    const entries = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); entries.push([k, localStorage.getItem(k)]); } } catch { /* no storage */ }
    download(`logbook-this-device-${todayISO()}.json`, new Blob([JSON.stringify(deviceFile(entries))], { type: 'application/json' }));
  };
  return h('div', { class: 'landing moved' },
    h('h2', {}, 'The logbook has moved'),
    h('p', {}, 'It is now at ', h('b', {}, 'apmes.anawj.com/logbook'), '. Your cases, reflections and notes are in your account: sign in there as before.'),
    h('p', {}, 'What this browser saved here (look, text size, tab layout, unsent case drafts) stays at this old address. To keep it, download it here, then at the new address open Settings → Settings file and load it.'),
    h('p', { class: 'hint' }, 'The file can hold an unsent case draft: keep it private. If you added the logbook to your home screen, add it again from the new address.'),
    h('div', { class: 'bar' },
      h('button', { onclick: save }, 'Download this browser’s choices'),
      h('button', { class: 'primary', onclick: go }, 'Go to the new address')));
}
