# Microsoft Teams app package

`manifest.json`, `color.png` (192x192) and `outline.png` (32x32, transparent) make the Teams app package.

1. Replace `MSTEAMS_APP_ID` (twice) with the bot's Microsoft App ID and `APP_DOMAIN` (twice) with the deployed host, e.g. `daysoff.example.com`. Replace `PRIVACY_URL` and `TERMS_URL` with your privacy and terms pages; the app has none yet, and the Teams Store requires real ones (an admin upload only needs valid https URLs).
2. Zip the three files at the top level of the zip (no folder): `cd apps/teams/msteams && zip ../daysoff-teams.zip manifest.json color.png outline.png`.
3. Upload it in the Teams admin center (Teams apps, Manage apps, Upload new app) or, for a test, in Teams (Apps, Manage your apps, Upload an app).

The bot code lives in `src/msteams/` and answers at `/api/msteams/messages`. Full setup steps are in the PR description and `docs/teams/MSTEAMS.md`.
