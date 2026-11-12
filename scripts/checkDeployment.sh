#!/usr/bin/env bash
# Post-deploy check: fails unless the deployed app serves its sign-in page and the session API.
# Usage: scripts/checkDeployment.sh https://your-app.vercel.app
set -euo pipefail

base="${1:?Usage: checkDeployment.sh <base-url>}"
base="${base%/}"

status() {
  curl --silent --output /dev/null --write-out '%{http_code}' --max-time 20 \
    --retry 5 --retry-delay 5 --retry-all-errors "$1"
}

sign_in=$(status "$base/sign-in")
if [ "$sign_in" != "200" ]; then
  echo "::error::$base/sign-in returned $sign_in, expected 200."
  if [ "$sign_in" = "401" ]; then
    echo "::error::Vercel Deployment Protection is on. See docs/CI_CD.md, One-time setup."
  fi
  exit 1
fi

# Signed out, the session API answers 401. A 5xx means the app can't reach its database.
session=$(status "$base/api/auth/session")
if [ "$session" -ge 500 ]; then
  echo "::error::$base/api/auth/session returned $session."
  exit 1
fi

echo "Deployment OK: /sign-in $sign_in, /api/auth/session $session"
