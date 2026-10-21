# Short theme links and QR code

21 Oct 2026: Share as a link now makes short links (`#t=`, packed: bundled theme + changed settings only) and shows a
QR code in the same dialog (shared generator in `/feedback/qr.js`, cached for offline by `sw.js`).

- Lengths with the address: a bundled theme ~41 characters (was ~1,200), a few changes ~65–100, a fully custom
  theme ~150. Old `#theme=` links still open.
- The link carries a fingerprint of the setting/word/bundled-theme lists; after an update that changes them, older
  links say "ask for a new one" (owner accepted: links are regenerated from Share).
- Colours that repeat (white, black, or a colour already in the link) cost a few bits; no lossy colours.
- Tests: `test/my-themes.test.mjs` (round trip of every bundled theme and a custom one, lengths, fingerprint),
  `test/e2e/share-link.mjs` (short link, QR shown, broken link).
