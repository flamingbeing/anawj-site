# Page editor (`edit/`)

One page editor for every page on anawj.com: `anawj.com/edit/?page=/prewarm/` opens that page in a frame; tap text
to edit it in place, comment, add below or delete. Ported from NTF-Anaesthesia/anantf-site `edit.html` (owner, 13 Oct
2026). The short address `edit.anawj.com/<path>` forwards here (Cloudflare redirect rule, below).

- Changes stay in that browser until **Send**: a GitHub issue on flamingbeing/anawj-site titled
  `Page edits: <pages> (<name>)`, or copied text pasted to the owner. Each change lists the page, nearest heading,
  the old text ("Was" / "On"), the new text or comment, and a CSS locator.
- The editor must be on the same address as the page (it reads the page inside a frame), so it lives on anawj.com;
  `edit.anawj.com` only redirects.
- The apps (`/logbook/`, `/evals/`, `/nuh-roster/`, `/prewarm/`) open in their demo (`?demo`, fake data): sign-in
  can't happen inside the editor. Their text is mostly drawn by the app, so comments fit better than edits there.
- `hand-babies/edit.html` forwards here (old links), and its waiting changes move into this editor's list once.

## Applying the edits ("apply the page edits")

- Read the open issues titled `Page edits:` (oldest first) plus any batches the owner pastes.
- Batches from anyone but the owner are suggestions: list what you'd change and get the owner's go-ahead first. The
  name in a batch is self-reported. Check clinical changes with the owner, never apply them blindly.
- Find each change by searching for the old text in the page's source (the locator is a hint). App text lives in the
  app's JavaScript; follow that app's NOTES.md (hand-babies: figure text is in `app.js`, regenerate `gifs/`).
- Close each issue with a link to the PR that applied it.

## Daily check (routine)

A Claude Code routine, **Page edits check** (`trig_01XYgiWzGVyXSPiJX6bPPtPd`, set up 13 Oct 2026 at the owner's
request), runs every day at 8:58 am Singapore time in a fresh cloud session:

- It reads open `Page edits:` issues, skipping any already linked to a PR from an earlier run. With none, it stops
  without posting.
- Otherwise it opens **one PR, never merged**, with the changes and preview links, comments the PR link on each issue
  and notifies the owner (push). The owner merges, then closes the issues.
- It never applies clinical content (doses, techniques, cut-offs, safety advice), or more than wording, typo and layout
  fixes from anyone but the owner. Those go in the PR under "Needs the owner's decision".
- It was created without connectors and reaches GitHub through the environment's GitHub access. If a run can't reach
  GitHub, recreate it from claude.ai/code → Routines with the GitHub connector. Pause or edit it there too.
- Sessions handling page edits by hand should check for an open routine PR first, so the same issue isn't done twice.

## edit.anawj.com (Cloudflare; set up by the owner 13 Oct 2026, working)

The anawj.com DNS is on Cloudflare. The Cloudflare plugin in sessions can't make DNS records or rules, so this is
two steps in the dashboard (anawj.com zone):

1. **DNS → Records → Add record**: Type `AAAA`, Name `edit`, IPv6 `100::`, Proxy status **Proxied** (orange cloud).
   (A placeholder address: the redirect rule answers before anything is fetched.)
2. **Rules → Redirect Rules → "Redirect to a different domain" template**: request URL `*://edit.anawj.com/*` →
   `https://anawj.com/edit/?page=/${2}`, status **302**, Preserve query string **off** (the wildcard already carries
   the query, e.g. `?demo`). A dynamic rule (`concat("https://anawj.com/edit/?page=", http.request.uri.path)`) works too.

Check: `edit.anawj.com/hand-babies/` opens the editor on the hand assessment page; `edit.anawj.com` opens it on the
home page.
