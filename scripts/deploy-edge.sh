#!/bin/bash
# Deploy the current main commit to the Hong Kong static edge.
# Runs on the Chicago origin after `git pull`; the edge is a separate
# read-only checkout of the same public repo.
set -euo pipefail

EDGE_HOST="${EDGE_HOST:-45.125.16.205}"
EDGE_USER="${EDGE_USER:-root}"
EDGE_KEY="${EDGE_KEY:-/root/.ssh/kcan-edge}"
SHA="$(git -C /var/www/vita-plan-v2 rev-parse HEAD)"

ssh -i "$EDGE_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  "$EDGE_USER@$EDGE_HOST" \
  "set -e; cd /var/www/vita-plan-v2; git fetch --depth 1 origin '$SHA'; git reset --hard '$SHA'; chown -R www-data:www-data /var/www/vita-plan-v2; echo EDGE_DEPLOY_OK $SHA"

# /piano is a standalone static app outside the main repo; keep it in sync too.
rsync -az --delete --chown=www-data:www-data \
  -e "ssh -i $EDGE_KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  /var/www/piano/ "$EDGE_USER@$EDGE_HOST:/var/www/piano/"

# Smoke test through the edge without relying on public DNS.
curl -fsS --max-time 20 --resolve kcan.cc:443:"$EDGE_HOST" https://kcan.cc/ >/dev/null
curl -fsS --max-time 20 --resolve kcan.cc:443:"$EDGE_HOST" \
  https://kcan.cc/soundfonts/MusyngKite/church_organ-mp3.js >/dev/null
echo EDGE_SMOKE_OK
