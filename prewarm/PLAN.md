> **Old plan, kept for history (14 Oct 2026).** The app has long moved past it: current status is in `STATUS.md`, rules and decisions in `NOTES.md`, and it is served at `prewarmstudy.anawj.com` (not `anawj.com/prewarm/`).

# Prewarming study app: plan

Status: **approved 12 Oct 2026.** PR 1 (offline app) and PR 2 (sharing) built; PR 3 (admin polish) next.

A phone app for the op-day data of the prewarming study (pre-warming to prevent inadvertent perioperative
hypothermia). It is for the readings that must be taken at the
bedside, above all temperature every 5 minutes. Everything else (history, medication, bloods, post-op days,
discharge) comes from Epic or another app later.

Sources: the study's eCRF template, its intraop protocol and the paper data collection form investigators use now.
None of these files is in this public repo (they carry staff names; details in the owner's private notes). The column headers are transcribed into the app; screens follow the paper
form's order and wording, so the app feels like the form they know.

## Decisions (owner, 12 Oct 2026)

| Topic | Decision |
|---|---|
| Scope | Op day only: pre-warming, intraop, PACU. Other eCRF sections stay blank in the export. |
| Temperature timepoints | As the template. Pre-warming: 0–40 min, every 5. Intraop: baseline, every 5 min to 60, every 15 min to 300, end of surgery. |
| Intraop 0 min | Induction. |
| Intraop baseline | On arrival in OT, once monitors are on. |
| Pre-warming 0 min | Start of active warming. |
| Pre-warming readings | Both warmed groups (10 and 30 min) get every 5 min from 0 to 40. |
| No-pre-warming group | No pre-warming readings; the first is intraop baseline. |
| Live at each timepoint | Core (Spot-On), skin (chest, arm, thigh, calf), gown set temp and thermal sensation (pre-warming), underbody and gown warming on/off and room temp (intraop), BP/HR/MAP and BIS (intraop, every 15 min). **A setting hides any of these** so they can be filled in later from the Fortuna monitor or Epic. |
| Other op-day items | Event times, anaesthesia technique, blood loss and products (cell saver, TXA, fibrinogen, PCC), PACU items (arrival temp, shivering, PONV, hypotension, pain, NuDESC, delay), patient satisfaction. |
| Thermal sensation | 7-point: −3 cold, 0 neutral, +3 hot. (The paper form leaves the scale as a placeholder: confirm with the study team.) |
| Gown set temp | "NA" for the no-pre-warming group **and once active warming has stopped** (paper form rule), filled in automatically. |
| Section sign-off | Replaces the paper "Name / Signature / Date" on each page: a **Mark complete** button per section stamps initials and date. |
| Entry screen | **Option B, "change what moved"**: every site shows the last reading; tap + / − by 0.1 for what changed, then save. |
| Late readings | Filed in the nearest slot; the exact time is kept too. |
| Reminders | Vibrate, short beep, banner, keep screen on. **Each is a setting.** |
| Who enters | Study investigators. |
| Sites | Several hospitals. |
| Patients at once | Usually one a day. |
| Getting in | Study join code; no accounts. |
| Data home | A new Firebase project for this study. |
| Phones | Android and iPhone. |
| Export | Anyone in the study. |

## What investigators see

1. **Join** (once per phone): study code, then your initials (shown as "entered by"). The code also sets your
   hospital.
2. **Today**: the patients for today at your hospital, with what is running now. **+ New patient**: Enrollment ID and
   randomisation group. No names, initials or hospital numbers anywhere in the app.
3. **Patient timeline**: the day as a list of events, each a one-tap **Now** button that can be edited later:
   gown on, warming started, (gown set temp changes), **warming stopped**, arrived in OT, induction, flipped prone, underbody and gown Bair
   Hugger on, surgery completed, PACU arrival, ward transfer. Pre-warming steps are hidden for the no-pre-warming
   group.
4. **Reading screen** (option B), the heart of the app:
   - Header: timepoint, its due time and a countdown ("15 min · due 08:47 · in 1:20").
   - A card per site with the value pre-filled from the last reading, + / − 0.1 buttons (hold to repeat), and a tap
     on the number to type it (for big jumps, e.g. after flipping prone).
   - Pre-warming: gown set temp as a row of chips (38–43, NA) and thermal sensation as −3 … +3, both carried over.
   - Intraop: underbody and gown warming as on/off toggles and room temp, all carried over.
   - On every 15-min intraop timepoint, a second card row for systolic, diastolic, mean BP (offered from systolic and
     diastolic when blank), heart rate and BIS. (The paper form has only a baseline row here plus a "Vital signs data
     collected" tick, so these may come from the monitor download instead: see "Still to confirm".)
   - **Save** stamps the exact time, moves to the next timepoint and restarts the countdown.
   - A strip of all timepoints shows done, missed and coming; tap one to fill it in late or correct it.
   - **Form view**: the same readings laid out like the paper form (pre-warming as a 0–40 min grid with a clock-time
     row; intraop as rows by time from induction, sites across). For checking and correcting at a glance; tap a cell
     to change it. Entry itself stays option B.
5. **Due alerts while the app is open**: banner, vibration (Android only), beep, screen kept awake. Each can be
   turned off in Settings. (Alerts with the phone locked need push notifications: possible later, see "Not in
   version 1".)
6. **Other op-day forms**, in the paper form's order and wording. Big tap buttons for coded answers; "If yes"
   questions appear only when needed.
   - Intraop: technique (GA inhalational / GA TIVA), blood loss, transfusion as **units and volume (mL)** for RBC,
     platelets, FFP and cryo (as on paper), cell saver, PCC, TXA (total worked out from bolus + infusion), fibrinogen.
   - **Intraop investigations** as repeatable rows like the paper table: time, Hb (with "only Hct? enter Hct, Hb =
     Hct/3"), ROTEM or TEG, CT/R, CFT/K, alpha, A10, MCF/MA, ML/LY30.
   - PACU: arrival time and temperature, shivering, nausea and vomiting, hypotension (with the paper's definition),
     **need for transfusion in PACU** (on paper, not in the template), highest pain score (0–10 NRS), NuDESC (the
     five items 0–2 each, total worked out; over 2 = positive), transfer time, delay and reason.
   - Patient satisfaction (pre- and post-op comfort; on paper it sits with the day-1 review, so it can be filled
     then).
7. **Settings**: hide data groups (skin temps, BP/HR, BIS, room temp…), reminders on/off, your initials.
8. **Export**: an Excel file in the template's exact layout (all 572 columns, same headers and section row; op-day
   columns filled, the rest blank) so rows paste into the master sheet. A second sheet lists every reading with its
   exact time and who entered it. Items the template has no column for (transfusion volumes, intraop investigation
   rows, PACU transfusion, section sign-offs) go on a third sheet, and the template's single "Intraoperative
   Investigations" cell gets a short text summary.

## How it works

- Same pattern as the other apps here: a static app at `anawj.com/prewarm/`, works offline (service worker), PR
  previews in demo mode with fake patients.
- **Shared data in Firestore** (new Firebase project). Each patient is one document; each reading is saved as its own
  fields, so two people editing different readings never overwrite each other, and the last edit wins on the same
  field. Firestore's offline cache means saving works with no signal and syncs later.
- **Join code without accounts**: each phone signs in anonymously; joining writes a membership that the security rules
  accept only with the current code for that hospital (the code itself is unreadable to the app). Members read and
  write only their study's patients. An admin (the owner, by Google sign-in) can change a code and remove members.
  Changing a code doesn't sign out people already in.
- Stored: study IDs, group, times and numbers, plus initials of who entered each reading. No names or hospital
  numbers.
- Rules deploy through the existing "Deploy Firestore rules" workflow (new matrix entry) and are tested in the local
  emulator first.

## Build order (one PR each, merged before the next)

1. **Offline app on one phone**: timeline, reading screen (option B), timers and alerts, other op-day forms, settings,
   Excel export, demo mode, unit and browser tests.
2. **Sharing**: Firebase config, join code, sync, security rules with emulator tests, deploy workflow entry.
3. **Admin and polish**: hospitals and codes, members list, export across hospitals, accessibility check.

## What the owner needs to do (before PR 2)

1. Create a Firebase project (e.g. `prewarm-study`), Firestore in `asia-southeast1`.
2. Turn on Authentication → Anonymous and Google sign-in; add `anawj.com` as an authorised domain.
3. Add a web app and commit its config to `prewarm/js/firebase-config.js` (public client ID; Claude prepares the
   file shape).
4. Give the rules-deployer service account the Firebase Rules Admin role on the new project.

## Answers (owner, 12 Oct 2026)

Group shown only on the pre-warming screen; Subject ID (exported in the Enrollment ID column); owner and study
investigators are admins; hospitals NTF, NUH, SGH, CGH, TTSH, KTPH, WH; keep data until the study ends; BP/HR/BIS: baseline live,
15-min rows off by default (a setting turns them on); transfusion: units in the template column, volumes on the
Extra sheet; thermal sensation −3 … +3.

## Not in version 1

- Pre-op, medication, investigations, post-op days 1–2, discharge, screening log (Epic or another app later; the
  export keeps their columns blank).
- Alerts with the phone locked (needs push notifications through a server function and, on iPhone, the app added to
  the home screen).
- Reading values from the GE Fortuna monitor automatically (not networked).
