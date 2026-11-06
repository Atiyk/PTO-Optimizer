# What Gapless stores about you

Gapless works fully without an account. Plans, policies, tracked requests and balances
live in your browser and in the links you share. Nothing below exists unless the site
owner has turned accounts on **and** you sign in.

## If you sign in

Stored in the site's database (Neon Postgres), in one row per person:

| Field | Why |
| --- | --- |
| Email address | To send your sign-in links and the reminder emails you turn on |
| Saved plan link | The plan whose "book by" dates you want emailed (a link like `/?s=...`) |
| Saved policy link | The policy whose expiry reminders you want emailed (a link like `/policy?...`) |
| Reminders on or off | Whether to send reminder emails |
| Last reminder date | So you get at most one email a day |

Your notice period, balance and planned days are inside those links, exactly as they are
in a link you'd share. Gapless does not store your name, employer, manager, requests or
anything you paste into the app.

Also stored, without your address:

- A one-way hash of an email address for two minutes to one day after a sign-in link is
  requested, so the same address can't be sent links over and over. Asking for a link does
  not create an account. Only using the link does.
- A count of emails sent per day, to stay under the sending limit.
- One-way hashes of the requesting IP address (for sign-in links, kept up to two days) and
  of your account id (for forwarded-approval replies), each with a count, so one source
  can't ask for more than five sign-in links an hour or five replies a day.

## Deleting

"Delete my account" removes your row at once. Signing out only removes the cookie in your
browser. "Stop these emails" in any reminder turns reminders off without signing in.

## Email

- Emails are sent through a Gmail account that belongs to the site, so Google handles
  delivery, and copies sit in that account's Sent folder.
- **Forward the approval** (when on): an email you forward to the site's CloudMailin
  address passes through CloudMailin, is read once in memory to write the reply, and is
  not stored by Gapless. The reply only ever goes to your account's own address.
