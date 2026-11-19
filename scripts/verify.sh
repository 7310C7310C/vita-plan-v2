#!/usr/bin/env bash
# Run the checks that CI runs. Pass --ui to also run Playwright UI checks.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 scripts/check_scores.py
python3 scripts/check_agents.py

for f in assets/js/v2-ui.js assets/js/v2-cache.js assets/js/script.js assets/player/*.js sw-v2.js sw.js admin/admin.js; do
  node --check "$f"
done

if [ "${1:-}" = "--ui" ]; then
  python3 tests/serve.py 8080 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  sleep 1
  python3 tests/ui_check.py http://127.0.0.1:8080/
fi

echo "OK: verify passed"
