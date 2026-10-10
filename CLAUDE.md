# Notes for Claude sessions

## Firestore rules deploy automatically — never ask the user to paste them

- `logbook/firestore.rules` → Firebase project `apmes-logbook` (holds the logbook **and** evals rules; it is the only rules file for that project).
- `nuh-roster/firestore.rules` → Firebase project `nuh-roster`.

`.github/workflows/deploy-firestore-rules.yml` deploys a file to its project when a change to it is merged into `main`. To change rules: edit the file, open a PR, and get it merged. The rules go live on merge; there is no console step. The deploy checks the rules compile first, so a syntax error fails the run and leaves the live rules unchanged. Check the run in the repo's Actions tab ("Deploy Firestore rules").

- It authenticates with the GitHub secret `FIREBASE_SERVICE_ACCOUNT`, the key for service account `firebase-rules-deployer@apmes-logbook.iam.gserviceaccount.com`, which has Firebase Rules Admin on both projects. Sessions can't read the secret and don't need it.
- A manual run (**Run workflow** in Actions, or `actions_run_trigger` with `run_workflow` on `main`) deploys **both** files and overwrites the live rules. Ask the user before triggering one.
- New Firestore-backed app: add a matrix entry plus a paths filter to the workflow, and have the user grant `firebase-rules-deployer@apmes-logbook.iam.gserviceaccount.com` the Firebase Rules Admin role on the new project (Google Cloud → that project → IAM → Grant access). No new key is needed.
