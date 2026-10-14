#!/bin/bash
# Firestore read counts for the logbook's sync engine (logbook/js/sync.js), in the local Firestore and Auth emulators
# with the real logbook/firestore.rules, fake accounts and the demo project "demo-logbook": nothing reaches the live
# Firebase projects and no sign-in is needed. Runs logbook/test/e2e/reads.emulator.mjs (Playwright).
#   PORT=8080 tools/test-reads.sh        static server port (started if nothing answers)
#   READS_FS_PORT / READS_AUTH_PORT      emulator ports (default 8086 / 9098, apart from test-rules.sh's 8085)
# Needs Java and the test tools test-rules.sh installs (~/.cache/anawj-rules).
set -u
cd "$(dirname "$0")/.."
TOOLS="${RULES_TOOLS:-$HOME/.cache/anawj-rules}"
if [ ! -x "$TOOLS/node_modules/.bin/firebase" ]; then
  echo "Installing the emulator test tools into $TOOLS (once)…"
  npm install --silent --prefix "$TOOLS" firebase-tools@13 @firebase/rules-unit-testing firebase || exit 1
fi
PORT="${PORT:-8080}"; FS="${READS_FS_PORT:-8086}"; AUTH="${READS_AUTH_PORT:-9098}"
if ! curl -s -o /dev/null "http://localhost:$PORT/logbook/"; then
  python3 -m http.server "$PORT" >/dev/null 2>&1 & SERVER=$!; trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
fi
dir="$(mktemp -d)"; cfg="$dir/firebase.json"
cp logbook/firestore.rules "$dir/firestore.rules"
# own hub, logging and websocket ports too, so this can run beside test-rules.sh
cat > "$cfg" <<EOF
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": $FS, "host": "127.0.0.1", "websocketPort": $((FS + 1000)) }, "auth": { "port": $AUTH, "host": "127.0.0.1" },
    "hub": { "port": $((FS - 3600)) }, "logging": { "port": $((FS - 3500)) }, "ui": { "enabled": false } } }
EOF
root="$PWD"
( cd "$dir" && "$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg" --only firestore,auth --project demo-logbook \
  "PORT=$PORT READS_FS_PORT=$FS READS_AUTH_PORT=$AUTH SDK_DIR=$TOOLS/node_modules/firebase node $root/logbook/test/e2e/reads.emulator.mjs" ) 2>&1 \
  | grep -E '^(open|PASS|FAIL|Error|  )|reads' ; rc=${PIPESTATUS[0]}
rm -rf "$dir"
exit $rc
