// Private feedback (More → Send feedback): what a record holds, and the owner's "Copy as task" text with names and
// numbers taken out. Pure, so it is unit tested (test/feedback.test.mjs). The record's fields match the feedback/{id}
// rule in firestore.rules; residents never use the site's public feedback routes (they make public GitHub issues).

export const TEXT_MAX = 2000, DOING_MAX = 300, UA_MAX = 200, SCREEN_MAX = 40, VERSION_MAX = 60;
export const STATUSES = ['new', 'done'];

// Only the page's name ('logbook' from '#logbook?x=1' or '#caselog/abc'): never anything typed or shown on it.
export function screenOf(hash) {
  const s = String(hash || '').replace(/^#/, '').split(/[^\w-]/)[0];
  return s.slice(0, SCREEN_MAX) || 'unknown';
}

const clip = (s, n) => String(s ?? '').trim().slice(0, n);

// The record a resident sends. `createdAt` is added by the backend (the server's clock: serverTimestamp()).
export function feedbackRecord({ uid, text, doing, screen, version, ua }) {
  const rec = {
    uid: clip(uid, 128),
    text: clip(text, TEXT_MAX),
    screen: screenOf(screen),
    version: clip(version, VERSION_MAX) || 'unknown',
    ua: clip(String(ua ?? '').replace(/\s+/g, ' '), UA_MAX) || 'unknown',
    status: 'new',
  };
  const d = clip(doing, DOING_MAX);
  if (d) rec.doing = d;
  return rec;
}

// What stops Send: an empty box, too long, or the "no patient details" tick missing.
export function sendProblem({ text, doing, tick }) {
  const t = String(text ?? '').trim();
  if (!t) return 'Write your feedback first.';
  if (t.length > TEXT_MAX) return `Keep it under ${TEXT_MAX} characters.`;
  if (String(doing ?? '').trim().length > DOING_MAX) return `Keep “What were you doing?” under ${DOING_MAX} characters.`;
  if (!tick) return 'Tick “This contains no patient details” first.';
  return '';
}

// The same patterns as PRIVATE in feedback/overlay.js (the public 💬 button warns on them); the unit test checks the
// two lists stay in step. Here each match is replaced, so a copied task carries no names or numbers.
export const PRIVATE = [
  [/\b[STFGM]\d{7}[A-Z]\b/i, '[ID]'],
  [/\b\d{7,}\b/, '[number]'],
  [/\b\d{1,2}[\/.-]\d{1,2}[\/.-](19|20)?\d{2}\b/, '[date]'],
  [/(?<![\d.])[689]\d{3}[ -]?\d{4}(?![\d.])/, '[phone]'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/, '[email]'],
  [/\b(?:[Mm]rs?|[Mm]s|[Mm]dm|[Mm]adam|[Pp]atient|[Pp]t)\.?\s+[A-Z][a-z]+/, '[name]'],
];
export function scrub(s) {
  let out = String(s ?? '');
  for (const [re, put] of PRIVATE) out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), put);
  return out;
}

const isoDay = ms => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : 'unknown date');

// "Copy as task": a short brief to paste into a coding session. No uid, no browser string; text scrubbed.
export function taskText(f) {
  return [
    `Logbook feedback (${isoDay(f.createdAt)}, screen #${screenOf(f.screen)}, version ${clip(f.version, VERSION_MAX) || 'unknown'})`,
    f.doing ? 'Doing: ' + scrub(f.doing) : null,
    'Feedback: ' + scrub(f.text),
  ].filter(Boolean).join('\n');
}

// newest first; items still being written (no server time yet) on top
export const byNewestFeedback = (a, b) => (b.createdAt ?? Infinity) - (a.createdAt ?? Infinity) || String(a.id).localeCompare(String(b.id));
