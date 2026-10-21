#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

claude plugin validate .

listed="$(node -e 'const m = require("./.claude-plugin/marketplace.json"); console.log(m.plugins.map(p => p.source.replace("./mods/", "")).sort().join("\n"))')"
present="$(ls mods | sort)"
if [ "$listed" != "$present" ]; then
  echo "marketplace.json and mods/ disagree" >&2
  diff <(echo "$listed") <(echo "$present") >&2 || true
  exit 1
fi

for mod in $present; do
  echo "== $mod"
  claude plugin validate "mods/$mod"
  claude plugin test "mods/$mod"
done