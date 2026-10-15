# NUH Junior Monthly: status

## Now
- First version (15 Oct 2026): sheet import/copy-back, Postings tab, cardiac and ICU rules and auto-fill, predicted
  rules marked To confirm. Built in one session on the NTF roster app. Then the NUHS app kit, and rules and import
  tuned on a backtest of 22 months of real rosters (NOTES.md, Backtest).

## Waits on the owner
- The rosterer's review of the December 2026 trial copy (owner's Drive, "NUH junior monthly – trials") and of the
  predicted rules.
- Custom domain `nuhjuniormonthly.anawj.com` (Cloudflare Workers route click, as for ntfroster).

## Next
- Writing straight into the Google Sheet (Google sign-in with the `drive.file` scope and the file picker) instead of
  copy and paste.
- R1/R2/R3, S1 and OG calls once the rosterer confirms those rules; experience tags read from past months.
- Trim what came from the NTF app and isn't needed here (its Excel layout export, tour wording).

## Decisions
- 15 Oct 2026: own app, own subdomain, NUHS design; fill the existing Google Sheet rather than replace it (owner).
- 15 Oct 2026: "weekend" in the fellows' ICU limit means Saturday and Sunday (owner).
