// What sync keeps on a device (ui-sync.js): the ledgers and GitHub tokens in localStorage and the base copies in
// IndexedDB. Wiped at sign-out, an account switch and a demo reset; its own small file, so that works before the
// Sync code has loaded (app.js), with nothing of the last person's left.
export const LEDGER = 'apmes-logbook-cloud-sync:', TOKEN = 'apmes-logbook-cloud-gh:', DB = 'apmes-logbook-sync';
// closing: the open base-copy database, if any (closed first, so the delete isn't blocked)
export function wipeSyncDevice(closing = null) {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(LEDGER) || k.startsWith(TOKEN)) localStorage.removeItem(k); } catch { /* blocked */ }
  try {
    Promise.resolve(closing).then(d => d && d.close()).catch(() => {}).finally(() => { try { indexedDB.deleteDatabase(DB); } catch { /* none */ } });
  } catch { /* none */ }
}
