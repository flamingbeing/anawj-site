# NUH Junior Monthly: status

## Now
- First version (15 Oct 2026): sheet import/copy-back, Postings tab, cardiac and ICU rules and auto-fill, predicted
  rules marked To confirm. Built in one session on the NTF roster app. Then the NUHS app kit, and rules and import
  tuned on a backtest of past rosters (NOTES.md, Backtest).

## Waits on the owner
- Say whether the sheet import should move a person to the grade the month's sheet shows (16 Oct, People app session):
  today it keeps them in their first group, so after July RES1s stay RES1 here and APMES People's import from this
  app's staff list suggests last year's years. A suggested task describes the change; check People › Staff until then.
- The rosterer's review of the December 2026 trial copy (in the owner's Drive) and of the predicted rules.
- Custom domain `nuhjuniormonthly.anawj.com` (Cloudflare Workers route click, as for ntfroster).

## Next
- Writing straight into the Google Sheet (Google sign-in with the `drive.file` scope and the file picker) instead of
  copy and paste.
- R1/R2/R3, S1 and OG calls once the rosterer confirms those rules; experience tags read from past months.
- Trim what came from the NTF app and isn't needed here (its Excel layout export, tour wording).

## Recently done
- #699 (people) APMES People imports this app's staff list: it opens this app with `?send=apmes`, which asks and sends
  names, grades and start/leave dates back; or More › Export › Copy the staff list for APMES People (`js/apmes.js`).

## Decisions
- 15 Oct 2026: own app, own subdomain, NUHS design; fill the existing Google Sheet rather than replace it (owner).
- 15 Oct 2026: "weekend" in the fellows' ICU limit means Saturday and Sunday (owner).
- 16 Oct 2026: the staff list goes to APMES People (names, grades, start and leave dates only, no roster or notes), only
  after Send is tapped here, and only to `apmes.anawj.com` (owner asked for the import in People).
