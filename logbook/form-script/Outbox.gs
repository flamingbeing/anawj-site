// APMES case logbook: the response sheet's outbox script (paste into the RESPONSE SHEET's own Apps Script project as a
// new file, e.g. "LogbookOutbox"; setup in OUTBOX-README.md beside this file). Every few minutes it takes the cases
// residents logged in the app (Firestore sheetOutbox/{caseId}, written by logbook/js/sheet-outbox.js), adds each to the
// Case tab as a row exactly as a Form response would look, runs the sheet's own update chain on it (Database, the
// resident's report, the AY totals) and deletes the entry. New cases only: edits and deletions in the app never reach
// the sheet. Column J of the Case tab holds "app:<caseId>" on these rows, so a case is never added twice and the
// logbook's workbook import skips them.
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
var LOGBOOK_OUTBOX_BATCH = 10;         // entries per run; the rest wait for the next one (one lock hold each: see logbookOutboxRun)
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

// The whole pass over a list of entries, with the sheet and the existing script behind io (so it is tested with fakes):
//   io.markers (an object: 'app:<id>' -> true, read from column J), io.residentOk(rid), io.residentText(rid),
//   io.appendRow(row) -> the new row's number, io.database(rowNumber, first8Values), io.reports(rids[], ays[]), io.sort()
// -> { done: [ids whose entry can be deleted], skipped: [{ id, reason }], errors: [text] }
function logbookOutboxProcess_(entries, io) {
  var done = [], skipped = [], errors = [], rids = {}, ays = {}, added = 0;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i], mark = 'app:' + e.id;
    if (io.markers[mark]) { done.push(e.id); continue; }   // already in the sheet (a run that stopped before the delete)
    var rid = String(e.rid || '');
    if (!/^\d{6}$/.test(rid)) { skipped.push({ id: e.id, reason: 'resident id is not 6 digits: ' + rid }); continue; }
    if (!io.residentOk(rid)) { skipped.push({ id: e.id, reason: 'no resident ' + rid + ' on the Residents sheet' }); continue; }
    var row = logbookOutboxRow_(e, io.residentText(rid));
    var rowNumber = io.appendRow(row);
    io.markers[mark] = true; added++;
    done.push(e.id);
    try { io.database(rowNumber, row.slice(0, 8)); } catch (err) { errors.push('Database for ' + e.id + ': ' + err.message); }
    rids[rid] = true; ays['AY' + rid.slice(0, 4)] = true;
  }
  if (added) {
    try { io.reports(Object.keys(rids), Object.keys(ays)); } catch (err) { errors.push('Reports: ' + err.message); }
    try { io.sort(); } catch (err) { errors.push('Sort: ' + err.message); }
  }
  return { done: done, skipped: skipped, errors: errors };
}

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

function logbookOutboxFetch_(method, path, query) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + LOGBOOK_OUTBOX_PROJECT_ID + '/databases/(default)/documents/' + path + (query || '');
  function go(token) {
    return UrlFetchApp.fetch(url, { method: method, headers: { Authorization: 'Bearer ' + token, Referer: LOGBOOK_OUTBOX_SITE }, muteHttpExceptions: true });
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

function logbookOutboxList_() {
  var res = logbookOutboxFetch_('get', 'sheetOutbox', '?pageSize=' + LOGBOOK_OUTBOX_BATCH);
  if (res.getResponseCode() !== 200) throw new Error('Outbox list failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  return (JSON.parse(res.getContentText()).documents || []).map(logbookOutboxEntryOf_);
}

function logbookOutboxDelete_(id) {
  var res = logbookOutboxFetch_('delete', 'sheetOutbox/' + encodeURIComponent(id));
  if (res.getResponseCode() !== 200 && res.getResponseCode() !== 404) console.warn('Outbox delete failed for ' + id + ': ' + res.getResponseCode());
}

// ---------- the sheet ----------

function logbookOutboxIo_(ss) {
  var caseSheet = ss.getSheetByName(LOGBOOK_OUTBOX_CASE_SHEET);
  if (!caseSheet) throw new Error('No "' + LOGBOOK_OUTBOX_CASE_SHEET + '" sheet.');
  var residents = ss.getSheetByName(LOGBOOK_OUTBOX_RESIDENTS_SHEET);
  if (!residents) throw new Error('No "' + LOGBOOK_OUTBOX_RESIDENTS_SHEET + '" sheet.');
  var known = {};   // resident id -> true (Residents column B)
  var rrows = residents.getLastRow() > 1 ? residents.getRange(2, 1, residents.getLastRow() - 1, 7).getValues() : [];
  rrows.forEach(function (r) { known[String(r[1])] = true; });
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
    reports: function (rids, ays) {
      rids.forEach(function (rid) { updateResidentReport(rid); });
      ays.forEach(function (ay) { updateAYSummaryReport(ay); });
    },
    sort: function () { sortByTimestampDescending_(caseSheet); },
  };
}

// ---------- entry points ----------

// The time trigger (every 5 minutes: logbookOutboxSetup adds it). Failures show in Apps Script → Executions, and Google
// emails the trigger's owner a daily summary; entries that failed stay in the outbox for the next run.
function logbookOutboxRun() {
  var entries = logbookOutboxList_();
  if (!entries.length) return;
  var io = logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet());
  var added = 0, skipped = [], errors = [];
  // One entry per hold of the document lock, with a pause between: the sheet's own onFormSubmit waits only 10 seconds
  // for that lock, and a resident's report can take several seconds to rebuild, so a long hold could make it miss a
  // Form response.
  for (var i = 0; i < entries.length; i++) {
    var lock = LockService.getDocumentLock();
    lock.waitLock(30000);
    var result;
    try { result = logbookOutboxProcess_([entries[i]], io); }
    finally { lock.releaseLock(); }
    result.done.forEach(logbookOutboxDelete_);
    added += result.done.length; skipped = skipped.concat(result.skipped); errors = errors.concat(result.errors);
    if (i < entries.length - 1) Utilities.sleep(2000);
  }
  console.log('Outbox: ' + added + ' added, ' + skipped.length + ' skipped, ' + errors.length + ' errors.');
  skipped.forEach(function (s) { console.warn('Skipped ' + s.id + ': ' + s.reason); });
  if (errors.length) throw new Error(errors.join('; '));
}

// Run by hand to check the bot can sign in and read the outbox (changes nothing). Use this, not logbookOutboxSetup, on a COPY.
function logbookOutboxCheck() {
  logbookOutboxToken_(true);
  console.log('Bot sign-in works; ' + logbookOutboxList_().length + ' entries waiting in the outbox.');
}

// Run once by hand after setting the two Script properties: checks the bot can sign in and read the outbox, adds the
// header "App marker" to column J if it is empty, and adds the 5-minute trigger if it isn't there. Safe to run again.
function logbookOutboxSetup() {
  logbookOutboxToken_(true);
  console.log('Bot sign-in works; ' + logbookOutboxList_().length + ' entries waiting in the outbox.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOGBOOK_OUTBOX_CASE_SHEET);
  var head = sheet.getRange(1, LOGBOOK_OUTBOX_MARK_COL);
  if (!String(head.getValue())) { head.setValue('App marker'); console.log('Column J header added.'); }
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'logbookOutboxRun'; });
  if (!has) ScriptApp.newTrigger('logbookOutboxRun').timeBased().everyMinutes(5).create();
  console.log(has ? 'Trigger already there.' : 'Trigger added: logbookOutboxRun, every 5 minutes.');
}

// Run by hand: shows what the waiting entries would add (the Case-tab rows), writes nothing and deletes nothing.
function logbookOutboxDryRun() {
  var entries = logbookOutboxList_();
  if (!entries.length) { console.log('The outbox is empty.'); return; }
  var io = logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet());
  entries.forEach(function (e) {
    var rid = String(e.rid || '');
    console.log(e.id + ': ' + (io.residentOk(rid) ? JSON.stringify(logbookOutboxRow_(e, io.residentText(rid))) : 'no resident ' + rid + ' on the Residents sheet'));
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
  try { console.log(JSON.stringify(logbookOutboxProcess_([entry], logbookOutboxIo_(SpreadsheetApp.getActiveSpreadsheet())))); }
  finally { lock.releaseLock(); }
}

if (typeof module !== 'undefined') module.exports = { labels: LOGBOOK_OUTBOX_LABELS, categories: logbookOutboxCategories_, row: logbookOutboxRow_, process: logbookOutboxProcess_, entryOf: logbookOutboxEntryOf_, date: logbookOutboxDate_ };
