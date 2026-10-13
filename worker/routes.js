// Which folder of this repo each public address serves (SUBDOMAINS.md). Pure functions, no Cloudflare APIs, so
// worker/test/routes.test.mjs can check them in Node. worker/sites.js is the Worker that uses them.
//
// A host in SITES is served only from the folders listed for it: prewarmstudy.anawj.com can never reach the logbook's
// files, and so on. Any other host (the PR previews on workers.dev, the copy of main on anawj-preview) serves the
// whole repo as it is, as before.

// host -> { prefixes: { '/cmcj/': 'cmcj/' } }  (several apps share the host, one path each)
//      or { root: 'prewarm/' }                 (one app at the root; its own folder name works too)
export const SITES = {
  'hand.anawj.com': { prefixes: { '/cmcj/': 'cmcj/', '/babies/': 'hand-babies/' } },
  'prewarmstudy.anawj.com': { root: 'prewarm/' },
  'roster.anawj.com': { root: 'nuh-roster/' },
  'apmes.anawj.com': { prefixes: { '/logbook/': 'logbook/', '/evals/': 'evals/' } },
};

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
