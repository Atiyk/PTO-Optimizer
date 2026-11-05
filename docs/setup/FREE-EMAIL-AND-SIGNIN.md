# Free email reminders, sign-in and "forward the approval"

All three features are built and switched off. Each one turns on by itself when its
settings exist in Vercel, so you can do Part 1 now and Part 3 later, or never.
Total cost: **$0**. Nothing here asks for a credit card.

| Part | What it turns on | Service (free plan) | Time |
| --- | --- | --- | --- |
| 1 | Sending email | A new Gmail account + app password | 10 min |
| 2 | Sign-in and daily reminder emails | Neon Postgres via Vercel + two secrets | 10 min |
| 3 | Forward the approval | CloudMailin | 10 min |

Free limits checked November 2026: Gmail about 500 recipients a day (the app stops at
400 by default), Neon 1 GB storage and 100 compute hours a month, CloudMailin 10,000
emails a month, Vercel Hobby one cron run a day.

What isn't free, and isn't needed: emails from your own domain (like `hello@gapless.app`)
need a domain, about $10 a year. Until then, mail comes from the new Gmail address.

---

## Part 1: a Gmail account that sends the email

1. Open <https://accounts.google.com/signup> in a private window, so you aren't signed in
   to your own account.
2. First name **Gapless**, last name **Reminders** (this is the sender name people see).
   Click **Next** through birthday and gender.
3. Choose **Create your own Gmail address** and pick something like
   `gapless.reminders@gmail.com`. Make a strong password and save it in your password manager.
4. Add your phone number when asked. You need it for the next step. Finish the signup.
5. Open <https://myaccount.google.com/signinoptions/twosv> (signed in as the new account),
   click **Turn on 2-Step Verification**, and follow the prompts with your phone.
6. Open <https://myaccount.google.com/apppasswords>. For **App name** type `Gapless on Vercel`
   and click **Create**.
7. Google shows a 16-letter password in four groups. **Copy it now.** Google won't show it
   again. (Spaces don't matter.)

> If step 6 says the setting isn't available, 2-Step Verification isn't on yet. Do step 5 again.
> Changing the account's password later cancels the app password; make a new one if that happens.

## Part 2: sign-in and reminder emails

### 2a. Add the free database

1. Open <https://vercel.com/marketplace/neon> and click **Install**.
2. Choose **Create New Neon Account** and click **Continue**.
3. Region: **Washington, D.C., USA (iad1)** (where Vercel runs the site's functions by
   default). Leave **Auth** and **Realtime** off.
4. Plan: **Free**. Accept the terms, name the database `gapless`, and click **Create**.
5. You land on Vercel's **Storage** tab. Click the `gapless` database, then **Connect Project**.
6. Pick the **PTO-Optimizer** project, tick **Production** and **Preview**, and click **Connect**.

This adds `DATABASE_URL` to the project for you. The app creates its tables on first use,
so there's no SQL to run.

### 2b. Make two random secrets

On a Mac, open **Terminal** and run this twice, copying each line it prints:

```
openssl rand -hex 32
```

(No Terminal? Any password manager's generator works. Use 40 or more letters and numbers.)
The first is `APP_SECRET`, the second is `CRON_SECRET`.

### 2c. Add the settings in Vercel

1. Open <https://vercel.com/dashboard>, click **PTO-Optimizer**, then **Settings** → **Environment Variables**.
2. Add each of these (Key, then Value), with **Production** and **Preview** ticked, clicking **Save** after each:

| Key | Value |
| --- | --- |
| `GMAIL_USER` | the new Gmail address from Part 1 |
| `GMAIL_APP_PASSWORD` | the 16-letter app password from Part 1 |
| `APP_SECRET` | your first random secret |
| `CRON_SECRET` | your second random secret |

3. Optional: `APP_URL` = `https://pto-optimizer-seven.vercel.app` (Production only). This is
   the site address used in reminder emails. If you leave it out, the app uses whatever
   address the request came in on, which is right for both previews and production.
4. Go to **Deployments**, click **⋯** on the newest Production deployment, then **Redeploy**.

### 2d. Check it works

1. Open the site. Below **Keep this plan in your calendar** there's now **Get reminders by email**.
2. Enter your own email and click **Email me a sign-in link**. The email arrives from the
   new Gmail address within a minute (check Spam the first time and mark it **Not spam**).
3. Click the link. The section now says **Signed in as …**. Tick **Email me … for this plan**.
4. Reminder emails go out once a day at about 13:00 UTC, but only on days something is due.
   To run it now: Vercel → **PTO-Optimizer** → **Settings** → **Cron Jobs** → **Run** next to `/api/remind`.
   It returns `"sent": 0` on days nothing is due. That's normal.

## Part 3: forward the approval (optional)

1. Open <https://www.cloudmailin.com/>, click **Sign up**, and sign up with the new Gmail
   address. The Free plan needs no card.
2. Create a random secret the same way as in Part 2b. This is `INBOUND_SECRET`.
3. When CloudMailin asks for the **Target URL**, enter
   `https://pto-optimizer-seven.vercel.app/api/inbound?key=YOUR_INBOUND_SECRET`
   (paste your secret in place of `YOUR_INBOUND_SECRET`).
4. For **POST format**, choose the **JSON** option. Multipart also works.
5. Save. CloudMailin shows your email address, something like `1a2b3c4d@cloudmailin.net`. Copy it.
6. In Vercel → **Settings** → **Environment Variables**, add (Production only):

| Key | Value |
| --- | --- |
| `INBOUND_SECRET` | the secret from step 2 |
| `INBOUND_ADDRESS` | the `@cloudmailin.net` address from step 5 |

7. **Redeploy** as in Part 2c step 4.
8. Test: sign in to the site with your own email. Then, from that same email, forward
   any "your time off is approved" email to the CloudMailin address. A reply with the dates
   and an out-of-office message arrives within a minute.

> Use your email's **Forward** button. An automatic Gmail forwarding filter would need
> CloudMailin to receive Google's confirmation email first, which this setup doesn't handle.

---

## Turning things off

Delete the variables in Vercel and redeploy. With no `GMAIL_*` variables the whole email
section disappears from the site. Deleting `INBOUND_SECRET` turns off only forwarding.

## Limits and honest caveats

- **Gmail sending limit.** About 500 recipients a day for a personal account. The app stops
  at 400 a day (`DAILY_EMAIL_CAP`) and says so. If the site outgrows this, move to a domain
  plus a provider such as Resend (3,000 a month free). That needs the roughly $10 a year domain.
- **Gmail says app passwords are "not recommended".** They still work for personal accounts
  with 2-Step Verification. If Google ever retires them, the fix is swapping the mailer, not the app.
- **Vercel Hobby is for non-commercial use.** It's fine while the site is free. If you add paid
  features or ads, Vercel expects the Pro plan.
- **Reminder time.** Vercel's free cron runs once a day, give or take an hour.

## Settings reference

| Variable | Needed for | Notes |
| --- | --- | --- |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | all email | sender account |
| `DATABASE_URL` | sign-in, reminders | added by the Neon integration (`POSTGRES_URL` also works) |
| `APP_SECRET` | sign-in, reminders | 32+ characters; changing it signs everyone out |
| `CRON_SECRET` | daily reminders | Vercel sends it to `/api/remind` automatically |
| `INBOUND_SECRET`, `INBOUND_ADDRESS` | forward the approval | |
| `APP_URL` | optional | site address for links in emails |
| `MAIL_FROM_NAME` | optional | sender name, default `Gapless` |
| `DAILY_EMAIL_CAP` | optional | default 400 |
