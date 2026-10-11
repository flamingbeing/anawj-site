// Settings export / import (Settings → Settings file): your preferences, tag set, shorthand, tag groups,
// copy & share format, Excel choices and saved searches as one small JSON file, to move them to another
// account or share a setup with a colleague. Never cases, reflections or portfolio details. Pure, tested.

import { cleanTagSet } from './tags.js';
import { cleanTemplate } from './demo-backend.js';

export const SETTINGS_KIND = 'apmes-logbook-settings';
// account-specific bookkeeping that shouldn't travel with the file
const SKIP = new Set(['sharedSeen']);
const MAX_JSON = 400 * 1024;

export function settingsFile(logbook, { theme } = {}) {
  const lb = logbook || {};
  const settings = Object.fromEntries(Object.entries(lb.settings || {}).filter(([k, v]) => !SKIP.has(k) && v !== undefined));
  return { kind: SETTINGS_KIND, version: 1, exportedAt: new Date().toISOString(), settings, templates: lb.templates || [], ...(theme ? { theme } : {}) };
}

// A file's contents -> { settings, templates, theme } ready to save, or throws a message for the user
export function readSettingsFile(text) {
  if (String(text || '').length > MAX_JSON) throw new Error('That file is too big to be a settings file');
  let d;
  try { d = JSON.parse(text); } catch { throw new Error('That isn’t a settings file (not JSON)'); }
  if (!d || d.kind !== SETTINGS_KIND) throw new Error(d && d.kind === undefined && d.logbook ? 'That is a full backup: restore it under More → Export / Import' : 'That isn’t a settings file from this app');
  if (!d.settings || typeof d.settings !== 'object' || Array.isArray(d.settings)) throw new Error('The file has no settings');
  const settings = {};
  for (const [k, v] of Object.entries(d.settings)) {
    if (SKIP.has(k) || !/^[A-Za-z][A-Za-z0-9]{0,40}$/.test(k)) continue;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v) || typeof v === 'object') settings[k] = v;
  }
  if ('tagSet' in settings) settings.tagSet = settings.tagSet == null ? null : cleanTagSet(settings.tagSet);
  const templates = Array.isArray(d.templates) ? d.templates.slice(0, 100).map(cleanTemplate).filter(t => t.id && t.cats.length) : null;
  const theme = ['light', 'dark', 'auto'].includes(d.theme) ? d.theme : null;
  return { settings, templates, theme };
}
