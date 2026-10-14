#!/bin/bash
# Many devices on one account against the real rules (logbook/test/e2e/multidevice.emulator.mjs): random logs, edits,
# deletes and restores at the same moment on every device, then every device must match the server. Local Firestore and
# Auth emulators with the real logbook/firestore.rules, fake accounts and the demo project "demo-logbook": nothing reaches
# the live Firebase projects and no sign-in is needed.
#   DEVICES=5 ROUNDS=8 SEED=123 BROWSER=chromium|webkit|firefox SLOW=1 tools/test-multidevice.sh
#   TEST=conflicts tools/test-multidevice.sh   same record on two devices, recycle bin, sign-out (test/e2e/conflicts.emulator.mjs)
#   PORT (8080) static server; READS_FS_PORT / READS_AUTH_PORT emulator ports (default 8087 / 9097, apart from test-reads.sh)
# Needs Java and the test tools test-rules.sh installs (~/.cache/anawj-rules).
set -u
cd "$(dirname "$0")/.."
TOOLS="${RULES_TOOLS:-$HOME/.cache/anawj-rules}"
if [ ! -x "$TOOLS/node_modules/.bin/firebase" ]; then
  echo "Installing the emulator test tools into $TOOLS (once)…"
  npm install --silent --prefix "$TOOLS" firebase-tools@13 @firebase/rules-unit-testing firebase || exit 1
fi
PORT="${PORT:-8080}"; FS="${READS_FS_PORT:-8087}"; AUTH="${READS_AUTH_PORT:-9097}"
if ! curl -s -o /dev/null "http://127.0.0.1:$PORT/logbook/"; then
  # python3, or python / py where python3 is only the Windows Store stub
  for py in python3 python py; do "$py" -c 'import http.server' >/dev/null 2>&1 && break; done
  "$py" -m http.server "$PORT" >/dev/null 2>&1 & SERVER=$!; trap 'kill $SERVER 2>/dev/null' EXIT; sleep 1
fi
dir="$(mktemp -d)"; cfg="$dir/firebase.json"
cp logbook/firestore.rules "$dir/firestore.rules"
# own hub, logging and websocket ports too, so this can run beside test-rules.sh
cat > "$cfg" <<EOF
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "port": $FS, "host": "127.0.0.1", "websocketPort": $((FS + 1000)) }, "auth": { "port": $AUTH, "host": "127.0.0.1" },
    "hub": { "port": $((FS - 3600)) }, "logging": { "port": $((FS - 3500)) }, "ui": { "enabled": false } } }
EOF
# Windows (Git Bash): paths as C:/… for node under cmd.exe
win() { cygpath -m "$1" 2>/dev/null || echo "$1"; }
root="$(win "$PWD")"
# the settings go through the environment, not a "VAR=x node …" prefix: on Windows emulators:exec runs its command in cmd.exe
export PORT READS_FS_PORT="$FS" READS_AUTH_PORT="$AUTH" SDK_DIR="$(win "$TOOLS/node_modules/firebase")"
( cd "$dir" && "$TOOLS/node_modules/.bin/firebase" emulators:exec --config "$cfg" --only firestore,auth --project demo-logbook \
  "node \"$root/logbook/test/e2e/${TEST:-multidevice}.emulator.mjs\"" ) 2>&1 \
  | grep -E '^(multidevice|PASS|FAIL|Error|  )' ; rc=${PIPESTATUS[0]}
rm -rf "$dir"
exit $rc
