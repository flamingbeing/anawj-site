# Prewarm: improvement plan (14 Oct 2026)

Made from a 20-angle read-only review (20 sub-agents, one angle each, about 5 minutes each; code read, nothing run).
**Everything here is a finding to check, not a fact:** items marked (unverified) were not reproduced. Nothing was built
from this list yet. Order = what to do first. S / M / L = small / medium / large.

## Built so far (14 Oct 2026)

Owner answers: export late pre-warming cells as NA; keep records indefinitely; phones need not wipe their copy; do the rest as recommended.

- Items 1-4: #512 (red chip for saves that did not reach the team, error words by place, PACU `updateDoc`).
- Items 5, 6: #513 (restore works every time, repeating and catching-up alerts).
- Items 7 (install), 19 (NA, file name, decimal comma): #514.
- Item 12 (✓ on done shortcuts): #515. Taller tap targets (13): tried, dropped (Save falls below the fold).
- Item 9 (pad moves to the next box): #517. Item 10 (late-time `prompt()`): not done, the save flow waits for it.
- Item 8: GitHub now runs the checks on every PR (someone else added it).
- Item 17 first half (POD1/POD2 due on the list), item 15 in part (search above 5 patients, "not sent" badge), item 26 in part (RUNBOOK.md, PLAN.md marked old): this PR.
- Not done yet: 11, 13-16 (rest), 18, 20-25, the Today/Earlier list, the study-deviation fields, rules changes (22).

## A. Protect live data (do first; all small)

1. **A patient with no hospital shows "Synced" but saves nothing to the team** (`sync`, app.js ~139). Count it as unsent
   and say "Set your hospital". S.
2. **A refused save is dropped from the waiting count and only toasts** (app.js ~146-147). Keep a visible "failed" state
   with the reason in plain words and a retry (Refresh now). S/M.
3. **PACU "Not allowed" (13 Oct), likely cause (unverified, ~65%):** the nurse page saves with `setDoc(..., {merge:true})`
   (cloud.js ~244). If the link was stopped or replaced, the save turns into a create, which the rules refuse. Use
   `updateDoc` so a missing link gives "link was stopped". Add a **Check link** button and "Replace link" on the PACU
   link card; nurse page: "Not sent" banner with Retry. S/M.
4. **Error words:** `friendly()` (cloud.js ~35) says "Not allowed. Check the hospital and code." for every refusal.
   Give it a context (joining / saving / PACU link). The join screen also blames "That code isn't right" for rules
   faults. S.
5. **Delete, restore, delete, restore:** the second restore does nothing (store.js ~23 skips an unchanged value).
   Store a time in `restored`. Also make delete/lock times never go backwards (clock-skew). Add a unit test. S.
6. **Alarms only fire if the app is open and in front** (app.js ~1235-1273). Add: catch-up when the app returns to the
   front (show anything overdue), repeat the buzz every 1-2 min until saved, re-take the wake lock if released. S.
   A true lock-screen alarm needs a push server: not realistic.
7. **Install the new version all-or-nothing** (sw.js ~16-19 swallows every failed file, then deletes the old good
   cache). Make shell files required, SDK files optional. The 3 s "clear caches and reload" fallback (app.js ~2273)
   could leave a phone with no shell if the signal drops: fetch `sw.js` first as update.html does. S.
8. **No tests run automatically.** Add a CI workflow (check, unit tests, `test-prewarm.sh`; rules and sync tests as a
   second job) and gate the deploys on it. Add a service-worker/offline test. S/M.

## B. Faster and clearer at the bedside

9. **Chain the number pad through the temperature boxes** (auto-advance after 3 digits; about 21 taps to about 16 per
   reading). S.
10. **Late-reading time uses `prompt()`** (askTime, app.js ~506): use the time pad. S.
11. **Replace routine `confirm()` with Undo toasts** (clear a time, remove a reading, "not due yet"); keep confirm for
    reset subject and log out with unsent data. The conflict prompt ("OK: save yours / Cancel: show theirs") needs two
    named buttons. M.
12. **Done must not rely on colour alone:** green shortcuts also get a ✓ or thicker border; fix `aria-label="complete"`
    replacing the link name (use "POD1, complete"). S. (Follow-up to #390.)
13. **Tap targets under 44 px** on reading tabs (32-34), timepoint strip (36), sheet cells (30); text of 10-12 px on live
    controls. S/M.
14. **Toasts vanish in 2.6 s** (longer for messages over 60 characters). Make the "Add your initials" wording one text. S.
15. **Patient list:** group Today / Earlier, search by Subject ID, filter chips, "not sent" badge on rows, stable order
    (rows move when a team phone syncs). S/M.
16. **Ready-for-a-case card:** online, on a team, hospital set, nothing waiting, last sync recent, version current,
    initials set, nurse link tested. The chip's "Synced" only means nothing is waiting. M.

## C. Chart-review days (POD1/POD2)

17. **Due reminder:** nothing says a patient is due for POD1/POD2. Fill `op_date` automatically from the first reading;
    show "POD1 due today / overdue" on the list. "Still to fill" does not cover Pre-op/POD1/POD2 at all; add it. S/M.
18. Plausible-range checks for bloods (Hb 85 vs 8.5); "none given" for analgesia rows; collapse filled sections. M.

## D. Export

19. **Late pre-warming cells export empty, not NA** (open question below). **Pre-export check** (no Subject ID, no arm, not
    signed off, implausible values) with "export anyway". **Filename uses the UTC date** (a Singapore phone before
    8 am gets yesterday): use local date, add the count. Typed "37,5" exports as text. Hospital filter and a Site
    column for admins. M.

## E. Joining and admin

20. Install-to-home-screen card after joining (iOS keeps separate storage); forgiving join (confirm initials, type a new
    code on the join screen). S.
21. Admin: team activity (readings and last entry per initials), last-seen per phone (needs a small rules change),
    member name in the Remove confirm; initials are not unique. M.
22. Join codes can be 6 characters and anyone can sign in anonymously: longer codes, rotate, consider App Check (needs
    the owner). PACU links never expire (rules would need a 24 h check; **rules change = owner approves**). S/M.

## F. Later

23. Raw JSON backup outside Firestore (+ "last backed up" reminder); member heartbeat (version, last sync, waiting) in
    the admin list. M.
24. Vendor the Carlito font (the Word-form PDF changes offline); check blank-form size (Firestore 1 MiB limit); test
    print on iPhone and Android; offer "share .docx". S/M.
25. Code structure (app.js 2300 lines): pull out time/stamp/esc helpers, then demo and settings, then reading-point
    logic, then screens one at a time (patient screen last, 450-line closure). Add every new file to the sw.js SHELL. L.
26. Docs: one-page **study-day runbook** (`RUNBOOK.md`: before, during, after, when sync fails); README section for new
    members; mark PLAN.md superseded (it still says "PR 3 next" and `anawj.com/prewarm/`); clean STATUS "Waiting"
    list; split NOTES.md (358 lines, one heading). S/M.

## Questions only the owner can answer

- Should late pre-warming cells export **NA** or stay empty? (also the two empty Downloaded columns)
- **Carried-over temperatures:** the draft pre-fills last core/skin temperatures and BP/HR/BIS; Save can store a copied
  number as a new reading (unverified ~70%). Carry only Set temp, Underbody, Gown, Room? Or require a tap to confirm?
- Study protocol: add **deviation** codes and "reading not taken, reason"; log arm changes (who, when, why); record
  baseline ward/holding temperature, probe site, GA/regional? Blinding (PLAN.md Q1) and the thermal scale (−3 to +3) are
  still unconfirmed.
- Data retention / PDPA: how long to keep records; wipe phone copies after leaving a team?
- Build order: suggest A (1-8) first as 3-4 small PRs, then B, then C.
