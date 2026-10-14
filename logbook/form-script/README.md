# The Google Form inbox script (setup)

The old APMES Google Form stays open as a simple way to log. This script, pasted into the Form's Apps Script editor,
sends each new or edited response to the logbook's inbox. The resident's logbook turns it into a case the next time
they open the app (`../js/form-inbox.js`; how it works: `../README.md`, "The Google Form, still open"). One way only:
nothing comes back to the Form or its sheet. About 15 minutes on a computer, once.

## 1. Firebase console (project `apmes-logbook`)

1. **Authentication → Sign-in method → Add new provider → Email/Password**: turn on "Email/Password" (leave
   "Email link" off). Save.
2. **Authentication → Users → Add user**: an email that names the job, e.g. `formbot@anawj.com` (it never receives
   mail), and a long random password (a password manager's generator). Copy the new user's **User UID**.
3. **Firestore Database → Data → Start collection** `formBots` → Document ID: paste the UID → one field, e.g.
   `note` (string) `Google Form script`. Save. (The rules let only accounts listed here write to the inbox; nobody
   can read or change this list except in the console.)

Leave Authentication → Settings → "Enable create (sign-up)" **on**: it covers every sign-in method, so turning it off
would also stop new residents signing in with Google. Other password accounts get nothing anyway (every rule needs a
Google-verified email, or a listing in `formBots`).

## 2. The Form

1. **Settings → Responses → Collect email addresses: Verified** (the inbox is addressed by the respondent's Google
   email; responses without one are skipped).
2. **⋮ → Apps Script**. Replace the empty `Code.gs` with the whole of [`Code.gs`](Code.gs). Save (💾).
3. **Project settings (⚙) → Script properties → Add**: `BOT_EMAIL` = the bot's email, `BOT_PASSWORD` = its password.
   (Only the Form's editors can see these; never paste them into the file.)
4. **Editor → choose `dryRun` → Run**. Google asks you to authorise the script (the Form, and connecting to an
   external service): allow. The execution log shows what the latest response would send: check the date, the case
   text and the category answers (`labels`). Nothing is sent by a dry run.
5. **Triggers (⏰) → Add trigger**: function `onFormSubmit`, deployment Head, event source **From form**, event type
   **On form submit**. Save. From now on every new or edited response goes to the inbox.
6. Optional: **`backfill`** sends responses from a date onwards (edit `SINCE` at its top first). Responses already in
   the logbook from the Admin portal's workbook import are separate cases, so start the backfill after the last
   import to avoid doubles.
7. Add a line to the Form's description, e.g. "Your entries also appear in the APMES logbook app, which is your
   record."

## Good to know

- The trigger runs as the person who created it. If that person loses edit access to the Form, it stops: recreate
  it from another editor's account (ideally the Form's owner).
- Failures show in Apps Script → Executions (and Google emails the trigger's owner a daily summary). A response that
  failed can be sent again by editing it, or with `backfill`.
- The web key in the script is the logbook's public key (`../js/firebase-config.js`); the script sends the site as
  Referer in case the key is limited to the site.
- Tests: `node logbook/test/form-script.test.mjs` (the mapping, against what `form-inbox.js` and the rules expect).
