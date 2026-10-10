# OT Roster

A static page for drafting the OT section of the daily anaesthesia roster (seniors, juniors, premed cover) and downloading it as an `.xlsx` in the department's layout.

Everything runs in the browser. Staff lists, leave and case notes stay in the browser's local storage and are never uploaded. Rosterers share setup by passing a **team file** (JSON) between them, and share the finished roster as the downloaded Excel file (for example on SharePoint / Excel Online).

## Flow

1. **Seniors / Juniors**: import the master staff sheet (`Name`, `Short name`, `Role`, `Grade`, `Posting`, `Subspecs`, `Doesn't do` columns, found by header name), or *Learn from past rosters* to build the list from old roster files. Tick each senior's subspecs.
2. **Cases** and **Manpower**: load the admin draft roster (rooms, case notes, leave, post call and upper-half duties are read from it), or tick rooms (Cases) and paste names (Manpower) by hand. On Manpower, mark leave times, liver standby, and juniors who were away on the previous working day.
3. **Roster**: generate, edit cells, re-check, then download.

## Rules implemented

- Seniors: required subspecs (paeds, cardiac, neuro, thoracic by default) only go to seniors with that subspec. "Doesn't do" keywords are excluded. Liver standby seniors avoid complex or subspec lists. People who leave early avoid lists that run late.
- Double cover happens only when seniors are short. Both rooms must be in the same complex, and complex lists are excluded. Pairs are chosen to keep the overall assignment best.
- Juniors: posting matches (RA, P, L, SR, Neu) are preferred. Residents go to complex lists and MOPEX to simpler ones. Baby MOs never go to a double-covered room. Extra juniors are doubled up.
- Premed cover: needed when a room's junior was away on the previous working day. It's filled by a second junior in the same room if one was around, otherwise by a resident or MOPEX who was around, with a per-person cap.

## Code

- `js/engine.js`: name matching, case-note flags, assignment (Hungarian algorithm) and checks. No DOM.
- `js/xlsxio.js`: reading rosters and staff sheets, and writing the roster workbook (ExcelJS).
- `js/app.js`: UI.
- `vendor/exceljs.min.js`: ExcelJS 4.4.0 (MIT).
- `test/engine.test.mjs`: run with `node nuh-roster/test/engine.test.mjs`. It uses fake names only.

## Team sign-in (optional)

With a Firebase project configured, rosterers sign in with Google. Then:

- the staff list, rooms and settings are shared (*Save for the team* on the Seniors, Juniors or Settings tab)
- each day's roster has a **Save** button, records who saved it and when, and keeps a permanent history of every save
- anyone on the team can open any saved roster

Only Google accounts on the team list can read or write anything. This is enforced by `firestore.rules` on Google's side, not just by the page. Without a config the page works as before, with everything kept in the browser.

The data (staff names, leave, case notes) is then stored in Google Cloud, outside NUH systems. Check with the department that this is acceptable under PDPA and hospital policy before you use real names.

### Setup (about 10 minutes, once)

1. Go to <https://console.firebase.google.com>, **Add project** (e.g. `nuh-roster`). Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, then Save.
   Under **Authentication → Settings → Authorized domains**, add `anawj.com`.
3. **Build → Firestore Database → Create database**. Pick a Singapore location (`asia-southeast1`) and start in **production mode**.
   Open the **Rules** tab, paste the contents of `nuh-roster/firestore.rules`, and click **Publish**.
4. Add yourself as the first admin. In **Firestore → Data → Start collection**, use collection ID `members`, document ID = your Google email in lowercase (e.g. `you@gmail.com`), and fields `role` (string) = `admin` and `name` (string) = your name.
5. Go to **Project settings (gear) → General → Your apps → Web (`</>`)** and register an app (no hosting needed). Copy `apiKey`, `authDomain`, `projectId` and `appId` into `nuh-roster/js/firebase-config.js`, then commit.
   These values are meant to be public. Access is controlled by the rules and the members list.
6. Open the page, **Sign in with Google**, and add the other rosterers under **Settings → Team members**.
