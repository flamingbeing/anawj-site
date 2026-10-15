// APMES case logbook: the Google Form inbox script (paste into the Form's Apps Script editor; setup in README.md
// beside this file). On every new or edited Form response it sends just that response to the logbook's inbox
// (Firestore formInbox/{responseId}); the resident's logbook picks it up the next time they open the app
// (logbook/js/form-inbox.js). One way only: nothing comes back to the Form or its sheet.
//
// It signs in as the Form bot account (Firebase email and password, kept in Script properties, never in this file).
// The logbook's rules let that account only add or replace inbox entries: it can't read anything.
//
// No question titles are hard-coded: category answers are recognised by their code ("16) …", "20iii) …"), the date
// by the Form's date question, the case text by the text question whose title mentions initials or details.
//
// Every name here starts with LOGBOOK_ or logbookInbox, so it can sit beside another script (the response sheet's
// own onFormSubmit, Database and report code) without replacing or clashing with anything. Keep it in its own file.

var LOGBOOK_PROJECT_ID = 'apmes-logbook';
var LOGBOOK_API_KEY = 'AIzaSyDRC7COpi86H0K6oe98XZ8m1sQWJUkP63E';   // the logbook's public web key (logbook/js/firebase-config.js)
var LOGBOOK_SITE = 'https://apmes.anawj.com/';                      // sent as Referer, in case the key is limited to the site
var LOGBOOK_CODE_RE = /^\d{2}[ivx]*\)/i;
// an NRIC/FIN or a long number (hospital, phone): never sent (the same pattern as logbook/js/engine.js ID_RE)
var LOGBOOK_ID_RE = /\b[STFGM]\d{7}[A-Z]\b|\b\d{7,}\b/gi;
// a choice question about categories: its answers that aren't a code are sent too, so the logbook notes them
var LOGBOOK_CATEGORY_TITLE_RE = /categor|procedure|surgery|block/i;
var LOGBOOK_CHOICE_TYPES = ['CHECKBOX', 'LIST', 'MULTIPLE_CHOICE'];

// ---------- turning one response into an inbox entry (pure: tested in Node, test/form-script.test.mjs) ----------

// answers: [{ title, type ('DATE', 'TEXT', 'PARAGRAPH_TEXT', 'CHECKBOX', 'LIST', 'MULTIPLE_CHOICE', …), value }]
// (value: a string, or an array of strings for checkboxes). -> the entry, or { skip: reason }
function logbookInboxEntry_(id, email, submittedAt, answers) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { skip: 'no respondent email (the Form must collect verified emails)' };
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(String(id || ''))) return { skip: 'unexpected response id' };
  var labels = [], date = null, dateText = '', details = null, firstText = null;
  for (var i = 0; i < answers.length; i++) {
    var a = answers[i], vals = Array.isArray(a.value) ? a.value : [a.value];
    var title = String(a.title || '').toLowerCase();
    // labels come only from choice questions (a typed answer that starts with "16)" isn't a category)
    if (LOGBOOK_CHOICE_TYPES.indexOf(a.type) >= 0) {
      var categoryQ = LOGBOOK_CATEGORY_TITLE_RE.test(title);
      for (var j = 0; j < vals.length; j++) {
        var v = String(vals[j] == null ? '' : vals[j]).trim();
        if (v && (LOGBOOK_CODE_RE.test(v) || categoryQ) && labels.indexOf(v) < 0 && labels.length < 40) labels.push(v.slice(0, 300));
      }
    }
    // the date question ("include time" makes it a DATETIME: "YYYY-MM-DD HH:MM")
    if ((a.type === 'DATE' || a.type === 'DATETIME') && date === null && dateText === '') {
      var d = String(a.value || '').trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) date = d.slice(0, 10); else dateText = d.slice(0, 200);
    }
    if (a.type === 'TEXT' || a.type === 'PARAGRAPH_TEXT') {
      var t = String(a.value || '');
      if (firstText === null) firstText = t;
      if (details === null && /initial|detail/.test(title)) details = t;
    }
  }
  var text = String(details !== null ? details : (firstText || '')).replace(LOGBOOK_ID_RE, '[ID removed]');
  var entry = { id: String(id), email: email, date: date, details: text.slice(0, 2000),
    labels: labels, submittedAt: Number(submittedAt) || 0 };
  if (dateText) entry.dateText = dateText;
  return entry;
}

// Firestore REST value encoding for an entry
function logbookInboxFields_(entry) {
  var f = {};
  for (var k in entry) {
    var v = entry[k];
    if (v === null) f[k] = { nullValue: null };
    else if (Array.isArray(v)) f[k] = { arrayValue: { values: v.map(function (s) { return { stringValue: String(s) }; }) } };
    else if (typeof v === 'number') f[k] = { integerValue: String(Math.round(v)) };
    else f[k] = { stringValue: String(v) };
  }
  return f;
}

// ---------- Apps Script side ----------

function logbookInboxAnswers_(response) {
  return response.getItemResponses().map(function (r) {
    var item = r.getItem();
    return { title: item.getTitle(), type: String(item.getType()), value: r.getResponse() };
  });
}

function logbookInboxEntryOf_(response) {
  return logbookInboxEntry_(response.getId(), response.getRespondentEmail(), response.getTimestamp().getTime(), logbookInboxAnswers_(response));
}

// Only a Google-verified respondent email may address the inbox: with typed-in emails anyone could fill someone
// else's logbook. Settings → Responses → Collect email addresses must be "Verified".
function logbookInboxVerified_() {
  var f = FormApp.getActiveForm();
  if (typeof f.getEmailCollectionType === 'function') return String(f.getEmailCollectionType()) === 'VERIFIED';
  return f.collectsEmail();
}

// the bot's sign-in, kept for 50 minutes (a sign-in lasts an hour), so a burst of submissions signs in once
function logbookInboxToken_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) { var hit = cache.get('logbookInboxToken'); if (hit) return hit; }
  var p = PropertiesService.getScriptProperties();
  var email = p.getProperty('BOT_EMAIL'), password = p.getProperty('BOT_PASSWORD');
  if (!email || !password) throw new Error('Set BOT_EMAIL and BOT_PASSWORD in Project settings → Script properties.');
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + LOGBOOK_API_KEY, {
    method: 'post', contentType: 'application/json', headers: { Referer: LOGBOOK_SITE }, muteHttpExceptions: true,
    payload: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
  });
  if (res.getResponseCode() !== 200) throw new Error('Bot sign-in failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  var token = JSON.parse(res.getContentText()).idToken;
  cache.put('logbookInboxToken', token, 3000);
  return token;
}

function logbookInboxSend_(entry, token) {
  var res = logbookInboxPatch_(entry, token || logbookInboxToken_());
  // a kept sign-in that no longer works (password changed, expired): sign in again once
  if (res.getResponseCode() === 401 || res.getResponseCode() === 403) res = logbookInboxPatch_(entry, logbookInboxToken_(true));
  if (res.getResponseCode() !== 200) throw new Error('Inbox write failed for ' + entry.id + ': ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
}
function logbookInboxPatch_(entry, token) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + LOGBOOK_PROJECT_ID + '/databases/(default)/documents/formInbox/' + encodeURIComponent(entry.id);
  var res = UrlFetchApp.fetch(url, {
    method: 'patch', contentType: 'application/json', headers: { Authorization: 'Bearer ' + token, Referer: LOGBOOK_SITE }, muteHttpExceptions: true,
    payload: JSON.stringify({ fields: logbookInboxFields_(entry) }),
  });
  return res;
}

// The trigger (Triggers → Add trigger → logbookInboxSubmit, From form, On form submit). Edited responses fire it too.
// A skip throws, so it shows in Executions and Google's failure email; it never touches the sheet or its script.
function logbookInboxSubmit(e) {
  if (!logbookInboxVerified_()) throw new Error('Not sent: set Settings → Responses → Collect email addresses to "Verified".');
  var entry = logbookInboxEntryOf_(e.response);
  if (entry.skip) throw new Error('Not sent: ' + entry.skip);
  logbookInboxSend_(entry);
}

// Run once by hand after setting BOT_EMAIL and BOT_PASSWORD: adds the On form submit trigger (if it isn't there yet),
// checks the bot can sign in, and shows what the latest response would send. Safe to run again.
function logbookInboxSetup() {
  var form = FormApp.getActiveForm();
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'logbookInboxSubmit'; });
  if (!has) ScriptApp.newTrigger('logbookInboxSubmit').forForm(form).onFormSubmit().create();
  console.log(has ? 'Trigger already there.' : 'Trigger added: logbookInboxSubmit, on form submit.');
  logbookInboxToken_(true);
  console.log('Bot sign-in works.');
  logbookInboxDryRun();
}

// Run by hand once, to check the mapping on the latest response: logs what would be sent (only you see the log).
function logbookInboxDryRun() {
  var rs = FormApp.getActiveForm().getResponses();
  if (!logbookInboxVerified_()) console.warn('Email collection is not "Verified": the trigger would refuse to send.');
  if (!rs.length) { console.log('No responses yet.'); return; }
  console.log(JSON.stringify(logbookInboxEntryOf_(rs[rs.length - 1]), null, 2));
}

// Optional, run by hand: sends responses from a date onwards (e.g. one whose send failed). The logbook leaves out
// ones it already has (from the inbox or the workbook import) and Form cases the resident deleted. Safe to run again.
// SINCE is the day the inbox went live (14 Oct 2026): responses before it came in with the Admin portal's workbook
// import. An earlier SINCE sends those again: the logbook skips the ones the import brought in, but an imported case
// the resident deleted more than 30 days ago (out of the recycle bin) would come back.
function logbookInboxBackfill() {
  var SINCE = new Date('2026-10-14T00:00:00+08:00');
  if (!logbookInboxVerified_()) throw new Error('Set Settings → Responses → Collect email addresses to "Verified" first.');
  var rs = FormApp.getActiveForm().getResponses(SINCE), sent = 0, skipped = 0, failed = 0;
  for (var i = 0; i < rs.length; i++) {
    var entry = logbookInboxEntryOf_(rs[i]);
    if (entry.skip) { skipped++; continue; }   // e.g. responses from before emails were collected
    try { logbookInboxSend_(entry); sent++; } catch (err) { failed++; console.warn(err.message); }
    if ((i + 1) % 50 === 0) console.log((i + 1) + ' of ' + rs.length + ' done');
  }
  console.log('Sent ' + sent + ', skipped ' + skipped + ' (no email), failed ' + failed + ', of ' + rs.length + '.');
}

if (typeof module !== 'undefined') module.exports = { entryFrom: logbookInboxEntry_, firestoreFields: logbookInboxFields_ };
