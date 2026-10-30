#!/usr/bin/env bash
# Proves the Days Off build is unchanged: hashes every file in dist/ and compares with the
# baseline captured from main @ 9f61d18 (scripts/days-off-dist.sha256). Run after
# `npm run build`. A deliberate Days Off change must update the baseline in the same PR.
set -euo pipefail
cd "$(dirname "$0")/.."
actual=$(cd dist && find . -type f | sort | xargs sha256sum)
if diff <(echo "$actual") scripts/days-off-dist.sha256; then
  echo "Days Off dist/ is byte-identical to the baseline ($(echo "$actual" | wc -l) files)."
else
  echo "Days Off dist/ differs from the baseline (see diff above)." >&2
  exit 1
fi
