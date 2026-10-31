# Setup steps: Microsoft Teams, AI reports and the Complete plan

Only the account owner can do these steps, because they need the Azure, Vercel and Anthropic accounts. Nothing in this PR registers an app, sends a message or changes a setting for you. Until the steps are done, everything else ships working:

- Without the Teams variables, the Teams endpoint returns 503 and Teams notifications are skipped.
- Without an Anthropic key, reports and policy answers use the rule-based summary.
- Without the plan switch, organizations stay on Starter.

## 1. Microsoft Teams bot (about 20 minutes)

### Before you start: who can use the bot

Since 31 July 2025, Azure no longer lets you create new multi-tenant bots. A new bot is single-tenant, and that sets who can use it:

- **Your own Microsoft 365 tenant:** works as soon as the steps below are done. Upload the package yourself.
- **Other organizations' tenants (your customers):** publish the app to the Teams Store (Partner Center, Microsoft 365 and Copilot program). A zip uploaded in another tenant does not deliver messages to a single-tenant bot.

Microsoft's own forum answers disagree about the workaround of making the app registration multi-tenant, so this guide doesn't rely on it. Plan on Store publishing for customers.

### Steps

1. **Create the bot.**
   1. In the [Azure portal](https://portal.azure.com), open Create a resource and choose **Azure Bot**.
   2. Set **Type of App** to **Single Tenant**.
   3. Set **Creation type** to **Create new Microsoft App ID**. The free (F0) pricing tier is enough for this bot's traffic.
2. **Copy the bot's IDs.** Open the bot, then **Configuration**. Copy the **Microsoft App ID** and the **App Tenant ID**.
3. **Create a client secret.**
   1. Next to Microsoft App ID, choose **Manage Password**. This opens the Entra app registration.
   2. Go to **Certificates & secrets**, then **New client secret**.
   3. Copy the secret's **Value** now. It is shown only once.
4. **Set the messaging endpoint.**
   1. Back in the bot's **Configuration**, set **Messaging endpoint** to `https://<your-domain>/api/msteams/messages`.
   2. Save.
5. **Turn on Teams.** In the bot's **Channels**, add **Microsoft Teams**, accept the terms, and save.
6. **Add the variables in Vercel.**
   1. In Vercel, open Project, then Settings, then Environment Variables. Add these for Production:
      - `MSTEAMS_APP_ID` = the Microsoft App ID
      - `MSTEAMS_APP_PASSWORD` = the secret value
      - `MSTEAMS_TENANT_ID` = the App Tenant ID
   2. Redeploy.
7. **Build the Teams app package.** Follow `apps/teams/msteams/README.md`:
   1. Fill in the App ID, your domain, and privacy and terms URLs in `manifest.json`. The app has no privacy or terms page yet; the Store needs real ones.
   2. Zip `manifest.json`, `color.png` and `outline.png`.
8. **Upload the package.** In the Teams admin center, open Teams apps, then Manage apps, then **Upload new app**. Allow it for the people who request or approve leave.
9. **Link your tenant in Days Off.**
   1. Sign in as an owner or admin and open **Admin, Approvals & policies, Microsoft Teams**.
   2. Paste your Microsoft 365 tenant ID and save. Find the tenant ID in Entra admin center, under Overview.
10. **Each approver opens the app once in Teams.**
    - Teams only allows the bot to message someone who has opened or installed it.
    - People are matched by their Teams sign-in email to their Days Off roster email.
    - Approvers get request cards in Teams from then on.

**Check it:** send `help`, then `balance`, then `Off Friday` to the bot. A confirm card should come back. Approve the request from the approver's Teams. The card changes to "Approved".

## 2. AI summaries and policy answers (about 5 minutes)

1. Create a key at [console.anthropic.com](https://console.anthropic.com), under API keys. Set a monthly spend limit under Billing.
2. In Vercel, add `ANTHROPIC_API_KEY` for Production and redeploy.
3. Optional model overrides:
   - The absence report summary uses `claude-opus-5-5`. Set `AI_MODEL_ABSENCE_REPORT` to use another model, such as `claude-sonnet-5-5` for lower cost.
   - Policy answers use `claude-haiku-5-5`. Override them with `AI_MODEL_ANSWER_POLICY_QUESTION`.
4. To turn AI off at any time, set `AI_DISABLED=1`. The rule-based summary is used instead.

The AI only sees the report's numbers. Team IDs are removed and no names are sent. Any number in the reply that is not in those numbers sends the reply back to the rule-based summary.

## 3. Turn on the Complete plan for an organization

There is no billing yet. The plan is a flag:

```sql
UPDATE organizations SET plan = 'complete' WHERE id = '<org id>';
```

- Run it in the Neon SQL editor. The org ID is in the URL of Admin, Setup, or in the `organizations` table.
- Complete lets an org accrue leave semimonthly, biweekly or weekly.
- Starter keeps monthly accrual. Sick and health leave can always use any schedule, because some laws set how fast it accrues.

## 4. Database

The new tables and columns are migration `0008_approvals_automations`. It runs by itself on deploy, like the earlier migrations. The rollback is in `apps/teams/drizzle/down/0008_approvals_automations.sql`.
