#!/bin/bash
# Set the Cloudflare secret behind a sign-in passcode of the applicants app (worker/guest.js): guest, setup or committee. This is the fallback:
# a passcode set on the app's Set up page (Sign-in passcodes) replaces it, so normally change them there.
# Run on the owner's own computer (it signs in to Cloudflare through wrangler; sessions never run it):
#   tools/set-passcode.sh                 asks which one, then shows a new random passcode to confirm
#   tools/set-passcode.sh committee       skips the question
#   tools/set-passcode.sh setup "my own passcode"
# The passcode goes straight to the Worker's secret (GUEST_PASSCODE, SETUP_PASSCODE or COMMITTEE_PASSCODE); it is never
# written to a file. Passcodes ignore capitals and surrounding spaces. People already signed in stay in until they sign out.
set -eu
cd "$(dirname "$0")/.."
role="${1:-}"
if [ -z "$role" ]; then
  echo "Which passcode?  1) guest (sends feedback)  2) setup (opens Set up)  3) committee (reads Results)"
  read -r -p "1, 2 or 3: " pick
  case "$pick" in 1) role=guest;; 2) role=setup;; 3) role=committee;; *) echo "Not 1, 2 or 3."; exit 1;; esac
fi
case "$role" in
  guest) secret=GUEST_PASSCODE;; setup) secret=SETUP_PASSCODE;; committee) secret=COMMITTEE_PASSCODE;;
  *) echo "Use guest, setup or committee."; exit 1;;
esac
code="${2:-}"
if [ -z "$code" ]; then
  # 12 letters and digits without look-alikes (no 0/o, 1/l/i), in three groups: easy to read out loud
  raw="$(LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyz23456789' < /dev/urandom | head -c 12)"
  code="${raw:0:4}-${raw:4:4}-${raw:8:4}"
fi
code="$(printf %s "$code" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
[ -n "$code" ] && [ "${#code}" -le 100 ] || { echo "The passcode must be 1 to 100 characters."; exit 1; }
echo "New $role passcode: $code"
read -r -p "Set it now? [y/N] " ok
[ "$ok" = y ] || [ "$ok" = Y ] || { echo "Nothing changed."; exit 0; }
printf %s "$code" | npx wrangler secret put "$secret" --name anawj-preview
echo "Done. The $role passcode is now: $code (give it only to the people who should have it)."
