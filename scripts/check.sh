#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

claude plugin validate .

listed="$(node -e 'const m = require("./.claude-plugin/marketplace.json"); console.log(m.plugins.map(p => p.source.replace("./plugins/", "")).sort().join("\n"))')"
present="$(ls plugins | sort)"
if [ "$listed" != "$present" ]; then
  echo "marketplace.json and plugins/ disagree" >&2
  diff <(echo "$listed") <(echo "$present") >&2 || true
  exit 1
fi

for plugin in $present; do
  echo "== $plugin"
  claude plugin validate "plugins/$plugin"
  if find "plugins/$plugin" -name '*.test.ts*' -not -path '*/.claude-plugin/types/*' | grep -q .; then
    claude plugin test "plugins/$plugin"
  fi
done