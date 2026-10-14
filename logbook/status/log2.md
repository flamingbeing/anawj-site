# Now: Claude Code, Logbook 2 (log2)

**Claude Code, Logbook 2 (log2)** (branch `ccr-afac5e7a-99esax`): Google Form inbox is LIVE (14 Oct 2026). Merged:
#494 (app + rules), #499 (script + setup), #500 (prefixed names), #501 (edge cases), #503 (one-click setup). Firetop
bound the script to the real Form ("APMES logbook inbox", Apps Script API), the owner set the properties and ran
setup; Form email collection is Verified; an end-to-end ZZ test worked (inbox → case; sheet Case and Database rows
added as usual; firetop removed the two ZZ rows after a backup copy). Open: the ZZ case was still in the owner's
logbook (his app delete hadn't synced while he couldn't sign in; delete is tested and works) — owner deletes it once
signed in. Proposed, waiting for the owner's answers: new app cases → response sheet (outbox + sheet script; on for
all or opt-in, "from app" mark in column J, a few minutes' delay OK?). Owner to decide: the response sheet is shared
"anyone with the link: viewer".
