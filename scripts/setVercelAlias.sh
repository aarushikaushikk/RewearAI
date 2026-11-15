#!/usr/bin/env bash
# Points a fixed domain at a deployment through the Vercel REST API. `vercel alias set` looks up a
# personal user first, which a CI token can't do. Needs VERCEL_TOKEN and VERCEL_ORG_ID.
# Usage: scripts/setVercelAlias.sh <deployment-url> <domain>
set -euo pipefail

deployment="${1:?Usage: setVercelAlias.sh <deployment-url> <domain>}"
domain="${2:?Usage: setVercelAlias.sh <deployment-url> <domain>}"
deployment="${deployment#https://}"
api=https://api.vercel.com

call() {
  curl --silent --show-error --fail-with-body --max-time 30 \
    -H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json' "$@"
}

id=$(call "$api/v13/deployments/$deployment?teamId=$VERCEL_ORG_ID" | jq -r '.id')
call -X POST "$api/v2/deployments/$id/aliases?teamId=$VERCEL_ORG_ID" \
  -d "$(jq -n --arg alias "$domain" '{alias: $alias}')" > /dev/null
echo "Aliased https://$domain -> https://$deployment"
