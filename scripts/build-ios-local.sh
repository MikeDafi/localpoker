#!/usr/bin/env bash
#
# Build a signed production IPA on this Mac, spending no EAS Build minutes.
#
# The reason this script exists rather than a one-line `eas build --local`:
# EAS archives the project through git, and `.env` is gitignored, so the build
# worker never sees the `EXPO_PUBLIC_*` values. They are inlined into the JS
# bundle at build time, so a build without them produces an app that launches
# fine and then reports every online feature as "not configured". That is
# exactly how build 8 shipped with no working online play.
#
# So: copy `.env` into the production profile's `env` block, build, and put
# `eas.json` back. The restore runs on any exit, including a failed build or a
# Ctrl-C, so the working tree is never left carrying local values.
#
# This mirrors what `.github/workflows/ci.yml` does from repository secrets.
#
# Usage: scripts/build-ios-local.sh [output-path]

set -euo pipefail

cd "$(dirname "$0")/.."

OUTPUT="${1:-$PWD/build/localpoker.ipa}"
BACKUP="$(mktemp -t eas-json)"

# See docs/store/EAS-SUBMIT.md: an exported GIT_CONFIG_COUNT with an empty
# value makes git refuse to run, and `pod install` then fails with nothing but
# "Unknown error" from the Install pods phase.
export GIT_CONFIG_COUNT=0
export PATH="/opt/homebrew/bin:$PATH"

if [ ! -f .env ]; then
  echo "error: .env is missing. Copy .env.example and fill it in." >&2
  exit 1
fi

cp eas.json "$BACKUP"
restore() { cp "$BACKUP" eas.json && rm -f "$BACKUP"; }
trap restore EXIT

node -e '
  const fs = require("fs");

  const env = {};
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["\x27]|["\x27]$/g, "");
    if (match[1].startsWith("EXPO_PUBLIC_") && value) env[match[1]] = value;
  }

  // Online play is dead without these three and the app says nothing about it,
  // so refuse to build rather than ship another silently offline binary.
  const required = [
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_DATABASE_URL",
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) {
    console.error("error: .env is missing " + missing.join(", "));
    process.exit(1);
  }

  const easJson = JSON.parse(fs.readFileSync("eas.json", "utf8"));
  easJson.build.production.env = { ...(easJson.build.production.env ?? {}), ...env };
  fs.writeFileSync("eas.json", JSON.stringify(easJson, null, 2) + "\n");
  console.log("Injected " + Object.keys(env).length + " EXPO_PUBLIC_ values into eas.json.");
'

mkdir -p "$(dirname "$OUTPUT")"

npx eas-cli@latest build \
  --platform ios \
  --profile production \
  --local \
  --non-interactive \
  --output "$OUTPUT"

echo
echo "Built $OUTPUT"
echo "Next: scripts/upload-ios-local.sh \"$OUTPUT\""
