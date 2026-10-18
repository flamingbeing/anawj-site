// Which folder of this repo each public address serves (SUBDOMAINS.md). Pure functions, no Cloudflare APIs, so
// worker/test/routes.test.mjs can check them in Node. worker/sites.js is the Worker that uses them.
//
// A host in SITES is served only from the folders listed for it: prewarmstudy.anawj.com can never reach the logbook's
// files, and so on. Any other host (the PR previews on workers.dev, the copy of main on anawj-preview) serves the
// whole repo as it is, as before.

// host -> { prefixes: { '/cmcj/': 'cmcj/' } }  (several apps share the host, one path each)
//      or { root: 'prewarm/' }                 (one app at the root; its own folder name works too)
//      or { moved: { '/bis/': 'https://anantf.com/bis/' } }  (apps now on another site: each path forwards there)
export const SITES = {
  // the anaesthesia teaching pages moved to anantf.com on 16 Oct 2026 (the BIS and OT simulators): old links forward
  'anaes.anawj.com': { moved: { '/bis/': 'https://anantf.com/bis/', '/ot/': 'https://anantf.com/ot/' } },
  'hand.anawj.com': { prefixes: { '/cmcj/': 'cmcj/', '/babies/': 'hand-babies/', '/handlog/': 'hand-log/' } },
  'prewarmstudy.anawj.com': { root: 'prewarm/' },
  'nuhroster.anawj.com': { root: 'nuh-roster/' },
  // NTF anaesthesia monthly duty roster (its own data, so its own host)
  'ntfroster.anawj.com': { root: 'ntf-roster/' },
  // NUH junior monthly roster helper (cardiac and ICU calls into the department's Google Sheet; its own data)
  'nuhjuniormonthly.anawj.com': { root: 'nuh-junior-monthly/' },
  // /people/ is the shared people lists (residents, faculty, PDs) the logbook and evals both use.
  // /apmes/guidebook/ is the programme guidebook text the evals app reads (just that folder of apmes/).
  // /__/auth/ and /__/firebase/ are Firebase's sign-in helper pages (the auth domain of logbook and evals). The helper
  // scripts are the same files anawj.com serves; init.json is this host's own copy (authDomain apmes.anawj.com).
  // Ask Claude, the owner's page (behind Cloudflare Access; its API is worker/ask.js)
  'ask.anawj.com': { root: 'ask/' },
  'apmes.anawj.com': { prefixes: { '/logbook/': 'logbook/', '/evals/': 'evals/', '/people/': 'people/', '/applicants/': 'applicants/', '/360/': '360/', '/apmes/guidebook/': 'apmes/guidebook/', '/__/auth/': '__/auth/', '/__/firebase/': 'apmes-auth/firebase/' } },
  // The beta copy of apmes (PREVIEWS.md, "Beta"): served by the anawj-beta Worker from the beta branch. Same folders,
  // but the apps pick the test Firebase project on beta- hosts (firebase-config.js), so nothing here touches live data.
  // Its sign-in helper pages use their own init.json (apmes-auth-beta/: the test project apmes-logbook-beta).
  'beta-apmes.anawj.com': { prefixes: { '/logbook/': 'logbook/', '/evals/': 'evals/', '/people/': 'people/', '/applicants/': 'applicants/', '/360/': '360/', '/apmes/guidebook/': 'apmes/guidebook/', '/__/auth/': '__/auth/', '/__/firebase/': 'apmes-auth-beta/firebase/' } },
};

// The one folder every host serves as it is: the shared design files (styles only, no data), so a subdomain's apps can
// link ../nuhsdesign/tokens.css. (The old path /design/ was served too until 13 Oct 2026, when nothing linked it any more.)
// /feedback/ is the feedback button's script (feedback/overlay.js; no data), which sites.js adds to pages when it's on.
// These are the only folders shared between subdomains.
export const SHARED = ['/nuhsdesign/', '/feedback/'];

// The feedback button (edit/NOTES.md): on PR previews (any *.workers.dev host) it is on for every page; on the real
// addresses only in a browser that turned it on with ?feedback=1 (a cookie; ?feedback=0 turns it off).
export const FEEDBACK_COOKIE = 'anawj-feedback';
export function feedback(host, search, cookie) {
  host = String(host || '').toLowerCase().replace(/:\d+$/, '');
  const q = new URLSearchParams(search || '').get('feedback');
  const set = q === '1' ? true : q === '0' ? false : null;   // what the address asks for, if anything
  const on = /\.workers\.dev$/.test(host) || (set ?? new RegExp(`(?:^|;\\s*)${FEEDBACK_COOKIE}=1(?:;|$)`).test(cookie || ''));
  return { on, set: /\.workers\.dev$/.test(host) ? null : set };
}

// On any host not in SITES, /_sites/<host>/<path> serves <path> as that host would, so the mapping can be tried on a
// PR preview before the real addresses exist: <preview>/_sites/hand.anawj.com/babies/
const TRY = '/_sites/';

// -> { file } (a path inside the repo, or a folder ending in "/"), { redirect } (a public path, or a full address
//    on another site, to send the browser to), or { notFound: true }
export function resolve(host, pathname) {
  const out = route(host, pathname);
  // an encoded slash, dot or backslash, or a leftover ".." could point the asset lookup out of the folder: refuse
  return out.file != null && /%2e|%2f|%5c|\\|(^|\/)\.\.?(\/|$)/i.test(out.file) ? { notFound: true } : out;
}

function route(host, pathname) {
  host = String(host || '').toLowerCase().replace(/:\d+$/, '');
  let site = SITES[host], p = pathname;
  if (!site && p.startsWith(TRY)) {
    const rest = p.slice(TRY.length), slash = rest.indexOf('/');
    const h = (slash < 0 ? rest : rest.slice(0, slash)).toLowerCase();
    if (SITES[h]) {
      if (slash < 0) return { redirect: `${TRY}${h}/` };
      site = SITES[h]; p = rest.slice(slash);
      const base = `${TRY}${h}`;
      const out = route(h, p);
      return out.redirect ? { redirect: /^https?:/.test(out.redirect) ? out.redirect : base + out.redirect } : out;
    }
  }
  if (!site) return { file: p.replace(/^\//, '') };   // every other host: the repo as it is
  for (const dir of SHARED) {
    if (p === dir.slice(0, -1)) return { redirect: dir };
    if (p.startsWith(dir)) return { file: p.slice(1) };
  }
  if (site.moved) {
    for (const [prefix, to] of Object.entries(site.moved)) {
      if (p === prefix.slice(0, -1) || p.startsWith(prefix)) return { redirect: to + p.slice(prefix.length) };
    }
    return { notFound: true };
  }
  if (site.root) {
    const own = '/' + site.root;
    if (p === own.slice(0, -1)) return { redirect: own };
    if (p.startsWith(own)) return { file: site.root + p.slice(own.length) };
    return { file: site.root + p.replace(/^\//, '') };
  }
  for (const [prefix, folder] of Object.entries(site.prefixes)) {
    if (p === prefix.slice(0, -1)) return { redirect: prefix };
    if (p.startsWith(prefix)) return { file: folder + p.slice(prefix.length) };
  }
  return { notFound: true };
}
