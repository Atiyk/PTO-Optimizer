# Brand audit: legacy names in consumer surfaces

Checked 2026-11-22 on branch `growth/launch-readiness-20261121` and the live site. Search terms: `gapless`, `Gapless`, `gaplessreminders`, `pto-optimizer.app`, `Days Off` / `daysoff`. Scope: repo root consumer app. `apps/teams` (B2B) is excluded; it has 13 files mentioning Gapless, which is its own decision. The untracked local folders `PTO-Optimizer/` and `PTO-Optimizer-fixes/` are copies outside git and outside the build; ignore them (or delete locally to avoid confusing future greps).

Already correct: `src/brand.ts` (`PRODUCT_NAME = 'Timebower'`), page titles, `manifest.webmanifest` (name and short_name Timebower), `llms.txt`, ICS `PRODID:-//Timebower//EN` and `X-WR-CALNAME:Timebower - …` (built from `PRODUCT_NAME` in `src/ui/icsExport.ts`), OG images (drawn from `PRODUCT_NAME` in `scripts/build-og-images.ts`; live `og-images/landing.png` reads "Timebower"), the lockup SVG text, the footer wordmark, email subjects and sender name (`server/account/handlers.ts`, `reminders.ts`, `config.ts` default `MAIL_FROM_NAME` = Timebower). No hits in the country pages (`australia/`, `canada/`, `germany/`, `india/`, `ireland/`, `uk/`) or in `public/404.html`.

## Must change before launch

These show the old name or old inbox to users. All three are the same problem: the contact address.

| File | What users see | Change to |
| --- | --- | --- |
| `src/ui/contact.ts` lines 7, 9, 25 | Footer "Contact us" and "Report a bug" open an email to `gaplessreminders@gmail.com` with subjects "Gapless Contact" and "Gapless Bug Report". Confirmed on the live footer | The new Timebower address; subjects "Timebower contact" and "Timebower bug report" |
| `public/privacy.html` lines 127 to 128 | Same mailto links, plus the address printed as text | Same as above. Note `src/brand.test.ts` line 53 currently asserts the old `mailto:gaplessreminders@gmail.com?subject=Gapless%20Contact`, so the test must change with the file (and should then assert that no `gapless` string appears) |
| `public/terms.html` lines 115 to 116 | Same | Same |

Also check, owner side: the sign-in and reminder emails are sent from the `GMAIL_USER` account (`server/account/mailer.ts`). If that is `gaplessreminders@gmail.com`, recipients see the old address in the From line even though the display name says Timebower. [OWNER: confirm the GMAIL_USER value in Vercel and move it to the new address.]

## Keep for compatibility

Changing these would break saved data, old links, calendar subscriptions or sign-ins. None is visible in normal use.

| Item | Where | Why keep |
| --- | --- | --- |
| `gapless.*` localStorage keys and `gapless:*` change events | `src/personal/*`, `src/ui/pinnedPlanStore.ts`, `planHandoff.ts`, `ExpirationGuard.tsx`, `src/integration/browserWalletStore.ts`, `gaplessPrivatePlanV1` in `urlState.ts` | Renaming loses every returning user's saved plans, requests and employer holidays. Backups also select keys by these prefixes (`savedDataBackup.ts`) |
| ICS UIDs `…@pto-optimizer.app` | `src/ui/icsExport.ts`, `src/autopilot/feed.ts`, `feedV2.ts`, `watchFeed.ts` | Calendar apps match updates by UID; a change duplicates every event people already imported or subscribed to. UIDs are never shown |
| `X-GAPLESS-BOOK-BY` ICS property | `src/ui/icsExport.ts`, read by `server/account/reminders.ts` | Machine-read field; old files in people's calendars still carry it |
| `gapless_session`, `gapless_signed_in` cookies | `server/account/handlers.ts`, `src/ui/EmailReminders.tsx` | Renaming signs everyone out; only visible in dev tools |
| `gapless_*` database tables | `server/account/db.ts` | Internal; a rename needs a migration for no user benefit |
| `@daysoff/engine` package name | `packages/engine/package.json` and all imports | Internal import path; never shown |
| `https://pto-optimizer.app` placeholder origin | `public/privacy.html`, `terms.html`, `docs/index.html` canonicals and examples, `public/data-sources.json` `$schema` | `scripts/build-seo-files.ts` rewrites it to `SITE_URL` at build; the live privacy page canonical is correct (`https://pto-optimizer-seven.vercel.app/privacy`). Note: `scripts/siteUrl.ts` says `pto-optimizer.app` doesn't resolve |
| `public/brand/gapless-*.svg` file names | `public/brand/` | Content already says Timebower; not linked from any page. Rename only if these files go into a press kit, since press would see the file name |

## Internal only (fix when convenient)

| Item | Where |
| --- | --- |
| "Gapless PTO Optimizer" as the product name | `PRODUCT.md` (Brand Commitments section still says Gapless), `CLAUDE.md`, `README.md` ("PTO Optimizer"), `NOTES.md`, `PROGRESS.md`, `FABLE-HANDOFF.md` |
| "Gapless visual system" comment | `src/index.css` line 12 |
| `docs/BRAND-IDENTITY.md` title and history | Says "Gapless brand identity"; the Timebower section is at the top. Retitle so new contributors don't copy the old name |
| `VITE_GAPLESS_ACCOUNTS` env var | `vite.config.ts`, `src/ui/EmailReminders.tsx` |
| Test fixtures (`gapless.example`, `gapless.app@gmail.com`) | `server/account/account.test.ts` and other tests; fake values |
| `docs/personal/DATA.md` and other docs | Historical |
| `package.json` name `scratch-2026-10-18-587993` | Not a brand problem, but odd if the repo is ever public |

## Copy issues found on the way (not branding)

- `src/ui/requestText.ts` line 49: request text says "N days away from work in total". `docs/VOCABULARY.md` bans "days away"; "N days off in total" matches the site. This text goes to managers, so it's worth fixing before launch.

## Owner actions

1. [OWNER: set up a support/contact email under the Timebower name] and give it to the product team for `src/ui/contact.ts`, `public/privacy.html`, `public/terms.html`.
2. [OWNER: confirm and change the `GMAIL_USER` sender account in Vercel] so sign-in and reminder emails don't come from the Gapless address.
3. [OWNER: set up social handles; check "timebower" availability] before any posting.
4. [OWNER: decide on a custom domain] before press. If one is chosen, set `SITE_URL` and keep ICS UIDs on `pto-optimizer.app` anyway.
5. [OWNER: set up a press contact] (can be the same inbox).
6. Decide whether `apps/teams` keeps the Gapless name; if so, make sure nothing in consumer launch material links to it.
