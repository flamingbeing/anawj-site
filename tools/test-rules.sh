#!/bin/bash
# Firestore rules tests for logbook/firestore.rules (logbook and evals suites), prewarm/firestore.rules, nuh-roster/firestore.rules and mo-portal/firestore.rules in the local emulator, with fake
# accounts and the demo project "demo-logbook": nothing reaches the live Firebase projects and no sign-in is needed.
# Needs Java and, once per machine, the test tools (the cloud environment's setup script installs them there):
#   npm install --prefix ~/.cache/anawj-rules firebase-tools@13 @firebase/rules-unit-testing firebase
set -u
cd "$(dirname "$0")/.."
TOOLS="${RULES_TOOLS:-$HOME/.cache/anawj-rules}"
if [ ! -x "$TOOLS/node_modules/.bin/firebase" ]; then
  echo "Installing the emulator test tools into $TOOLS (once)…"
  npm install --silent --prefix "$TOOLS" firebase-tools@13 @firebase/rules-unit-testing firebase || exit 1
fi
# the test files import the packages by name: link them in for the run only
made_link=0
if [ ! -e node_modules ]; then ln -s "$TOOLS/node_modules" node_modules; made_link=1; fi
cfg="$(mktemp -d)/firebase.json"
echo '{ "firestore": { "rules": "logbook/firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > "$cfg"
"$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg" --only firestore --project demo-logbook \
  "node evals/test/rules.emulator.mjs && cd logbook && node test/rules.emulator.mjs" 2>&1 | grep -E 'checks passed|^FAIL|^Error:' ; rc=${PIPESTATUS[0]}
# prewarming study rules: own rules file and demo project
cfg2="$(mktemp -d)/firebase.json"
echo '{ "firestore": { "rules": "prewarm/firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > "$cfg2"
"$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg2" --only firestore --project demo-prewarm \
  "cd prewarm && node test/rules.emulator.mjs" 2>&1 | grep -E 'checks passed|^FAIL|^Error:' ; rc2=${PIPESTATUS[0]}
# NUH roster rules: own rules file and demo project
cfg3="$(mktemp -d)/firebase.json"
echo '{ "firestore": { "rules": "nuh-roster/firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > "$cfg3"
"$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg3" --only firestore --project demo-roster \
  "cd nuh-roster && node test/rules.emulator.mjs" 2>&1 | grep -E 'checks passed|checks failed|^FAIL|^Error:' ; rc3=${PIPESTATUS[0]}
# MO portal rules: own rules file and demo project
cfg4="$(mktemp -d)/firebase.json"
echo '{ "firestore": { "rules": "mo-portal/firestore.rules" }, "emulators": { "firestore": { "port": 8085, "host": "127.0.0.1" }, "ui": { "enabled": false } } }' > "$cfg4"
"$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg4" --only firestore --project demo-moportal \
  "cd mo-portal && node test/rules.emulator.mjs" 2>&1 | grep -E 'checks passed|checks failed|^FAIL|^Error:' ; rc4=${PIPESTATUS[0]}
[ $rc = 0 ] && rc=$rc2
[ $rc = 0 ] && rc=$rc3
[ $rc = 0 ] && rc=$rc4
[ $made_link = 1 ] && rm -f node_modules
rm -f firebase-debug.log firestore-debug.log logbook/firestore-debug.log prewarm/firestore-debug.log nuh-roster/firestore-debug.log mo-portal/firestore-debug.log
exit $rc
