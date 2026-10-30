#!/usr/bin/env bash
# Proves the Days Off build is unchanged: hashes every file in dist/ and compares with a
# baseline built from main (scripts/days-off-dist.sha256). Run after `npm run build`.
# The prerender stamps build time into each page (window.__PTO_PRERENDERED_AT__), so that
# one value is normalised before hashing; everything else, including hashed asset names,
# must match byte for byte. A deliberate Days Off change must update the baseline:
#   npm run build && bash scripts/verify-days-off-dist.sh --write
set -euo pipefail
cd "$(dirname "$0")/.."
hash_dist() {
  (cd dist && find . -type f | sort | while read -r f; do
    printf '%s  %s\n' "$(sed -E 's/__PTO_PRERENDERED_AT__ = "[^"]*"/__PTO_PRERENDERED_AT__ = "X"/g' "$f" | sha256sum | cut -d' ' -f1)" "$f"
  done)
}
if [[ "${1:-}" == "--write" ]]; then hash_dist > scripts/days-off-dist.sha256; echo "baseline written"; exit 0; fi
if diff <(hash_dist) scripts/days-off-dist.sha256 > /tmp/days-off-dist.diff; then
  echo "Days Off dist/ is identical to the baseline ($(wc -l < scripts/days-off-dist.sha256) files; build timestamp normalised)."
else
  echo "Days Off dist/ differs from the baseline: $(grep -c '^<' /tmp/days-off-dist.diff) files (full diff: /tmp/days-off-dist.diff)." >&2
  head -20 /tmp/days-off-dist.diff >&2
  exit 1
fi
