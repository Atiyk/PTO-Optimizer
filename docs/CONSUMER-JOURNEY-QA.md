# Final consumer journey check

Enable this check only in the final phase, once the tracker, forecast, partner planner,
and portrait sharing are integrated. Earlier phase pull requests do not contain all
required controls and must not run it as though those features already exist.

The script uses fresh 375×812 browser contexts, a fixed January 1, 2027 clock, and
synthetic US 2027 dates. It asserts live calculation, request transitions, precise
confirmed/tentative deductions, persistence after refresh, saved/shared holiday
precedence, partner payload privacy and recipient constraints, exact portrait PNG
dimensions, balance visibility, and the real download fallback after synthetic image
clipboard denial. It saves screenshots, downloaded PNGs, and a compact JSON report.
It does not sign in or communicate with employers or other people.

The local Vite fixture serves clean `/pto` and `/policy` document navigations from their
directory indexes, matching the verified Vercel behavior. Ordinary journeys stub
platform analytics and block external requests. A separate transport case downloads
the actual public Plausible manual SDK and production Vercel insights SDK, records
their hashes, and serves them unmodified in a route-backed synthetic HTTPS origin.
Only that isolated fixture disables the SDK automation skip (mobile user agent,
`webdriver=false`, and the official Plausible automation opt-in). It asserts real
safe pageview POSTs from both providers, query-free body URLs and absent HTTP Referer
headers, then verifies both providers suppress a real incoming unsafe referrer.
Every POST is intercepted and fulfilled locally; no analytics data leaves the fixture.
Unavailable SDKs or transport produce an explicit unavailable result, never a pass.

The workflow step below is enabled in the phase 8 consumer browser job, after its
current fixture build and Chromium installation. The existing artifact step already
includes `qa-evidence`. Do not enable it on earlier phases.

```yaml
- name: Verify the complete consumer journey at 375 pixels
  if: ${{ !cancelled() }}
  run: |
    (cd current && exec node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4177 --strictPort) > "$RUNNER_TEMP/consumer-journey.log" 2>&1 &
    journey_pid=$!
    trap 'kill "$journey_pid" 2>/dev/null || true' EXIT
    node --input-type=module <<'NODE'
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        if ((await fetch('http://127.0.0.1:4177/')).ok) { ready = true; break; }
      } catch { /* The preview may still be starting. */ }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('Consumer journey preview did not start.');
    NODE
    node current/scripts/consumer-journey.mjs http://127.0.0.1:4177 "$GITHUB_WORKSPACE/qa-evidence/journey"
```

Preparing the script is not a passing end-to-end result. Its first actual browser run
and any observed failures must be recorded before claiming the final journey works.
