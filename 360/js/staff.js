// APMES CCC 360, the coordinators' view: PDs, Admin staff and programme coordinators (PCs) open and close rounds, see who has
// sent, read each resident's projects and nominees, mark the nominees, and export the list or email the nominees one by one.
// The app does not send mail: "Email" opens the coordinator's own mail app with the text filled in (edit it there).
// Everything shown comes from residents' own typing, so it is only ever put on the page as text.

import { S, h, fill, toast, cloud, modal, confirmBox, empty, errText, row, download, avatar } from '../../evals/js/ui-core.js';
import {
  GROUPS, GROUP, LISTS, MARKS, PURGE_TEXT, cleanEntry, cleanNominees, markLabel, roundId, cleanRoundInput, purgeAt,
  roster, rosterCounts, nomineesCSV, projectsCSV, mailto, emailList, monthText, dayText,
} from './model.js';
import * as store from './store.js';

const lc = s => String(s || '').trim().toLowerCase();
const when = t => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const chip = (kind, text) => h('span', { class: `a-pill ${kind === 'ok' ? 'a-pill--ok' : kind === 'warn' ? 'a-pill--warn' : kind === 'bad' ? 'a-pill--danger' : ''} e-chip e-chip--${kind === 'ok' ? 'submitted' : kind === 'warn' ? 'in-progress' : kind === 'bad' ? 'declined' : 'draft'}` }, text);
const statusChip = r => (r.status === 'open' ? chip('ok', 'Open') : chip('draft', 'Closed'));

let rounds = [];
let purged = false;   // the clean-up of old nominees runs once per visit

// ctx: { app, header, go }. parts: the hash after #staff, e.g. [], ['r2026-10'], ['r2026-10', 'amy@x.com'].
export async function staffScreen(parts, ctx) {
  const { app, header } = ctx;
  fill(app, h('p', { class: 'e-loading' }, 'Loading…'));
  try { rounds = await store.listRounds(); } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load the rounds: ' + errText(e))); }
  if (!purged) {
    purged = true;
    try { const n = await store.purgeExpired(rounds); if (n) toast(`Deleted ${n} nominee list${n === 1 ? '' : 's'} from rounds closed more than ${PURGE_TEXT} ago.`); }
    catch (e) { console.warn('Clean-up of old nominees failed', e); }
  }
  const round = rounds.find(r => r.round === decodeURIComponent(parts[0] || ''));
  if (!round) { header('Coordinators', { back: false }); return roundsScreen(ctx); }
  const email = parts[1] ? lc(decodeURIComponent(parts[1])) : '';
  return email ? residentScreen(round, email, ctx) : roundScreen(round, ctx);
}

// ---------- the rounds ----------

function roundsScreen({ app, go }) {
  const newRound = () => {
    const now = new Date();
    const title = h('input', { class: 'e-input', value: `CCC round, ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`, maxlength: 200, autocomplete: 'off' });
    const due = h('input', { class: 'e-input', type: 'date' });
    const msg = h('p', { class: 'e-alert', hidden: true, role: 'alert' });
    const m = modal('Open a new round', h('form', { onsubmit: async e => {
      e.preventDefault();
      const c = cleanRoundInput({ title: title.value, deadline: due.value });
      if (!c) { msg.hidden = false; msg.textContent = 'Give the round a name.'; return; }
      try { const r = await store.saveRound({ round: roundId(rounds.map(x => x.round)), ...c }); m.close(); toast('Round opened. Residents can see it now.'); go('#staff/' + encodeURIComponent(r.round)); }
      catch (err) { msg.hidden = false; msg.textContent = 'Couldn’t open it. ' + errText(err); }
    } },
      h('label', { class: 'e-label' }, 'Name', title), h('label', { class: 'e-label' }, 'Send by (optional)', due), msg,
      h('p', { class: 'e-hint' }, 'Residents see the open round the next time they open this page. Only one round should be open at a time.'),
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'a-btn', type: 'submit' }, 'Open the round'))));
  };
  const open = rounds.filter(r => r.status === 'open').length;
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Rounds'),
      h('p', { class: 'e-small' }, 'One round for each CCC meeting. Residents fill in their projects and feedback nominees; you see who has sent, check the nominees and email them.'),
      open > 1 ? h('p', { class: 'e-warn-note' }, `${open} rounds are open. Residents see only the newest open one.`) : null,
      h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn', type: 'button', onclick: newRound }, 'Open a new round'))),
    rounds.length ? h('div', { class: 'e-card e-card--flush' }, h('div', { class: 'e-list' }, rounds.map(r => row({
      name: r.title, title: r.title, meta: [r.deadline ? `Send by ${dayText(r.deadline)}` : '', purgeAt(r) ? `Nominees deleted ${when(purgeAt(r))}` : ''].filter(Boolean).join(' · ') || ' ',
      chip: statusChip(r), onclick: () => go('#staff/' + encodeURIComponent(r.round)) }))))
      : empty('No rounds yet', 'Open the first round to let residents start.')));
}

// ---------- one round ----------

async function roundScreen(round, ctx) {
  const { app, header, go } = ctx;
  header(round.title, { back: true, to: '#staff' });
  let residents = [], entries = {}, msfs = {}, reviews = {};
  try {
    [entries, msfs, reviews] = await Promise.all([store.listEntries(round.round), store.listNominees(round.round), store.listReviews(round.round)]);
    try { residents = await cloud.listResidents(); } catch (e) { console.warn('Resident list unavailable', e); }
  } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load this round: ' + errText(e))); }
  const rows = roster(residents, entries, msfs, reviews);
  const sums = rosterCounts(rows);
  const items = rows.filter(r => r.sent).map(r => ({ resident: { name: r.name, email: r.email }, entry: entries[r.email], nominees: cleanNominees(msfs[r.email]?.nominees), marks: reviews[r.email]?.marks || {} }));
  let filter = 'all';
  const list = h('div', { class: 'e-list' });
  const draw = () => {
    const shown = rows.filter(r => filter === 'all' || (filter === 'unsent' ? !r.sent : r.sent && r.marks.todo > 0));
    fill(list, shown.length ? shown.map(r => row({
      name: r.name, title: r.name, meta: r.sent ? `${r.projects ? `${r.projects} project${r.projects === 1 ? '' : 's'}` : r.noProjects ? 'No projects' : 'No projects listed'} · ${r.nominees} nominee${r.nominees === 1 ? '' : 's'}${r.extra ? ' · not on the resident list' : ''}` : 'Has not sent yet',
      chip: !r.sent ? chip('bad', 'Not sent') : r.marks.todo ? chip('warn', `${r.marks.todo} to check`) : r.nominees ? chip('ok', 'All checked') : chip('draft', 'No nominees'),
      onclick: () => go(`#staff/${encodeURIComponent(round.round)}/${encodeURIComponent(r.email)}`) }))
      : [h('p', { class: 'e-small', style: 'padding:12px 16px;margin:0' }, filter === 'unsent' ? 'Everyone has sent.' : 'Nothing to show.')]);
  };
  const seg = h('div', { class: 'a-seg e-segment', role: 'group', 'aria-label': 'Show' }, [['all', 'Everyone'], ['unsent', 'Not sent'], ['todo', 'To check']].map(([id, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(id === filter), onclick: e => { filter = id; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } }, label)));
  draw();

  const setStatus = async status => {
    if (status === 'closed' && !await confirmBox('Close this round?', `Residents can no longer change what they sent. Nominees' contact details are deleted ${PURGE_TEXT} after you close it.`, 'Close the round')) return;
    try { await store.saveRound({ round: round.round, title: round.title, deadline: round.deadline, status, closedAt: status === 'closed' ? Date.now() : 0 }); toast(status === 'closed' ? 'Round closed' : 'Round reopened'); ctx.render(); }
    catch (e) { toast('Couldn’t change it. ' + errText(e)); }
  };
  const edit = () => {
    const title = h('input', { class: 'e-input', value: round.title, maxlength: 200 });
    const due = h('input', { class: 'e-input', type: 'date', value: round.deadline || '' });
    const m = modal('Edit the round', h('form', { onsubmit: async e => {
      e.preventDefault();
      const c = cleanRoundInput({ title: title.value, deadline: due.value });
      if (!c) { toast('Give the round a name.'); return; }
      try { await store.saveRound({ round: round.round, ...c, status: round.status, closedAt: round.closedAt }); m.close(); ctx.render(); } catch (err) { toast('Couldn’t save. ' + errText(err)); }
    } }, h('label', { class: 'e-label' }, 'Name', title), h('label', { class: 'e-label' }, 'Send by', due),
      h('div', { class: 'e-actions' }, h('button', { class: 'a-btn a-btn--tinted e-btn-quiet', type: 'button', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'a-btn', type: 'submit' }, 'Save'))));
  };
  const slug = round.round.replace(/[^A-Za-z0-9_-]/g, '');
  const copyUnsent = async () => {
    const list2 = emailList(rows.filter(r => !r.sent).map(r => r.email));
    if (!list2) { toast('Everyone has sent.'); return; }
    try { await navigator.clipboard.writeText(list2); toast('Copied the emails of residents who have not sent'); } catch { toast('Couldn’t copy.'); }
  };
  const wipe = async () => {
    const n = Object.keys(msfs).length;
    if (!n || !await confirmBox('Delete all nominees now?', `This deletes the nominee lists of ${n} resident${n === 1 ? '' : 's'} for this round, with your marks. Projects are kept. It can’t be undone.`, 'Delete', true)) return;
    try { for (const email of Object.keys(msfs)) await store.deleteNominees(round.round, email); toast('Nominees deleted'); ctx.render(); } catch (e) { toast('Couldn’t delete. ' + errText(e)); }
  };
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('div', { class: 'cc-head' }, h('h2', { class: 'e-h2', style: 'margin:0' }, round.title), statusChip(round)),
      h('p', { class: 'e-small' }, `${sums.sent} of ${sums.total} active residents have sent · ${sums.nominees} nominees${sums.toCheck ? ` · ${sums.toCheck} to check` : ''}`),
      round.deadline ? h('p', { class: 'e-small' }, `Send by ${dayText(round.deadline)}.`) : null,
      h('p', { class: 'e-hint' }, round.status === 'closed' ? (purgeAt(round) ? `Nominees' contact details are deleted on ${when(purgeAt(round))}.` : 'Closed.') : `Nominees' contact details are deleted ${PURGE_TEXT} after you close the round.`),
      h('div', { class: 'e-actions e-actions--start' },
        round.status === 'open' ? h('button', { class: 'a-btn', type: 'button', onclick: () => setStatus('closed') }, 'Close the round') : h('button', { class: 'a-btn', type: 'button', onclick: () => setStatus('open') }, 'Reopen'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: edit }, 'Edit'))),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Export'),
      h('p', { class: 'e-small' }, 'Spreadsheets open these directly. Text that could run as a formula is made safe.'),
      h('div', { class: 'e-actions e-actions--start' },
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !items.some(i => i.nominees.length), onclick: () => download(`ccc-nominees-${slug}.csv`, new Blob([nomineesCSV(round, items)], { type: 'text/csv;charset=utf-8' })) }, 'Nominees (CSV)'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', disabled: !items.length, onclick: () => download(`ccc-projects-${slug}.csv`, new Blob([projectsCSV(round, items)], { type: 'text/csv;charset=utf-8' })) }, 'Projects (CSV)'),
        h('button', { class: 'a-btn a-btn--tinted', type: 'button', onclick: copyUnsent }, 'Copy emails of residents not sent'),
        h('button', { class: 'a-btn a-btn--danger a-btn--tinted', type: 'button', disabled: !Object.keys(msfs).length, onclick: wipe }, 'Delete nominees now'))),
    h('section', { class: 'e-card e-card--flush' }, h('div', { style: 'padding:12px 16px 0' }, seg), list)));
  window.scrollTo(0, 0);
}

// ---------- one resident ----------

async function residentScreen(round, email, ctx) {
  const { app, header } = ctx;
  let entry = null, msf = null, review = null;
  try {
    const [es, ms, rs] = await Promise.all([store.listEntries(round.round), store.listNominees(round.round), store.listReviews(round.round)]);
    [entry, msf, review] = [es[email], ms[email], rs[email]];
  } catch (e) { return fill(app, h('p', { class: 'e-alert' }, 'Couldn’t load this resident: ' + errText(e))); }
  const name = entry?.name || msf?.name || email;
  header(name, { back: true, to: '#staff/' + encodeURIComponent(round.round) });
  if (!entry && !msf) return fill(app, h('div', { class: 'e-stack cc-col' }, empty(`${name} has not sent anything yet`, `You can copy the emails of everyone who has not sent from the round page: ${email}`)));
  const e = cleanEntry(entry);
  const nominees = cleanNominees(msf?.nominees);
  const marks = { ...(review?.marks || {}) };
  const setMark = async (id, mark, rerender) => {
    if (mark) marks[id] = mark; else delete marks[id];
    try { await store.saveMarks(round.round, email, marks); rerender?.(); } catch (err) { toast('Couldn’t save the mark. ' + errText(err)); }
  };
  const nomBox = h('div', { class: 'e-stack' });
  const drawNominees = () => fill(nomBox, nominees.length ? GROUPS.map(g => {
    const list = nominees.filter(n => n.group === g.id);
    return list.length ? h('section', { class: 'e-card cc-card', 'aria-label': g.label },
      h('div', { class: 'cc-head' }, h('h3', {}, g.label), h('span', { class: 'cc-count' }, `${list.length} of ${g.max}`)),
      list.map(n => h('div', { class: 'cc-card' },
        h('div', {}, h('b', {}, n.name || '(no name)'), n.email ? h('span', { class: 'e-small' }, ` · ${n.email}`) : null, h('div', { class: 'e-small' }, markLabel(marks[n.id]))),
        h('div', { class: 'e-actions e-actions--start', role: 'group', 'aria-label': `Status for ${n.name || n.email}` },
          MARKS.filter(([k]) => k !== 'sent').map(([k, label]) => h('button', { class: `a-btn a-btn--sm ${marks[n.id] === k ? '' : 'a-btn--tinted'}`, type: 'button', 'aria-pressed': String(marks[n.id] === k),
            onclick: () => setMark(n.id, marks[n.id] === k ? '' : k, drawNominees) }, label)),
          n.email ? h('a', { class: 'a-btn a-btn--sm a-btn--tinted', href: mailto(n, name, round), 'aria-label': `Email ${n.name || n.email}`, onclick: () => setMark(n.id, 'sent', drawNominees) }, 'Email') : null)))) : null;
  }) : h('p', { class: 'e-small' }, 'No nominees.'));
  drawNominees();
  const wipe = async () => {
    if (!await confirmBox(`Delete ${name}’s nominees?`, 'Their nominee list and your marks on it are deleted for this round. Projects are kept. It can’t be undone.', 'Delete', true)) return;
    try { await store.deleteNominees(round.round, email); toast('Nominees deleted'); ctx.go('#staff/' + encodeURIComponent(round.round)); } catch (err) { toast('Couldn’t delete. ' + errText(err)); }
  };
  fill(app, h('div', { class: 'e-stack cc-col' },
    h('section', { class: 'e-card' },
      h('div', { class: 'cc-head' }, h('div', { style: 'display:flex;gap:10px;align-items:center' }, avatar(name), h('div', {}, h('h2', { class: 'e-h2', style: 'margin:0' }, name), h('div', { class: 'e-small' }, email))), round.status === 'open' ? chip('ok', 'Round open') : chip('draft', 'Round closed')),
      entry?.updatedAt || msf?.updatedAt ? h('p', { class: 'e-small' }, `Sent ${when(Math.max(entry?.updatedAt || 0, msf?.updatedAt || 0))}.`) : null),
    h('section', { class: 'e-card' },
      h('h2', { class: 'e-h2', style: 'margin-top:0' }, 'Scholarly projects'),
      e.projects.length ? h('ul', { class: 'cc-list' }, e.projects.map(p => h('li', {}, h('b', {}, p.title), ` · ${p.status}`, p.supervisor ? ` · ${p.supervisor}` : '', p.start || p.end ? ` · ${monthText(p.start) || '?'} to ${monthText(p.end) || 'ongoing'}` : '', p.note ? h('div', { class: 'e-small' }, p.note) : null)))
        : h('p', { class: 'e-small' }, e.noProjects ? 'None to report.' : 'None listed.'),
      LISTS.map(l => e[l.key].length ? h('div', {}, h('h3', { style: 'margin:12px 0 4px;font-size:1rem' }, l.label), h('ul', { class: 'cc-list' }, e[l.key].map(x => h('li', {}, x)))) : null)),
    h('h2', { class: 'e-h2', style: 'margin:4px 0' }, `Feedback nominees (${nominees.length})`),
    h('p', { class: 'e-small', style: 'margin:0' }, 'Mark each nominee once you have checked them. “Email” opens your mail app with the message filled in, and marks the nominee as emailed.'),
    nomBox,
    nominees.length ? h('div', { class: 'e-actions e-actions--start' }, h('button', { class: 'a-btn a-btn--danger a-btn--tinted', type: 'button', onclick: wipe }, 'Delete these nominees now')) : null));
  window.scrollTo(0, 0);
}
