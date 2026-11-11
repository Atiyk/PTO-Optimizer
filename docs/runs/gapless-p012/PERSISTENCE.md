# Personal data persistence (P1, Issue 4)

All personal data in the consumer app stays in this browser's `localStorage`. Nothing
here goes into a URL, telemetry or a server. This note records how writes are kept
atomic and recoverable, and why IndexedDB is not used.

## Stores

| Data | Key | Size limit | Write path |
| --- | --- | --- | --- |
| Request ledger | `gapless.personal.requests.v1` | 1,000,000 chars (300 requests) | `saveRequestLedger` via `useRequestLedger` (Web Lock when available) |
| Leave wallet | `gapless.personal.leave-wallet.v1` | 250,000 chars (20 banks) | `browserWalletStore` CAS under the same Web Lock; import/clear refuse without locks |
| Saved policy | `gapless.personal.policy.v1` | 16,000 chars | `writePolicyPreferences` (explicit Save) |
| Workspace setting (balance basis, hourly schedule) | `gapless.personal.workspace.v1` | 1,000 chars | `writeBalanceBasisPreference` / `writeWorkdaySchedulePreference` (read-modify-write) |
| Employer calendar | `gapless.employer.v1:<country>:<region>` | 16,000 chars | `writeEmployerCalendar` (explicit Save) |
| Pinned plans | `gapless.personal.pinned-plans.v1` | 350,000 chars | Already read-modify-write under a Web Lock; an unreadable value is left intact and pins work for the visit only. Unchanged. |
| Employer work profiles | `gapless.employer.profiles.v1` | 64,000 chars | No UI caller yet. Unchanged. |
| Expiry reminder prefs | `gapless.personal.expiration.v1` | tiny | Last write wins on purpose (a few toggles). Unchanged. |

## Record format

Each JSON record keeps its schema `version` (still 1) and gains `revision` (UUID) and
`updatedAt` (ISO time) on every write (`stampRecord` in `src/personal/storageRecord.ts`).
Readers ignore unknown fields, so older code still reads new records. Records without a
`revision` (legacy) are identified by a content hash, so stale-write detection works for
them too. The employer calendar keeps its compact `1.[...]` format and is identified by
content hash.

## Rules (`guardedWrite`)

1. **Stale-write detection.** A write names the revision it was based on. If the stored
   revision differs, the write is refused with `stale` and nothing is overwritten.
   - Ledger: every mutation re-reads storage and applies the change to the fresh data in
     the same lock or task, then writes against that revision. This is a merge: a request
     added in another tab is never lost (test: `useRequestLedger.persistence.test.tsx`).
   - Policy and employer calendar are whole-document explicit saves. The page remembers the
     revision it loaded. A save after another tab saved shows "Nothing was overwritten. Save
     again to replace it". The second save is the user's deliberate choice.
2. **Newer schema.** A record with `version > 1` (written by a newer deploy in another tab)
   is never replaced. The ledger is then read-only for this visit and says so.
3. **Corrupt data is quarantined, not wiped.** Unparseable JSON, or a ledger with entries
   this version cannot read (`partial`), is copied to `<key>.quarantine` (up to the 3
   newest copies) before anything replaces it. If the copy cannot be stored (quota), the
   write is refused. The user sees a notice in My PTO and on the policy page.
4. **Recoverable migration.** The first versioned write over a legacy record (no
   `revision`) first copies the old value to `<key>.backup`, once.

## Cross-tab coordination

- Other tabs: the `storage` event refreshes the ledger, workspace setting, wallet and pinned
  plans. On the policy page it shows a notice and never replaces the inputs being edited.
- Same tab: the existing custom events (`gapless:requests-changed`,
  `gapless:workspace-basis-changed`, `gapless:wallet-banks-changed`).
- Ledger and wallet writes share one Web Lock (`navigator.locks`), so a read-modify-write
  from two tabs is serialized. Browsers without Web Locks keep the old behaviour: the read
  and write happen in one synchronous task, and wallet import/clear stay disabled.
- BroadcastChannel is not added. `storage` events already reach every other same-origin tab
  for these keys, and same-tab listeners already use custom events. A second channel would
  duplicate refreshes without adding coverage.

## IndexedDB: not required

- **Sizes.** The largest record is the ledger at 1 MB max. A realistic ledger is 300 short
  requests, about 120 KB. All stores together are well under the roughly 5 MB per-origin
  `localStorage` quota, even with a backup and three quarantined copies of a typical ledger.
  A near-maximum ledger plus copies could hit the quota. In that case the guarded write
  refuses, and data is never dropped.
- **Atomicity.** Each record is one key, and one `setItem` replaces it atomically. The only
  operation spanning two records (wallet import, which checks the ledger) already runs
  under a Web Lock with a compare-and-swap on both revisions. IndexedDB transactions would
  add multi-key atomicity that no current flow needs.
- **Support and cost.** `localStorage` is synchronous and works in every supported browser,
  including private modes that throw on `setItem`, which is already handled. IndexedDB would
  make every read async. That breaks the synchronous first render the planner relies on for
  live results without a loading step. It would also need a migration and a second code
  path for browsers that block it.
- **Revisit when** a store needs more than about 1 MB, needs atomic writes across several
  keys outside the Web Lock, or needs to store binary data.
