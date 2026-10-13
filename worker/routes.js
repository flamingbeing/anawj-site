// Which folder of this repo each public address serves (SUBDOMAINS.md). Pure functions, no Cloudflare APIs, so
// worker/test/routes.test.mjs can check them in Node. worker/sites.js is the Worker that uses them.
//
// A host in SITES is served only from the folders listed for it: prewarmstudy.anawj.com can never reach the logbook's
// files, and so on. Any other host (the PR previews on workers.dev, the copy of main on anawj-preview) serves the
// whole repo as it is, as before.

// host -> { prefixes: { '/cmcj/': 'cmcj/' } }  (several apps share the host, one path each)
//      or { root: 'prewarm/' }                 (one app at the root; its own folder name works too)
export const SITES = {
  'hand.anawj.com': { prefixes: { '/cmcj/': 'cmcj/', '/babies/': 'hand-babies/', '/handlog/': 'hand-log/' } },
  'prewarmstudy.anawj.com': { root: 'prewarm/' },
  'nuhroster.anawj.com': { root: 'nuh-roster/' },
  // /apmes/guidebook/ is the programme guidebook text the evals app reads (just that folder of apmes/).
  // /__/auth/ and /__/firebase/ are Firebase's sign-in helper pages (the auth domain of logbook and evals). The helper
  // scripts are the same files anawj.com serves; init.json is this host's own copy (authDomain apmes.anawj.com).
  'apmes.anawj.com': { prefixes: { '/logbook/': 'logbook/', '/evals/': 'evals/', '/apmes/guidebook/': 'apmes/guidebook/', '/__/auth/': '__/auth/', '/__/firebase/': 'apmes-auth/firebase/' } },
};

// The one folder every host serves as it is: the shared design files (styles only, no data), so a subdomain's apps can
// link ../nuhsdesign/tokens.css. (The old path /design/ was served too until 13 Oct 2026, when nothing linked it any more.)
// This is the only folder shared between subdomains.
export const SHARED = ['/nuhsdesign/'];

// On any host not in SITES, /_sites/<host>/<path> serves <path> as that host would, so the mapping can be tried on a
// PR preview before the real addresses exist: <preview>/_sites/hand.anawj.com/babies/
const TRY = '/_sites/';

// -> { file } (a path inside the repo, or a folder ending in "/"), { redirect } (a public path to send the browser
//    to), or { notFound: true }
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
      return out.redirect ? { redirect: base + out.redirect } : out;
    }
  }
  if (!site) return { file: p.replace(/^\//, '') };   // every other host: the repo as it is
  for (const dir of SHARED) {
    if (p === dir.slice(0, -1)) return { redirect: dir };
    if (p.startsWith(dir)) return { file: p.slice(1) };
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
