// APMES case logbook: the response sheet's outbox script (paste into the RESPONSE SHEET's own Apps Script project as a
// new file, e.g. "LogbookOutbox"; setup in OUTBOX-README.md beside this file). Every few minutes it takes the cases
// residents logged in the app (Firestore sheetOutbox/{caseId}, written by logbook/js/sheet-outbox.js), adds each to the
// Case tab as a row exactly as a Form response would look, runs the sheet's own update chain on it (Database, the
// resident's report, the AY totals) and deletes the entry. New cases only: edits and deletions in the app never reach
// the sheet. Column J of the Case tab holds "app:<caseId>" on these rows, so a case is never added twice and the
// logbook's workbook import skips them.
//
// Each run reads one page of the outbox (12 entries, in id order) from where the last run stopped (the Script property
// LOGBOOK_OUTBOX_CURSOR), and goes back to the start once it reaches the end. So an entry it has to skip (a resident who
// isn't on the Residents tab yet) never holds the others back, and a run reads one page (two when it goes back to the
// start). The nightly Totals check (below) reads the whole outbox once and fails, so Google emails the owner, when an
// entry has been skipped for over a day. Two runs never overlap (the script lock: whoever's trigger, or Run in the
// editor, started them), and each piece looks in column J again just before adding a row.
//
// It signs in as the same bot account as the Form inbox script (Firebase email and password, kept in THIS project's
// Script properties LOGBOOK_BOT_EMAIL and LOGBOOK_BOT_PASSWORD, never in this file). The rules let that bot read and
// delete sheetOutbox entries only.
//
// A script that adds rows itself does not fire the sheet's onFormSubmit, so this runs the same chain inside the same
// document lock: updateDatabase (before the sort, with the new row's number), updateResidentReport, updateAYSummaryReport,
// then sortByTimestampDescending_. Every name here starts with logbookOutbox or LOGBOOK_OUTBOX_, so nothing in the
// existing code is replaced. Keep it in its own file.

var LOGBOOK_OUTBOX_PROJECT_ID = 'apmes-logbook';
var LOGBOOK_OUTBOX_API_KEY = 'AIzaSyDRC7COpi86H0K6oe98XZ8m1sQWJUkP63E';   // the logbook's public web key (logbook/js/firebase-config.js)
var LOGBOOK_OUTBOX_SITE = 'https://apmes.anawj.com/';                      // sent as Referer, in case the key is limited to the site
var LOGBOOK_OUTBOX_CASE_SHEET = 'Case';
var LOGBOOK_OUTBOX_RESIDENTS_SHEET = 'Residents';
var LOGBOOK_OUTBOX_MARK_COL = 10;      // column J
var LOGBOOK_OUTBOX_BATCH = 12;         // entries per run; the rest wait for the next one
var LOGBOOK_OUTBOX_CHUNK = 3;          // entries added per hold of the document lock (rows, Database, one sort)
var LOGBOOK_OUTBOX_BUDGET_MS = 270000; // stop starting new work after 4.5 minutes (Apps Script stops a run at 6)
var LOGBOOK_OUTBOX_PENDING_KEY = 'LOGBOOK_OUTBOX_PENDING';   // report rebuilds still to do: {"rids":[],"ays":[]}
var LOGBOOK_OUTBOX_CURSOR_KEY = 'LOGBOOK_OUTBOX_CURSOR';     // the id of the last entry the previous run got to (none: the start)
var LOGBOOK_OUTBOX_SKIP_ALERT_MS = 24 * 3600 * 1000;         // the nightly check fails when an entry has been skipped this long
var LOGBOOK_OUTBOX_ALL_MAX = 3000;                           // the nightly check reads at most this many entries
var LOGBOOK_OUTBOX_NIGHT_WAIT_MS = 30000;                    // the nightly check waits this long for a 5-minute run to end
var LOGBOOK_OUTBOX_DROP_RID_KEY = 'LOGBOOK_OUTBOX_DROP_RID';         // logbookOutboxDropRid from the editor: the resident id
var LOGBOOK_OUTBOX_DROP_CONFIRM_KEY = 'LOGBOOK_OUTBOX_DROP_CONFIRM'; // ... and the same id again, to delete (not just list)
var LOGBOOK_OUTBOX_DATE_FORMAT = 'dd/mm/yyyy', LOGBOOK_OUTBOX_STAMP_FORMAT = 'dd/mm/yyyy hh:mm:ss';

// The category labels exactly as the Form (and logbook/js/categories.js) write them. Tested against categories.js
// (test/outbox-script.test.mjs): change both together.
var LOGBOOK_OUTBOX_LABELS = {
  '01': "01) Cardiac surgery with CPB (10 | 15)",
  '02': "02) Cardiac surgery off CPB (10 | 20)",
  '03': "03) Thoracic Surgery (10 | 10)",
  '04': "04) Head and neck surgery (5 | 10)",
  '05': "05) Upper gastrointestinal surgery (5 | 10)",
  '06': "06) Emergency gastrointestinal surgery (1 | 10)",
  '07': "07) Surgery requiring one lung ventilation (10 | 10)",
  '08': "08) Laparoscopic surgery (5 | 10)",
  '09': "09) Eye (5 | 10)",
  '10': "10) ENT (5 | 10)",
  '11': "11) Shared airway surgery (5 | 10)",
  '12': "12) Challenging airway management (1 | 5)",
  '13': "13) General Surgery (20 | 20)",
  '14': "14) Gynaecology (5 | 5)",
  '15': "15) Neurosurgical procedure (15 | 15)",
  '15i': "15i) Emergency neurosurgery (10 | 10)",
  '15ii': "15ii) Other neurosurgery",
  '16': "16) Lower Segment Caesarean Section (10 | 20)",
  '17': "17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)",
  '18': "18) Orthopaedic Surgery (20 | 20)",
  '19': "19) Outpatient Surgery (20 | 20)",
  '20': "20) Paediatric Surgery (125 | 155)",
  '20i': "20i) Age <3+ months (5 | 5)",
  '20ii': "20ii) Age 4 months to 3+ years (20 | 20)",
  '20iii': "20iii) Age 4 to 12 years (100 | 100)",
  '20iv': "20iv) Age >12 years",
  '21': "21) Geriatric patients undergoing surgery (30 | 30)",
  '22': "22) Morbidly obese patients (10 | 10)",
  '23': "23) Bariatric surgery (2 | 2)",
  '24': "24) Spine surgery (2 | 5)",
  '25': "25) Intraoperative neurophysiological monitoring (5 | 5)",
  '26': "26) Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)",
  '26i': "26i) Upper limb blocks (10 | 10)",
  '26ii': "26ii) Lower limb blocks (10 | 10)",
  '26iii': "26iii) Truncal blocks (5 | 5)",
  '26iv': "26iv) Other blocks",
  '27': "27) Epidural/ caudal (R2=10 | R3=20 | R4=30 | R5=40)",
  '28': "28) Subarachnoid blocks (R2=10 | R3=20 | R4=30 | R5=40)",
  '29': "29) Peripheral nerve block with catheter (1 | 5)",
  '30': "30) Assessment/ management of new patient with pain (20 | 25)",
  '31': "31) Chronic pain patient (0 | 1)",
  '32': "32) Plastic Surgery (5 | 5)",
  '33': "33) Interventional radiology/ MRI (5 | 10)",
  '34': "34) Urology (5 | 10)",
  '35': "35) Vascular Surgery (0 | 5)",
  '36': "36) Emergency trauma surgery (4 | 8)",
  '37': "37) Transplant surgery (Optional)",
  '38': "38) ICU cases (1 | 5)",
  '99': "99) Others"
};

// ---------- turning one entry into a Case row (pure: tested in Node, test/outbox-script.test.mjs) ----------

// Categories as the Form's columns hold them: D the main categories, E / F / G the sub-categories of 15 / 20 / 26
// (15i-ii, 20i-iv, 26i-iv), each cell's labels joined with ", ". codes: ['16', '20', '20iii'] -> { cells: [D, E, F, G], unknown: [codes] }
function logbookOutboxCategories_(codes) {
  var cells = [[], [], [], []], unknown = [], seen = {};
  for (var i = 0; i < (codes || []).length; i++) {
    var code = String(codes[i]);
    if (seen[code]) continue;
    seen[code] = true;
    var label = LOGBOOK_OUTBOX_LABELS[code];
    if (!label) { unknown.push(code); continue; }
    var m = /^(15|20|26)(i|ii|iii|iv)$/.exec(code);
    cells[m ? { '15': 1, '20': 2, '26': 3 }[m[1]] : 0].push(label);
  }
  return { cells: cells.map(function (c) { return c.join(', '); }), unknown: unknown };
}

// 'YYYY-MM-DD' -> a real date (the sheet's script reads Year / Month / Week from a Date and leaves them blank for text)
function logbookOutboxDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// entry: the outbox entry; residentText: the Case tab's column A text for this resident ("<Name> (<6-digit id>)")
// -> the row for columns A-J: A Resident, B Date, C Initials and details, D-G categories, H Timestamp,
//    I Email address (as the Form's verified email), J the "app:<caseId>" marker
function logbookOutboxRow_(entry, residentText) {
  var cats = logbookOutboxCategories_(entry.cats);
  var details = (String(entry.initials || '') + ' ' + String(entry.details || '')).replace(/^\s+|\s+$/g, '');
  var date = logbookOutboxDate_(entry.date);
  return [residentText, date || String(entry.dateText || ''), details, cats.cells[0], cats.cells[1], cats.cells[2], cats.cells[3],
    new Date(Number(entry.createdAt) || 0), String(entry.email || ''), 'app:' + entry.id];
}

// Why an entry can't be added (the sheet knows residents only by the 6-digit id on its Residents tab), or '' if it can
function logbookOutboxSkipReason_(rid, residentOk) {
  if (!/^\d{6}$/.test(rid)) return 'resident id is not 6 digits: ' + rid;
  if (!residentOk(rid)) return 'no resident ' + rid + ' on the Residents sheet';
  return '';
}

// Phase 1, under the document lock: add each entry to the Case tab and the Database (the sheet's own updateDatabase, with
// the new row's number, so before the sort), then sort once. The slow rebuilds (the resident's report, the AY totals) are
// NOT done here: they are returned (rids, ays) for phase 2, each under a lock hold of its own.
// io (the sheet and the existing script; faked in the tests):
//   io.markers (an object: 'app:<id>' -> true, read from column J when the run opened the sheet), io.marked(mark)
//   (optional: column J looked at again now, under the lock), io.residentOk(rid), io.residentText(rid),
//   io.appendRow(row) -> the new row's number, io.database(rowNumber, first8Values), io.sort()
// -> { done: [ids whose entry can be deleted], skipped: [{ id, reason }], errors: [text], rids: [..], ays: [..] }
function logbookOutboxAdd_(entries, io) {
  var done = [], skipped = [], errors = [], rids = {}, ays = {}, added = 0, ms = { append: 0, database: 0, sort: 0 }, t;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i], mark = 'app:' + e.id;
    var rid = String(e.rid || '');
    // already in the sheet (a run that stopped before the delete, or one that added it after this run read column J):
    // make sure its reports are rebuilt too
    if (io.markers[mark] || (io.marked && io.marked(mark))) {
      io.markers[mark] = true;
      done.push(e.id); if (/^\d{6}$/.test(rid)) { rids[rid] = true; ays['AY' + rid.slice(0, 4)] = true; }
      continue;
    }
    var why = logbookOutboxSkipReason_(rid, io.residentOk);
    if (why) { skipped.push({ id: e.id, reason: why }); continue; }   // stays in the outbox; the nightly check reports it
    var row = logbookOutboxRow_(e, io.residentText(rid));
    t = Date.now(); var rowNumber = io.appendRow(row); ms.append += Date.now() - t;
    io.markers[mark] = true; added++;
    done.push(e.id);
    t = Date.now();
    try { io.database(rowNumber, row.slice(0, 8)); } catch (err) { errors.push('Database for ' + e.id + ': ' + err.message); }
    ms.database += Date.now() - t;
    rids[rid] = true; ays['AY' + rid.slice(0, 4)] = true;
  }
  if (added) { t = Date.now(); try { io.sort(); } catch (err) { errors.push('Sort: ' + err.message); } ms.sort = Date.now() - t; }
  return { done: done, skipped: skipped, errors: errors, rids: Object.keys(rids), ays: Object.keys(ays), ms: ms };
}

// One run, with its surroundings behind env (so the order of everything is tested with fakes):
//   env.list(after) -> at most LOGBOOK_OUTBOX_BATCH entries in id order, the first one after the id `after` ('' : from the
//   start), env.getCursor() / env.setCursor(id) (where the next run starts), env.open() (optional: reads the sheet into
//   env.io, only when there is work), env.remove(id), env.io, env.locked(fn) (runs fn holding the document lock, then lets
//   go), env.getPending() / env.setPending({rids, ays}), env.now() (ms), env.pause(ms), env.log(text)
// Why in pieces: the sheet's own onFormSubmit waits only 10 seconds for the document lock, and a resident's report or the
// AY totals take 10-40 seconds to rebuild on the real data. So the lock is held for a few entries at a time (rows,
// Database, one sort), then once per rebuild, with a pause between: a Form response that arrives meanwhile waits at most
// one piece. Rebuilds still owed are kept (env.setPending) before the entries are deleted, so a run that stops half way
// loses nothing: the next run does them first.
// The page: from where the last run stopped, so entries that are skipped (they stay in the outbox) never fill every run's
// page; past the end, back to the start in the same run.
function logbookOutboxCycle_(env) {
  var start = env.now(), over = function () { return env.now() - start > LOGBOOK_OUTBOX_BUDGET_MS; };
  var pending = env.getPending();
  var was = env.getCursor() || '', after = was;
  var entries = env.list(after);
  if (!entries.length && after) { after = ''; entries = env.list(''); }
  var summary = { added: 0, skipped: [], errors: [], rebuilt: 0, left: 0, listed: entries.length, idle: false };
  if (!entries.length && !pending.rids.length && !pending.ays.length) {
    if (was) env.setCursor('');
    summary.idle = true;
    return summary;
  }
  if (env.open) env.open();
  var i;
  for (i = 0; i < entries.length && !over(); i += LOGBOOK_OUTBOX_CHUNK) {
    var r;
    var t0 = env.now();
    env.locked(function () { r = logbookOutboxAdd_(entries.slice(i, i + LOGBOOK_OUTBOX_CHUNK), env.io); });
    env.log('hold: ' + r.done.length + ' entries added in ' + (env.now() - t0) + ' ms (append ' + r.ms.append + ', Database ' + r.ms.database + ', sort ' + r.ms.sort + ')');
    pending.rids = logbookOutboxUnion_(pending.rids, r.rids); pending.ays = logbookOutboxUnion_(pending.ays, r.ays);
    env.setPending(pending);                       // before the entries go
    r.done.forEach(env.remove);
    summary.added += r.done.length; summary.skipped = summary.skipped.concat(r.skipped); summary.errors = summary.errors.concat(r.errors);
    env.pause(2000);
  }
  // the next run starts after the last entry looked at; once a short page (the end of the outbox) has been looked through,
  // back at the start
  var seen = Math.min(i, entries.length);
  var next = seen < entries.length ? (seen ? entries[seen - 1].id : after) : entries.length < LOGBOOK_OUTBOX_BATCH ? '' : entries[seen - 1].id;
  if (next !== was) env.setCursor(next);
  var jobs = pending.rids.map(function (rid) { return { kind: 'rid', id: rid }; }).concat(pending.ays.map(function (ay) { return { kind: 'ay', id: ay }; }));
  for (var j = 0; j < jobs.length && !over(); j++) {
    var t1 = env.now();
    try { env.locked(function () { env.io[jobs[j].kind === 'rid' ? 'residentReport' : 'aySummary'](jobs[j].id); }); summary.rebuilt++; }
    catch (err) { summary.errors.push('Rebuild ' + jobs[j].id + ': ' + err.message); }
    env.log('hold: rebuilt ' + jobs[j].id + ' in ' + (env.now() - t1) + ' ms');
    // done (or failed: the menu's Rebuild commands fix it; don't retry forever)
    pending[jobs[j].kind === 'rid' ? 'rids' : 'ays'] = pending[jobs[j].kind === 'rid' ? 'rids' : 'ays'].filter(function (x) { return x !== jobs[j].id; });
    env.setPending(pending);
    env.pause(1000);
  }
  summary.left = pending.rids.length + pending.ays.length;
  return summary;
}
function logbookOutboxUnion_(a, b) { var o = {}; (a || []).concat(b || []).forEach(function (x) { o[x] = true; }); return Object.keys(o); }

// ---------- Firestore (REST), signing in as the bot ----------

function logbookOutboxToken_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get('logbookOutboxToken'); if (hit) return hit; }
  var p = PropertiesService.getScriptProperties();
  var email = p.getProperty('LOGBOOK_BOT_EMAIL'), password = p.getProperty('LOGBOOK_BOT_PASSWORD');
  if (!email || !password) throw new Error('Set LOGBOOK_BOT_EMAIL and LOGBOOK_BOT_PASSWORD in Project settings → Script properties.');
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + LOGBOOK_OUTBOX_API_KEY, {
    method: 'post', contentType: 'application/json', headers: { Referer: LOGBOOK_OUTBOX_SITE }, muteHttpExceptions: true,
    payload: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Bot sign-in failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  var token = JSON.parse(res.getContentText()).idToken;
  cache.put('logbookOutboxToken', token, 3000);
  return token;
}

function logbookOutboxDocs_() { return 'projects/' + LOGBOOK_OUTBOX_PROJECT_ID + '/databases/(default)/documents'; }

// path: 'sheetOutbox/<id>', or ':runQuery' (payload: the request body)
function logbookOutboxFetch_(method, path, query, payload) {
  var url = 'https://firestore.googleapis.com/v1/' + logbookOutboxDocs_() + (path.charAt(0) === ':' ? '' : '/') + path + (query || '');
  function go(token) {
    var o = { method: method, headers: { Authorization: 'Bearer ' + token, Referer: LOGBOOK_OUTBOX_SITE }, muteHttpExceptions: true };
    if (payload) { o.contentType = 'application/json'; o.payload = JSON.stringify(payload); }
    return UrlFetchApp.fetch(url, o);
  }
  var res = go(logbookOutboxToken_());
  if (res.getResponseCode() === 401 || res.getResponseCode() === 403) res = go(logbookOutboxToken_(true));   // a kept sign-in that no longer works
  return res;
}

// a Firestore REST document -> a plain entry
function logbookOutboxEntryOf_(doc) {
  var f = doc.fields || {}, out = { id: String(doc.name || '').split('/').pop() };
  for (var k in f) {
    var v = f[k];
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('nullValue' in v) out[k] = null;
    else if ('arrayValue' in v) out[k] = (v.arrayValue.values || []).map(function (x) { return x.stringValue; });
  }
  return out;
}

// The request body for one page: up to `size` entries in id order, starting after the entry id `after` ('' : the start).
// A query (not a plain list) because a query can start after a given id: a list's page tokens can't be kept between runs.
function logbookOutboxPageQuery_(after, size) {
  var q = { from: [{ collectionId: 'sheetOutbox' }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: size };
  if (after) q.startAt = { values: [{ referenceValue: logbookOutboxDocs_() + '/sheetOutbox/' + after }], before: false };
  return { structuredQuery: q };
}

// One page of the outbox (a read per entry, at least one per call)
function logbookOutboxPage_(after, size) {
  var res = logbookOutboxFetch_('post', ':runQuery', '', logbookOutboxPageQuery_(after, size));
  if (res.getResponseCode() !== 200) throw new Error('Outbox list failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  return logbookOutboxEntriesOf_(JSON.parse(res.getContentText()));
}
// runQuery's answer (a list of { document?, readTime }; just { readTime } when nothing matches) -> entries
function logbookOutboxEntriesOf_(rows) {
  return (rows || []).filter(function (x) { return x && x.document; }).map(function (x) { return logbookOutboxEntryOf_(x.document); });
}

// Every entry (by hand and in the nightly check: a read per entry), up to LOGBOOK_OUTBOX_ALL_MAX -> { entries, capped }
function logbookOutboxAll_() {
  var all = [], page, after = '';
  do {
    page = logbookOutboxPage_(after, 300);
    all = all.concat(page);
    if (page.length) after = page[page.length - 1].id;
  } while (page.length === 300 && all.length < LOGBOOK_OUTBOX_ALL_MAX);
  return { entries: all, capped: page.length === 300 };
}

function logbookOutboxDelete_(id) {
  var res = logbookOutboxFetch_('delete', 'sheetOutbox/' + encodeURIComponent(id));
  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 404) console.warn('Outbox delete failed for ' + id + ': ' + res.getResponseCode());
}

// ---------- the sheet ----------

// The Residents tab -> { known: { 'rid': true } (column B), rows: [[A..G]...] }
function logbookOutboxResidents_(ss) {
  var residents = ss.getSheetByName(LOGBOOK_OUTBOX_RESIDENTS_SHEET);
  if (!residents) throw new Error('No "' + LOGBOOK_OUTBOX_RESIDENTS_SHEET + '" sheet.');
  var known = {};
  var rows = residents.getLastRow() > 1 ? residents.getRange(2, 1, residents.getLastRow() - 1, 7).getValues() : [];
  rows.forEach(function (r) { known[String(r[1])] = true; });
  return { known: known, rows: rows };
}

function logbookOutboxIo_(ss) {
  var caseSheet = ss.getSheetByName(LOGBOOK_OUTBOX_CASE_SHEET);
  if (!caseSheet) throw new Error('No "' + LOGBOOK_OUTBOX_CASE_SHEET + '" sheet.');
  var res = logbookOutboxResidents_(ss), known = res.known, rrows = res.rows;   // resident id -> true (Residents column B)
  var last = caseSheet.getLastRow();
  var markers = {}, textOf = {};
  if (last > 1) {
    var a = caseSheet.getRange(2, 1, last - 1, 1).getValues();
    a.forEach(function (r) { var m = /\((\d{6})\)\s*$/.exec(String(r[0])); if (m && !textOf[m[1]]) textOf[m[1]] = String(r[0]); });
    if (caseSheet.getLastColumn() >= LOGBOOK_OUTBOX_MARK_COL)
      caseSheet.getRange(2, LOGBOOK_OUTBOX_MARK_COL, last - 1, 1).getValues().forEach(function (r) { if (/^app:/.test(String(r[0]))) markers[String(r[0])] = true; });
  }
  return {
    markers: markers,
    // column J now, not as the run first read it (a case and its id: exactly, case and all)
    marked: function (mark) {
      var n = caseSheet.getLastRow();
      return n > 1 && !!caseSheet.getRange(2, LOGBOOK_OUTBOX_MARK_COL, n - 1, 1).createTextFinder(mark).matchEntireCell(true).matchCase(true).findNext();
    },
    residentOk: function (rid) { return !!known[rid]; },
    residentText: function (rid) {
      if (textOf[rid]) return textOf[rid];
      var r = rrows.filter(function (x) { return String(x[1]) === rid; })[0];
      return String(r[0]).replace(/\s+$/, '') + ' (' + rid + ')';
    },
    appendRow: function (row) {
      var n = caseSheet.getLastRow() + 1;
      caseSheet.getRange(n, 1, 1, row.length).setValues([row]);
      caseSheet.getRange(n, 2).setNumberFormat(LOGBOOK_OUTBOX_DATE_FORMAT);
      caseSheet.getRange(n, 8).setNumberFormat(LOGBOOK_OUTBOX_STAMP_FORMAT);
      return n;
    },
    database: function (rowNumber, first8) { updateDatabase(caseSheet, rowNumber, first8); },
    residentReport: function (rid) { updateResidentReport(rid); },
    aySummary: function (ay) { updateAYSummaryReport(ay); },
    sort: function () { sortByTimestampDescending_(caseSheet); },
  };
}

// ---------- entry points ----------

// The time trigger (every 5 minutes: logbookOutboxSetup adds it). Failures show in Apps Script → Executions, and Google
// emails the trigger's owner a daily summary; entries that failed stay in the outbox for the next run. Skipped entries
// only log a warning here (never a failure every 5 minutes): the nightly Totals check reports them.
// One run at a time (the script lock covers every account's trigger and Run in the editor): two runs that both read the
// outbox before either deleted an entry would both add its case. A run that finds another still going does nothing.
function logbookOutboxRun() {
  var run = LockService.getScriptLock();
  if (!run.tryLock(0)) { console.log('Another outbox run is still going: this one did nothing.'); return; }
  try { logbookOutboxRunLocked_(); } finally { run.releaseLock(); }
}
function logbookOutboxRunLocked_() {
  var props = PropertiesService.getScriptProperties();
  var env = {
    list: function (after) { return logbookOutboxPage_(after, LOGBOOK_OUTBOX_BATCH); },
    getCursor: function () { return props.getProperty(LOGBOOK_OUTBOX_CURSOR_KEY) || ''; },
    setCursor: function (id) { if (id) props.setProperty(LOGBOOK_OUTBOX_CURSOR_KEY, id); else props.deleteProperty(LOGBOOK_OUTBOX_CURSOR_KEY); },
    open: function () { env.io = logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet()); },
    remove: logbookOutboxDelete_,
    io: null,
    // (flush: the rows are written before the lock goes, so whoever holds it next sees them)
    locked: function (fn) { var lock = LockService.getDocumentLock(); lock.waitLock(30000); try { fn(); SpreadsheetApp.flush(); } finally { lock.releaseLock(); } },
    getPending: function () { try { var p = JSON.parse(props.getProperty(LOGBOOK_OUTBOX_PENDING_KEY) || '{}'); return { rids: p.rids || [], ays: p.ays || [] }; } catch (e) { return { rids: [], ays: [] }; } },
    setPending: function (p) { if (p.rids.length || p.ays.length) props.setProperty(LOGBOOK_OUTBOX_PENDING_KEY, JSON.stringify(p)); else props.deleteProperty(LOGBOOK_OUTBOX_PENDING_KEY); },
    now: function () { return Date.now(); },
    pause: function (ms) { Utilities.sleep(ms); },
    log: function (t) { console.log(t); },
  };
  var s = logbookOutboxCycle_(env);
  if (s.idle) return;   // nothing waiting (the sheet wasn't opened)
  console.log('Outbox: ' + s.added + ' added, ' + s.skipped.length + ' skipped, ' + s.rebuilt + ' rebuilt, ' + s.left + ' rebuilds waiting, ' + s.errors.length + ' errors.');
  s.skipped.forEach(function (x) { console.warn('Skipped ' + x.id + ': ' + x.reason); });
  if (s.errors.length) throw new Error(s.errors.join('; '));
}

// Run by hand to check the bot can sign in and read the outbox (changes nothing). Use this, not logbookOutboxSetup, on a COPY.
// Also says which entries wait because their resident isn't on the Residents tab.
function logbookOutboxCheck() {
  logbookOutboxToken_(true);
  var w = logbookOutboxWaitingNow_();
  console.log('Bot sign-in works. ' + logbookOutboxWaitingText_(w));
  logbookOutboxWaitingLines_(w).forEach(function (t) { console.log(t); });
}

// Run once by hand after setting the two Script properties: checks the bot can sign in and read the outbox, adds the
// header "App marker" to column J if it is empty, and adds the 5-minute trigger if it isn't there. Safe to run again from
// the same account (it can't see another account's triggers: a second one would only make runs skip, never add twice).
function logbookOutboxSetup() {
  logbookOutboxToken_(true);
  console.log('Bot sign-in works; ' + logbookOutboxPage_('', LOGBOOK_OUTBOX_BATCH).length + ' entries on the outbox\'s first page.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGBOOK_OUTBOX_CASE_SHEET);
  var head = sheet.getRange(1, LOGBOOK_OUTBOX_MARK_COL);
  if (!String(head.getValue())) { head.setValue('App marker'); console.log('Column J header added.'); }
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'logbookOutboxRun'; });
  if (!has) ScriptApp.newTrigger('logbookOutboxRun').timeBased().everyMinutes(5).create();
  console.log(has ? 'Trigger already there.' : 'Trigger added: logbookOutboxRun, every 5 minutes.');
}

// Run by hand: shows what the waiting entries would add (the Case-tab rows), writes nothing and deletes nothing.
function logbookOutboxDryRun() {
  var entries = logbookOutboxAll_().entries;
  if (!entries.length) { console.log('The outbox is empty.'); return; }
  var io = logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet());
  entries.forEach(function (e) {
    var rid = String(e.rid || ''), why = logbookOutboxSkipReason_(rid, io.residentOk);
    console.log(e.id + ': ' + (why ? 'skipped: ' + why : JSON.stringify(logbookOutboxRow_(e, io.residentText(rid)))));
  });
}

// For a dry run on a COPY of the sheet (never the real one): adds one made-up case for the resident with this 6-digit id
// to this sheet exactly as a real entry would be, runs the update chain, and does not touch the outbox.
// BEFORE running it on a copy, point that resident's column G on the copy's Residents sheet at a blank throwaway
// spreadsheet: a copy keeps the real residents' own report spreadsheet ids, and updateResidentReport would rewrite the
// REAL resident's "Case Log" with the made-up case. (It refuses to run if column G still names a spreadsheet you
// haven't listed in LOGBOOK_OUTBOX_TRY_SAFE_IDS.)
var LOGBOOK_OUTBOX_TRY_SAFE_IDS = [];   // on a copy: the id(s) of the throwaway spreadsheet(s) you pointed column G at
function logbookOutboxTryOne(rid) {
  var res = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGBOOK_OUTBOX_RESIDENTS_SHEET);
  var mine = res.getLastRow() > 1 ? res.getRange(2, 1, res.getLastRow() - 1, 7).getValues().filter(function (r) { return String(r[1]) === String(rid); })[0] : null;
  if (!mine) throw new Error('No resident ' + rid + ' on the Residents sheet.');
  if (LOGBOOK_OUTBOX_TRY_SAFE_IDS.indexOf(String(mine[6])) < 0)
    throw new Error('Stopped: column G for ' + rid + ' names a spreadsheet that is not in LOGBOOK_OUTBOX_TRY_SAFE_IDS. Point it at a blank throwaway spreadsheet first, or the real resident\'s Case Log would be rewritten.');
  var entry = { id: 'try' + Date.now().toString(36), email: 'fake.try@example.com', rid: String(rid), date: Utilities.formatDate(new Date(), 'Asia/Singapore', 'yyyy-MM-dd'),
    initials: 'XY', details: '34F fake test case, ignore', cats: ['16', '20', '20iii', '26', '26i'], createdAt: Date.now() };
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  var io = logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet()), r, t0 = Date.now(), times = {};
  try { r = logbookOutboxAdd_([entry], io); times.addAndSortMs = Date.now() - t0; } finally { lock.releaseLock(); }
  // the rebuilds, each in a hold of its own, timed: this is what the sheet's own Form handler has to wait out
  r.rids.forEach(function (rid) { var t = Date.now(); lock = LockService.getDocumentLock(); lock.waitLock(30000); try { io.residentReport(rid); } finally { lock.releaseLock(); } times['report ' + rid + ' Ms'] = Date.now() - t; });
  r.ays.forEach(function (ay) { var t = Date.now(); lock = LockService.getDocumentLock(); lock.waitLock(30000); try { io.aySummary(ay); } finally { lock.releaseLock(); } times['totals ' + ay + ' Ms'] = Date.now() - t; });
  console.log(JSON.stringify({ result: r, holds: times }));
}

// ---------- the Totals check (nightly) ----------
// The sheet's Database tab is built one response at a time and the AY Totals tabs are built from the Database, so a
// response whose update timed out, one added twice, or a Case row changed by hand leaves the Totals out of step with the
// Case tab (Oct 2026: three residents' totals were 1-2 off). This compares, by counts only, Case tab -> Database -> AY
// Totals tabs, and (only if the Script property LOGBOOK_TOTALS_FIX is 'on') runs the same two rebuilds the sheet's own menu
// has ("Rebuild Database", "Rebuild AY Reports"), in the quiet of the night. It never touches the Case or Residents tabs,
// a resident's own spreadsheet, or anything outside this sheet.

var LOGBOOK_TOTALS_FIX_KEY = 'LOGBOOK_TOTALS_FIX';       // 'on' to let the nightly run rebuild; anything else only reports
var LOGBOOK_TOTALS_LAST_KEY = 'LOGBOOK_TOTALS_LAST';     // the last run's result (text)
var LOGBOOK_TOTALS_RECENT_MS = 10 * 60 * 1000;           // a Form response or app case this recent: wait for the next night
var LOGBOOK_TOTALS_MIN_ROWS = 1000;                      // fewer Case rows than this: something is wrong with the read, change nothing

// caseRows: [[A resident text, D, E, F, G (category cells), H timestamp]...] -> { 'rid': { 'label': n } } (one per label per row)
function logbookOutboxCaseCounts_(caseRows) {
  var out = {};
  for (var i = 0; i < caseRows.length; i++) {
    var m = /\((\d{6})\)\s*$/.exec(String(caseRows[i][0]));
    if (!m) continue;   // WRONG ENTRY and rows without a resident id are not counted by the Database either
    var rid = m[1], seen = {};
    for (var c = 1; c <= 4; c++) {
      String(caseRows[i][c] || '').split(',').forEach(function (s) {
        var label = s.replace(/^\s+|\s+$/g, '');
        if (!label || seen[label]) return;
        seen[label] = true;
        out[rid] = out[rid] || {}; out[rid][label] = (out[rid][label] || 0) + 1;
      });
    }
  }
  return out;
}

// dbRows: [[B resident id, I category label]...] -> the same shape
function logbookOutboxDbCounts_(dbRows) {
  var out = {};
  for (var i = 0; i < dbRows.length; i++) {
    var rid = String(dbRows[i][0]), label = String(dbRows[i][1] || '').replace(/^\s+|\s+$/g, '');
    if (!/^\d{6}$/.test(rid) || !label) continue;
    out[rid] = out[rid] || {}; out[rid][label] = (out[rid][label] || 0) + 1;
  }
  return out;
}

// ayTabs: { 'AY2023': [[ 'Category', 'Name (202301)', ... ], [ label, n, ... ], ..., [ 'Grand Total', ... ]] } (the tab's values)
// -> { db: [{ rid, label, caseCount, dbCount }], ay: [{ ay, rid, label, dbCount, tabCount }], ignored: [labels the Totals tabs have no row for] }
// Compared: Case vs Database for every resident; Database vs each Totals cell for the residents and labels a tab shows.
function logbookOutboxTotalsDiff_(caseCounts, dbCounts, ayTabs) {
  var db = [], ay = [], shown = {}, ignored = {}, rid, label;
  var rids = logbookOutboxUnion_(Object.keys(caseCounts), Object.keys(dbCounts)).sort();
  rids.forEach(function (r) {
    logbookOutboxUnion_(Object.keys(caseCounts[r] || {}), Object.keys(dbCounts[r] || {})).sort().forEach(function (l) {
      var a = (caseCounts[r] || {})[l] || 0, b = (dbCounts[r] || {})[l] || 0;
      if (a !== b) db.push({ rid: r, label: l, caseCount: a, dbCount: b });
    });
  });
  Object.keys(ayTabs).sort().forEach(function (name) {
    var rows = ayTabs[name], head = rows[0] || [], cols = {};
    head.forEach(function (h, i) { var m = /\((\d{6})\)\s*$/.exec(String(h)); if (m) cols[i] = m[1]; });
    rows.slice(1).forEach(function (r) {
      label = String(r[0]).replace(/^\s+|\s+$/g, '');
      if (!label || label === 'Grand Total') return;
      shown[label] = true;
      Object.keys(cols).forEach(function (i) {
        var tabCount = Number(r[i]) || 0, dbCount = ((dbCounts[cols[i]] || {})[label]) || 0;
        if (tabCount !== dbCount) ay.push({ ay: name, rid: cols[i], label: label, dbCount: dbCount, tabCount: tabCount });
      });
    });
  });
  Object.keys(dbCounts).forEach(function (r) { Object.keys(dbCounts[r]).forEach(function (l) { if (!shown[l]) ignored[l] = true; }); });
  return { db: db, ay: ay, ignored: Object.keys(ignored).sort() };
}

// One night's check, with its surroundings behind env (tested with fakes):
//   env.read() -> { caseRows, dbRows, ayTabs, newestCaseMs }, env.fixOn (bool), env.now(), env.locked(fn),
//   env.rebuildDatabase(), env.rebuildAy(), env.log(text)
// -> { status: 'ok' | 'differs' | 'fixed' | 'still differs' | 'skipped', reason, before, after, ran: [] }
function logbookOutboxTotalsCycle_(env) {
  var data = env.read();
  var diff = function (d) { return logbookOutboxTotalsDiff_(logbookOutboxCaseCounts_(d.caseRows), logbookOutboxDbCounts_(d.dbRows), d.ayTabs); };
  var count = function (x) { return { database: x.db.length, totals: x.ay.length }; };
  if (data.caseRows.length < LOGBOOK_TOTALS_MIN_ROWS) return { status: 'skipped', reason: 'only ' + data.caseRows.length + ' Case rows read; nothing changed', ran: [] };
  var before = diff(data), b = count(before);
  if (!b.database && !b.totals) return { status: 'ok', before: b, ran: [] };
  var summary = { status: 'differs', before: b, detail: before, ran: [] };
  if (!env.fixOn) return summary;
  if (env.now() - data.newestCaseMs < LOGBOOK_TOTALS_RECENT_MS) { summary.reason = 'a case arrived in the last 10 minutes; left for the next run'; summary.status = 'skipped'; return summary; }
  if (b.database) { env.locked(env.rebuildDatabase); summary.ran.push('Rebuild Database'); }
  env.locked(env.rebuildAy); summary.ran.push('Rebuild AY Reports');
  var after = diff(env.read()), a = count(after);
  summary.after = a; summary.detail = after;
  summary.status = (!a.database && !a.totals) ? 'fixed' : 'still differs';
  return summary;
}

// The sheet's menu commands end with an alert, which a time trigger cannot show: the work is done by then
function logbookOutboxNoUi_(fn) {
  try { fn(); } catch (e) { if (!/getUi|Cannot call/i.test(String(e && e.message))) throw e; }
}

function logbookOutboxTotalsEnv_(fixOn) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    fixOn: fixOn,
    now: function () { return Date.now(); },
    log: function (t) { console.log(t); },
    locked: function (fn) { var lock = LockService.getDocumentLock(); lock.waitLock(60000); try { fn(); } finally { lock.releaseLock(); } },
    rebuildDatabase: function () { logbookOutboxNoUi_(rebuildDatabase); },
    rebuildAy: function () { logbookOutboxNoUi_(rebuildAYSummaryReports); },
    read: function () {
      var cs = ss.getSheetByName(LOGBOOK_OUTBOX_CASE_SHEET), ds = ss.getSheetByName('Database'), n = cs.getLastRow() - 1, m = ds.getLastRow() - 1;
      var caseRows = n > 0 ? cs.getRange(2, 1, n, 8).getValues().map(function (r) { return [r[0], r[3], r[4], r[5], r[6], r[7]]; }) : [];
      var newest = 0;
      caseRows.forEach(function (r) { var t = r[5] instanceof Date ? r[5].getTime() : 0; if (t > newest) newest = t; });
      var dbRows = m > 0 ? ds.getRange(2, 2, m, 8).getValues().map(function (r) { return [r[0], r[7]]; }) : [];
      var ayTabs = {};
      ss.getSheets().forEach(function (sh) { var mm = /^(AY\d{4}) Totals$/.exec(sh.getName()); if (mm) ayTabs[mm[1]] = sh.getDataRange().getValues(); });
      return { caseRows: caseRows, dbRows: dbRows, ayTabs: ayTabs, newestCaseMs: newest };
    },
  };
}

function logbookOutboxTotalsSummaryText_(s) {
  var t = s.status + (s.reason ? ' (' + s.reason + ')' : '') + '. Differing cells before: Database ' + (s.before ? s.before.database : 0) + ', Totals ' + (s.before ? s.before.totals : 0);
  if (s.ran && s.ran.length) t += '; ran ' + s.ran.join(' + ') + '; after: Database ' + s.after.database + ', Totals ' + s.after.totals;
  return t;
}

// ---------- what waits in the outbox (nightly, with the Totals check) ----------
// Entries the 5-minute run has to skip (their resident isn't on the Residents tab, or the id isn't 6 digits) stay in the
// outbox, and their cases never reach the sheet until someone adds the resident. The 5-minute run only logs them; this
// says so once a day, and the nightly check fails (Google emails the owner) once one has waited over a day.

// entries: every entry in the outbox; residentOk(rid): on the Residents tab; now (ms)
// -> { waiting, skippedN, overdue (skipped for over a day), oldestSkippedMs, oldOther (others waiting over a day),
//      skipped: [{ rid, n, reason, oldestMs }] }   (an entry's age: since it was logged in the app)
function logbookOutboxWaiting_(entries, residentOk, now) {
  var out = { waiting: entries.length, skippedN: 0, overdue: 0, oldestSkippedMs: 0, oldOther: 0, skipped: [] }, byRid = {};
  entries.forEach(function (e) {
    var rid = String(e.rid || ''), age = Math.max(0, now - (Number(e.createdAt) || now));
    var why = logbookOutboxSkipReason_(rid, residentOk);
    if (!why) { if (age > LOGBOOK_OUTBOX_SKIP_ALERT_MS) out.oldOther++; return; }
    out.skippedN++;
    if (age > LOGBOOK_OUTBOX_SKIP_ALERT_MS) out.overdue++;
    out.oldestSkippedMs = Math.max(out.oldestSkippedMs, age);
    var b = byRid[rid] || (byRid[rid] = { rid: rid, n: 0, reason: why, oldestMs: 0 });
    b.n++; b.oldestMs = Math.max(b.oldestMs, age);
  });
  out.skipped = Object.keys(byRid).sort().map(function (k) { return byRid[k]; });
  return out;
}

function logbookOutboxDays_(ms) { return Math.round(ms / 864e5 * 10) / 10; }

function logbookOutboxWaitingText_(w) {
  var t = 'Outbox: ' + w.waiting + (w.capped ? '+' : '') + ' waiting, ';
  t += w.skippedN ? w.skippedN + ' skipped (' + w.skipped.map(function (b) { return b.rid + ': ' + b.n; }).join(', ') + '; oldest ' + logbookOutboxDays_(w.oldestSkippedMs) + ' days)' : 'none skipped';
  // not skipped, yet still here a day after they were logged: is the 5-minute run running?
  if (w.oldOther) t += ', ' + w.oldOther + ' logged over a day ago for ' + (w.oldOther === 1 ? 'a resident' : 'residents') + ' on the Residents tab (check logbookOutboxRun in Executions)';
  return t + '.';
}
function logbookOutboxWaitingLines_(w) {
  return w.skipped.map(function (b) { return 'Outbox skipped: ' + b.n + ' entries for ' + b.reason + ' (oldest ' + logbookOutboxDays_(b.oldestMs) + ' days)'; });
}

// Reads the whole outbox (a read per entry) and the Residents tab
function logbookOutboxWaitingNow_() {
  var all = logbookOutboxAll_(), known = logbookOutboxResidents_(SpreadsheetApp.getActiveSpreadsheet()).known;
  var w = logbookOutboxWaiting_(all.entries, function (rid) { return !!known[rid]; }, Date.now());
  w.capped = all.capped;
  return w;
}

// The nightly trigger (logbookOutboxTotalsSetup adds it). Rebuilds only when LOGBOOK_TOTALS_FIX is 'on'. Also reports
// what waits in the outbox, and fails (so Google emails the owner) when an entry has been skipped for over a day.
// It holds the script lock, as a 5-minute run does (the runs meanwhile do nothing, and the next one catches up). If a run is
// still going after LOGBOOK_OUTBOX_NIGHT_WAIT_MS, tonight's check only reports.
function logbookOutboxTotalsCheck() {
  var props = PropertiesService.getScriptProperties();
  var run = LockService.getScriptLock(), locked = run.tryLock(LOGBOOK_OUTBOX_NIGHT_WAIT_MS);
  try {
    var w = null, wErr = '';
    try { w = logbookOutboxWaitingNow_(); } catch (err) { wErr = 'Outbox not checked: ' + err.message; }   // first: quick, and the rebuilds can be slow
    var fixOn = props.getProperty(LOGBOOK_TOTALS_FIX_KEY) === 'on';
    var s = logbookOutboxTotalsCycle_(logbookOutboxTotalsEnv_(fixOn && locked));
    if (fixOn && !locked && s.status === 'differs') s.reason = 'an outbox run was still going, so no rebuild tonight';
    var text = Utilities.formatDate(new Date(), 'Asia/Singapore', 'dd/MM/yyyy HH:mm') + ': ' + logbookOutboxTotalsSummaryText_(s) + ' ' + (w ? logbookOutboxWaitingText_(w) : wErr);
    props.setProperty(LOGBOOK_TOTALS_LAST_KEY, text);
    console.log(text);
    if (s.detail) { s.detail.db.slice(0, 20).forEach(function (d) { console.log('Case vs Database: ' + d.rid + ' ' + d.label + ' case ' + d.caseCount + ' Database ' + d.dbCount); }); s.detail.ay.slice(0, 20).forEach(function (d) { console.log('Database vs ' + d.ay + ' Totals: ' + d.rid + ' ' + d.label + ' Database ' + d.dbCount + ' tab ' + d.tabCount); }); }
    if (w) logbookOutboxWaitingLines_(w).forEach(function (t) { console.log(t); });
    var problems = logbookOutboxNightProblems_(s, w, wErr);
    if (problems.length) throw new Error(problems.join(' ') + ' ' + text);
  } finally { if (locked) run.releaseLock(); }
}

// What makes the nightly run fail (so Google emails the owner): totals still off after a rebuild, the outbox unreadable, or
// an entry skipped for over a day
function logbookOutboxNightProblems_(s, w, wErr) {
  var p = [];
  if (s && s.status === 'still differs') p.push('Totals still differ after the rebuild.');
  if (wErr) p.push(wErr + '.');
  if (w && w.overdue) {
    var rids = w.skipped.filter(function (b) { return b.oldestMs > LOGBOOK_OUTBOX_SKIP_ALERT_MS; }).map(function (b) { return b.rid; });
    p.push(w.overdue + ' app case' + (w.overdue === 1 ? '' : 's') + ' waited over a day in the outbox without reaching the sheet (resident id' + (rids.length === 1 ? ' ' : 's ') +
      rids.join(', ') + '). If the id is right: add the resident (name and that 6-digit id) to the Residents tab, and the next runs add the cases. ' +
      'If it is wrong (not 6 digits, or since corrected in the app\'s People list): the waiting entries keep the id they were queued with (a fix in People ' +
      'changes only cases logged after it), so run logbookOutboxDropRid for that id (OUTBOX-README.md) to list them and then delete them, and add those cases ' +
      'to the sheet by hand if it needs them.');
  }
  return p;
}

// ---------- entries the sheet will never take (by hand) ----------
// An entry keeps the resident id it was queued with. If that id is wrong (not 6 digits, or one since corrected in the app's
// People list, which changes only the cases logged after the fix), its entries are skipped for good and the nightly check
// fails every night. This lists them, with what each case says (to add by hand if the sheet needs it), and deletes them only
// when asked to. It refuses an id that is on the Residents tab: those entries are on their way to the sheet.
// From the editor (Run passes no arguments): set the Script property LOGBOOK_OUTBOX_DROP_RID to the id and run
// logbookOutboxDropRid, which only lists. To delete them, also set LOGBOOK_OUTBOX_DROP_CONFIRM to the same id and run it
// again; both properties are then removed. (Called with arguments: logbookOutboxDropRid('R2') lists, ('R2', true) deletes.)
function logbookOutboxDropRid(rid, confirm) {
  var props = PropertiesService.getScriptProperties();
  var fromProps = rid == null || typeof rid === 'object';   // Run in the editor passes nothing (a trigger would pass an event)
  if (fromProps) { rid = props.getProperty(LOGBOOK_OUTBOX_DROP_RID_KEY) || ''; confirm = !!rid && props.getProperty(LOGBOOK_OUTBOX_DROP_CONFIRM_KEY) === rid; }
  var all = logbookOutboxAll_(), known = logbookOutboxResidents_(SpreadsheetApp.getActiveSpreadsheet()).known;
  var r = logbookOutboxDropRid_({ entries: all.entries, residentOk: function (x) { return !!known[x]; }, remove: logbookOutboxDelete_, log: function (t) { console.log(t); } }, rid, confirm === true);
  if (all.capped) console.log('The outbox holds more than ' + LOGBOOK_OUTBOX_ALL_MAX + ' entries and only those were looked at: run it again for the rest.');
  else if (fromProps && r.deleted) { props.deleteProperty(LOGBOOK_OUTBOX_DROP_RID_KEY); props.deleteProperty(LOGBOOK_OUTBOX_DROP_CONFIRM_KEY); }
}

// env: { entries (every entry), residentOk(rid), remove(id), log(text) } -> { found, deleted, refused }
function logbookOutboxDropRid_(env, rid, confirm) {
  rid = String(rid || '');
  if (!rid) throw new Error('Which resident id? Set the Script property ' + LOGBOOK_OUTBOX_DROP_RID_KEY + ' to it (OUTBOX-README.md).');
  var mine = env.entries.filter(function (e) { return String(e.rid || '') === rid; });
  if (!logbookOutboxSkipReason_(rid, env.residentOk)) {
    env.log(rid + ' is on the Residents tab, so ' + (mine.length === 1 ? 'its waiting entry is' : 'its ' + mine.length + ' waiting entries are') + ' on the way to the sheet: nothing deleted.');
    return { found: mine.length, deleted: 0, refused: true };
  }
  mine.forEach(function (e) {
    var row = logbookOutboxRow_(e, '');
    env.log(e.id + ': ' + [e.date || e.dateText || '(no date)', row[2], row.slice(3, 7).filter(String).join(' / ')].join(' | '));
  });
  if (!confirm) {
    env.log(mine.length + ' entr' + (mine.length === 1 ? 'y waits' : 'ies wait') + ' under ' + rid + '. Nothing deleted. To delete ' + (mine.length === 1 ? 'it' : 'them') +
      ', set the Script property ' + LOGBOOK_OUTBOX_DROP_CONFIRM_KEY + ' to ' + rid + ' as well and run logbookOutboxDropRid again.');
    return { found: mine.length, deleted: 0, refused: false };
  }
  mine.forEach(function (e) { env.remove(e.id); });
  env.log('Deleted ' + mine.length + ' entr' + (mine.length === 1 ? 'y' : 'ies') + ' under ' + rid + ' (listed above). Those cases are in the app only.');
  return { found: mine.length, deleted: mine.length, refused: false };
}

// Run by hand any time: lists the differences, changes nothing.
function logbookOutboxTotalsReport() {
  var s = logbookOutboxTotalsCycle_(logbookOutboxTotalsEnv_(false));
  console.log(logbookOutboxTotalsSummaryText_(s));
  try { var w = logbookOutboxWaitingNow_(); console.log(logbookOutboxWaitingText_(w)); logbookOutboxWaitingLines_(w).forEach(function (t) { console.log(t); }); }
  catch (err) { console.log('Outbox not checked: ' + err.message); }
  if (s.detail) { s.detail.db.slice(0, 50).forEach(function (d) { console.log('Case vs Database: ' + d.rid + ' ' + d.label + ' case ' + d.caseCount + ' Database ' + d.dbCount); }); s.detail.ay.slice(0, 50).forEach(function (d) { console.log('Database vs ' + d.ay + ' Totals: ' + d.rid + ' ' + d.label + ' Database ' + d.dbCount + ' tab ' + d.tabCount); }); if (s.detail.ignored.length) console.log('Totals tabs have no row for: ' + s.detail.ignored.join(' | ')); }
}

// Run once by hand: adds the nightly trigger at about 03:00 (the project's time zone). It only reports until you also set the
// Script property LOGBOOK_TOTALS_FIX to on. Safe to run again.
function logbookOutboxTotalsSetup() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'logbookOutboxTotalsCheck'; });
  if (!has) ScriptApp.newTrigger('logbookOutboxTotalsCheck').timeBased().everyDays(1).atHour(3).create();
  console.log(has ? 'Trigger already there.' : 'Trigger added: logbookOutboxTotalsCheck, daily at about 03:00. It only reports until the Script property ' + LOGBOOK_TOTALS_FIX_KEY + ' is set to on.');
}

if (typeof module !== 'undefined') module.exports = { labels: LOGBOOK_OUTBOX_LABELS, categories: logbookOutboxCategories_, row: logbookOutboxRow_, add: logbookOutboxAdd_, cycle: logbookOutboxCycle_, chunk: LOGBOOK_OUTBOX_CHUNK, entryOf: logbookOutboxEntryOf_, date: logbookOutboxDate_,
  caseCounts: logbookOutboxCaseCounts_, dbCounts: logbookOutboxDbCounts_, totalsDiff: logbookOutboxTotalsDiff_, totalsCycle: logbookOutboxTotalsCycle_, noUi: logbookOutboxNoUi_,
  batch: LOGBOOK_OUTBOX_BATCH, pageQuery: logbookOutboxPageQuery_, entriesOf: logbookOutboxEntriesOf_, waiting: logbookOutboxWaiting_, waitingText: logbookOutboxWaitingText_, nightProblems: logbookOutboxNightProblems_,
  io: logbookOutboxIo_, dropRid: logbookOutboxDropRid_ };
