# Privacy: Days Off for Teams

> **DRAFT, NEEDS LEGAL REVIEW.** Written by an engineer from how the product actually handles data
> (2026-10-30). It is not legal advice. Before publishing, a lawyer should check it against GDPR/UK
> GDPR, US state privacy laws and the employment-data rules where customers operate, and fill in
> the bracketed items.

## Part 1: Privacy policy (draft, for the website)

**Who we are.** [Legal entity name, address, contact email] ("we") provides Days Off for Teams, a
leave-management service for companies ("customers").

**Our role.** For the people whose leave a customer manages (employees, managers, admins), the
customer is the controller and we are its processor: we handle that data only on the customer's
instructions, under a data processing agreement. For visitors to our website and the people who sign
up a workspace, we are the controller.

**What we collect about employees (on the customer's behalf).**
- Name, work email (optional), role, team, manager, location, start date, working pattern and tags
  the customer sets (for example "engineer").
- Slack user id and workspace id, if the customer uses Sign in with Slack.
- Leave requests: dates, type, half-day or hours, status, who decided, and an optional note.
- Balance entries: accruals, usage, adjustments with the reason an admin gave, carry-over.
- An audit log of actions taken, by whom and through which tool (web, Slack, an AI agent).

**What we deliberately do not collect.** Reasons for sick or other health-related leave. Notes on
those requests are off unless the customer turns them on, and then only the approver and admins can
see them; they are never sent to webhooks or service agents. We don't collect home addresses, birth
dates, salaries, government ids or device location.

**How we use it.** Only to provide the service: calculating balances, routing approvals, showing
who is out, planning leave across a team, and the AI features below. No advertising, no sale of data,
no profiling beyond what the customer's leave rules need.

**AI features.** When an admin imports a handbook, or someone types a request in their own words or
asks "why is my balance this number", the relevant text is sent to Anthropic's API to be read. Text
written by people is marked as data, not instructions. Every number shown comes from our own
calculation engine, never from the model. [Confirm Anthropic's current commercial terms on training
and retention and summarise them here.] Customers can run with AI turned off; every form still works.

**AI agents customers connect.** If a customer or an employee connects an AI agent (for example
Claude, ChatGPT, Microsoft Copilot Studio or Salesforce Agentforce), that agent sees only what the
connecting person or admin allowed, and the customer's agreement with that provider governs what the
provider does with it.

**Subprocessors.** Vercel (hosting, [region]), Neon (database, [region]), Anthropic (AI text
processing), Slack (sign-in and, if installed, the Slack app). [Link to a maintained list and notice
period for changes.]

**Retention.** Customer data is kept while the workspace exists. Webhook delivery logs are deleted
after 90 days; expired access tokens after a day. When a workspace is deleted, all its data is deleted
from the live database at once and from backups within [Neon's backup window, e.g. 7 to 30 days].

**Your rights.** Employees should contact their employer first: admins can export one person's data
and erase it from the admin pages. We help customers answer requests. Where we are the controller,
email [privacy contact]. You may complain to your data protection authority.

**Security.** See our security overview (`docs/teams/SECURITY.md`).

**Childcare centres and clinics (regulated coverage).** If a customer uses staffing coverage, we
also hold, for staff:
- weekly shifts and dated changes;
- credentials such as CPR, with issue and expiry dates;
- hours worked, for sick-leave accrual;
- cover offers and responses;
- optionally, a phone number for SMS cover offers, only with the person's opt-in;
- passkeys (public keys only) and push-notification device addresses for the staff app;
- pay rates, only if the customer turns on cost-aware ranking. They are visible to admins only and
  never sent to the AI provider.

**About children** we hold only **how many** children of each age group are expected in each room
and time block. We never hold names, birthdays, photos or any other detail that could identify a
child. **When someone calls in sick**, we record that they are out, never why.

**International transfers.** [Describe SCCs / UK addendum / DPF as applicable to the subprocessors.]

**Changes.** We'll notify customers of material changes [N] days in advance.

## Part 2: Data processing summary (for a DPA annex)

| Item | Detail |
|---|---|
| Subject matter | Managing employees' leave: requests, approvals, balances, planning, notifications |
| Duration | The term of the customer's subscription, plus the deletion period above |
| Nature and purpose | Storage, calculation, display, notifications (Slack and webhooks the customer configures), AI-assisted reading of text the customer supplies |
| Data subjects | The customer's employees, contractors and admins |
| Personal data | Identity and work details (name, work email, role, team, manager, location, start date, work pattern, tags), Slack ids, leave records, balance ledger, audit trail. With coverage: shifts, credentials and expiry dates, hours worked, cover offers, optional SMS phone, passkey public keys, push device addresses, and pay rates only if cost-aware ranking is on |
| Special category data | None by design. Children appear only as counts per age group, room and time block; call-offs carry no reason. Health-related leave is recorded only as "out" with dates; no reasons. Optional notes, if a customer enables them, may contain health data: the customer is responsible for that choice |
| Subprocessors | Vercel, Neon, Anthropic, Slack (see Part 1) |
| Security measures | `docs/teams/SECURITY.md`: tenant isolation tests, encryption in transit, hashed credentials, role- and scope-based access, audit log, rate limits |
| Return and deletion | Admin export (JSON/CSV, whole workspace or one person) at any time; workspace deletion removes all rows at once (tested); per-person erasure anonymises the person and keeps leave dates under "Former member" |
| Assistance | Export and erasure tools in the admin pages; audit log for access questions |

## How export and deletion work (engineering notes)

- **Export** (`exportData`): admins, whole workspace or one person, JSON or CSV. CSV cells are
  protected against spreadsheet formula injection. Health-related notes are left out unless the
  org enabled them.
- **Erase a person** (`eraseMember`): name becomes "Former member"; email, Slack link and tags are
  cleared; their request notes and decision notes on their requests are deleted; their personal
  tokens, drafts addressed to them and webhook deliveries that named them are deleted; anyone they
  managed loses the manager link. Leave dates and balance entries stay, because the employer usually
  must keep leave records. Owners can't be erased (transfer ownership first), and admins can't
  erase themselves.
- **Delete the workspace** (`deleteWorkspace`): owner only, after typing the workspace name. Every
  table with an `org_id` cascades from the organisation row; a test counts zero rows in every one of
  them afterwards and checks another workspace is untouched.
- **Not yet**: a self-service "download my data" for employees (admins do it today), and automated
  deletion from backups (depends on Neon's retention window).
