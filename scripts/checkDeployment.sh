#!/usr/bin/env bash
# Post-deploy check: fails unless the deployed app serves its sign-in page and the session API.
# Usage: scripts/checkDeployment.sh https://your-app.vercel.app
set -euo pipefail

base="${1:?Usage: checkDeployment.sh <base-url>}"
base="${base%/}"

status() {
  curl --silent --output /dev/null --write-out '%{http_code} %{redirect_url}' --max-time 20 \
    --retry 5 --retry-delay 5 --retry-all-errors "$1"
}

# A domain just pointed at a new deployment can answer 404 for a few seconds.
for attempt in $(seq 1 12); do
  read -r sign_in redirect <<< "$(status "$base/sign-in")"
  [ "$sign_in" != "404" ] && break
  echo "/sign-in returned 404 (attempt $attempt), waiting for the domain to update..."
  sleep 5
done

if [ "$sign_in" != "200" ]; then
  echo "::error::$base/sign-in returned $sign_in, expected 200."
  case "$redirect" in
    https://vercel.com/sso-api*)
      echo "::error::Vercel Authentication is on. Turn it off in Project > Settings > Deployment Protection."
      ;;
  esac
  exit 1
fi

# Signed out, the session API answers 401. A 5xx means the app can't reach its database.
read -r session _ <<< "$(status "$base/api/auth/session")"
if [ "$session" -ge 500 ]; then
  echo "::error::$base/api/auth/session returned $session."
  exit 1
fi

echo "Deployment OK: /sign-in $sign_in, /api/auth/session $session"
