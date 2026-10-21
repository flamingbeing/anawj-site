// Firestore REST, as the signed-in user (so firestore.rules apply exactly as in the app).
// Only the user's own logbook (logbooks/{email} and its cases / reflections) and the residents entry
// with their email are ever read. Writes go only to the user's own cases and reflections, and to the
// sheet outbox entry of a new case (as the app does). The HTTP layer (fetch) and the token source are
// injected for tests.

// ---- typed values -> plain JS ----

export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return { lat: v.geoPointValue.latitude ?? 0, lng: v.geoPointValue.longitude ?? 0 };
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  return null;
}

export const decodeFields = fields => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));

// A Firestore document -> its fields, with `id` set from the document name when the data has none.
export function decodeDoc(doc) {
  if (!doc) return null;
  const data = decodeFields(doc.fields);
  const id = String(doc.name || '').split('/').pop();
  return data.id == null && id ? { ...data, id } : data;
}

// ---- plain JS -> typed values (the shapes cleanCase / cleanReflection make: strings, numbers, booleans, null,
// lists and maps) ----

export function encodeValue(v) {
  if (v == null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(encodeValue) } : {} };
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v) } };
  throw new Error(`Cannot store a ${typeof v}`);
}

export const encodeFields = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encodeValue(v)]));

// ---- client ----

export class FirestoreError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const lc = s => String(s || '').trim().toLowerCase();

// getIdToken(force) -> a Firebase ID token. fetch defaults to the global one.
export function makeFirestore({ projectId, getIdToken, fetch = globalThis.fetch, pageSize = 300 }) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  async function call(url, init = {}) {
    for (let attempt = 0; ; attempt++) {
      const token = await getIdToken(attempt > 0);
      const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
      if (res.status === 401 && attempt === 0) continue;   // stale token: refresh once
      if (res.status === 404) return null;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message || res.statusText || 'request failed';
        throw new FirestoreError(res.status === 403
          ? `Firestore refused access (${msg}). Try signing in again with the login command.`
          : `Firestore error ${res.status}: ${msg}`, res.status);
      }
      return body;
    }
  }

  const docUrl = segments => `${base}/${segments.map(encodeURIComponent).join('/')}`;

  return {
    async getDoc(segments) { return decodeDoc(await call(docUrl(segments))); },

    // Writes the whole document (replacing one that is there). mustNotExist: refused if it already exists.
    async setDoc(segments, data, { mustNotExist = false } = {}) {
      const q = mustNotExist ? '?currentDocument.exists=false' : '';
      const body = await call(docUrl(segments) + q, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFields(data) }),
      });
      if (!body) throw new FirestoreError('Firestore error 404: not saved', 404);
      return decodeDoc(body);
    },

    // Changes only the named top-level fields of a document (creating it if needed), leaving the rest as they are.
    async patchFields(segments, data) {
      const q = new URLSearchParams();
      for (const k of Object.keys(data)) q.append('updateMask.fieldPaths', k);
      const body = await call(`${docUrl(segments)}?${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFields(data) }),
      });
      if (!body) throw new FirestoreError('Firestore error 404: not saved', 404);
      return decodeDoc(body);
    },

    async listCollection(segments) {
      const out = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({ pageSize: String(pageSize) });
        if (pageToken) q.set('pageToken', pageToken);
        const body = await call(`${docUrl(segments)}?${q}`);
        for (const d of body?.documents || []) out.push(decodeDoc(d));
        pageToken = body?.nextPageToken || '';
      } while (pageToken);
      return out;
    },

    // documents in a top-level collection where field == value (as the app does for residents)
    async queryEqual(collectionId, field, value, limit = 1) {
      const body = await call(`${base}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
          limit,
        } }),
      });
      return (Array.isArray(body) ? body : []).filter(r => r && r.document).map(r => decodeDoc(r.document));
    },
  };
}

// The user's own data, and nothing else.
export function makeLogbookSource({ firestore, email }) {
  const me = lc(email);
  if (!me || !me.includes('@')) throw new Error('No signed-in email');
  const own = ['logbooks', me];
  return {
    email: me,
    logbook: () => firestore.getDoc(own),
    cases: () => firestore.listCollection([...own, 'cases']),
    reflections: () => firestore.listCollection([...own, 'reflections']),
    saveCase: c => firestore.setDoc([...own, 'cases', String(c.id)], c),
    saveReflection: r => firestore.setDoc([...own, 'reflections', String(r.id)], r),
    // a new case's copy for the response sheet (rules: the entry carries this user's email and logbook rid; one
    // already there is refused, as in the app)
    // the planned cases (logbook.plan) only; email goes too, as the rules want it on the logbook document
    savePlan: plan => firestore.patchFields(own, { email: me, plan, updatedAt: Date.now() }),
    queueSheetRow: e => firestore.setDoc(['sheetOutbox', String(e.id)], e, { mustNotExist: true }),
    // the residents rule lets a user read only the entry carrying their own email
    async resident() {
      try { return (await firestore.queryEqual('residents', 'email', me, 1))[0] || null; }
      catch (e) { if (e.status === 403) return null; throw e; }
    },
  };
}
