// NTF Roster: the one place the roster state lives. Every change goes through commit(), which works on a copy
// (structuredClone), keeps the old state for undo (up to 40 steps), saves to localStorage and tells subscribers.
// Like a paper roster with a photocopy taken before every edit: undo puts the last photocopy back.
import * as M from './model.js';

const MAX_UNDO = 40;

export function createStore({ demo = false, fallback } = {}) {
  const key = demo ? M.DEMO_KEY : M.STORE_KEY;
  let state = load();
  let undo = [];   // [{ label, state }] newest last
  let redo = [];
  const subs = new Set();

  function load() {
    let saved = null;
    try { const raw = localStorage.getItem(key); if (raw) saved = JSON.parse(raw); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') return safeMigrate(saved);
    const fresh = typeof fallback === 'function' ? fallback() : (fallback || M.defaultState());
    return safeMigrate(fresh);
  }

  function safeMigrate(s) {
    try { return M.migrate ? M.migrate(s) : s; } catch (e) { console.warn('migrate failed', e); return s; }
  }

  function notify(label, source) {
    for (const fn of subs) {
      try { fn(state, { label, source }); } catch (e) { console.error(e); }
    }
  }

  const store = {
    isDemo: !!demo,
    key,
    onSaveError: null,   // set by the app: shows a bar with "Download backup"

    get() { return state; },

    commit(label, fn) {
      const draft = structuredClone(state);
      const out = fn(draft);
      if (out === false) return false;   // fn can cancel by returning false
      undo.push({ label, state });
      if (undo.length > MAX_UNDO) undo.shift();
      redo = [];
      state = draft;
      store.save();
      notify(label, 'commit');
      return true;
    },

    replace(next, label = 'Replace') {
      undo.push({ label, state });
      if (undo.length > MAX_UNDO) undo.shift();
      redo = [];
      state = safeMigrate(structuredClone(next));
      store.save();
      notify(label, 'replace');
    },

    undo() {
      const step = undo.pop();
      if (!step) return null;
      redo.push({ label: step.label, state });
      state = step.state;
      store.save();
      notify(step.label, 'undo');
      return step.label;
    },

    redo() {
      const step = redo.pop();
      if (!step) return null;
      undo.push({ label: step.label, state });
      state = step.state;
      store.save();
      notify(step.label, 'redo');
      return step.label;
    },

    canUndo() { return undo.length > 0; },
    canRedo() { return redo.length > 0; },
    undoLabel() { return undo.length ? undo[undo.length - 1].label : ''; },
    redoLabel() { return redo.length ? redo[redo.length - 1].label : ''; },

    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    save() {
      try {
        localStorage.setItem(key, JSON.stringify(state));
        return true;
      } catch (e) {
        console.warn('save failed', e);
        if (typeof store.onSaveError === 'function') store.onSaveError(e);
        return false;
      }
    },

    // Start again from a fresh state (used by "Reset practice"). Undoable like any replace.
    reset(fresh, label = 'Reset') { store.replace(fresh, label); },
  };
  return store;
}
