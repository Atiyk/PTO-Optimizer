import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatCardDateRange, formatShort } from '@daysoff/engine/calendar/dateFormat';
import { noticePhrase } from '@daysoff/engine/calendar/requestDeadline';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { useRequestLedger } from './useRequestLedger';
import { settleLedgerAction } from '../integration/browserWalletStore';
import { buildDashboard, breakForRequestText, type DashboardModel, type DashboardReminder, type NextBreak, type PtoLine } from './returningDashboardModel';
import { copyText, formatManagerEmailDetailed, formatManagerEmailShort } from './requestText';
import { handOffOnClick } from './planHandoff';
import { Button } from './Button';
import type { PlanSnapshot } from './useAppState';
import { backupReminderDue, noteFirstSave, readRetentionStatus, updateRetentionStatus } from '../personal/retentionStatus';
import { browserEnumerableStorage, downloadSavedDataBackup, summarizeSavedData } from '../personal/savedDataBackup';

/**
 * P3 returning-user dashboard. Grows the "Welcome back" row (research rec 10) into the top
 * of the homepage for someone who saved a plan or tracked a request in this browser: the
 * next break, a PTO line with only the figures the app has, ONE next step chosen by where
 * the break stands (copy the request → mark requested → mark approved → open the plan), at
 * most one dated reminder, then "Plan something new", which leads to the regular homepage
 * planner right below. Calm and factual: no streaks, badges or countdown pressure.
 */
const LINK = 'link-mark inline-flex min-h-11 items-center font-semibold';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function breakDates(brk: { start: string; end: string }): string {
  const range = formatCardDateRange(brk.start, brk.end);
  return brk.start.slice(0, 4) === brk.end.slice(0, 4) ? `${range}, ${brk.end.slice(0, 4)}` : range;
}

const STATUS_LABEL: Record<NextBreak['status'], string> = {
  'in-plan': 'In your saved plan', considering: 'Considering', planned: 'Planned', requested: 'Requested', approved: 'Approved',
};

export function ptoLineText(pto: PtoLine): string {
  const parts: string[] = [];
  if (pto.available !== undefined) parts.push(`${plural(pto.available, 'PTO day')} in your plan`);
  if (pto.planned !== undefined) parts.push(`${pto.planned} planned`);
  if (pto.requested !== undefined) parts.push(`${pto.requested} requested`);
  if (pto.approved !== undefined) parts.push(`${pto.approved} approved`);
  if (pto.unplanned !== undefined) parts.push(`${pto.unplanned} not yet planned`);
  // Without a plan the first figure carries the unit.
  if (pto.available === undefined && parts.length) parts[0] = `PTO days: ${parts[0]}`;
  return parts.join(' · ');
}

export function reminderText(reminder: DashboardReminder): string {
  switch (reminder.kind) {
    case 'notice-passed':
      return `This break is now inside your ${noticePhrase(reminder.noticePeriodDays, reminder.noticeUnit)} notice period, which started ${formatShort(reminder.date)}. Ask soon, or open the plan to choose other dates.`;
    case 'request-by-soon':
      return reminder.days === 0
        ? 'Today is the request-by date for this break.'
        : `The request-by date for this break is ${formatShort(reminder.date)}, ${plural(reminder.days, 'day')} from today.`;
    case 'expiry-soon':
      return `The PTO expiry date you entered is ${formatShort(reminder.date)}, ${plural(reminder.days, 'day')} from today.`;
  }
}

function NextBreakLines({ next, today }: { next: NextBreak; today: string }) {
  const submitBy = next.submitBy;
  const notice = submitBy ? `${noticePhrase(submitBy.noticePeriodDays, submitBy.noticeUnit)} notice` : '';
  const facts = [
    STATUS_LABEL[next.status],
    ...(next.totalDaysOff !== undefined ? [plural(next.totalDaysOff, 'day') + ' off'] : []),
    plural(next.ptoDays, 'PTO day'),
  ].join(' · ');
  return <>
    <h2 className="text-h2 font-bold type-condensed text-ink">Next break: <span className="tabular-nums">{breakDates(next)}</span></h2>
    <p className="mt-1 text-muted tabular-nums">{facts}{submitBy?.date && (next.status === 'in-plan' || next.status === 'planned')
      ? submitBy.date < today
        ? <> · <strong className="font-semibold text-ink">Submit now</strong>: the {notice} window opened {formatShort(submitBy.date)}</>
        : <> · <strong className="font-semibold text-ink">Submit by {formatShort(submitBy.date)}</strong> · {notice}</>
      : ''}</p>
  </>;
}

export function ReturningDashboard({ pinnedPlans, today, offDays }: {
  pinnedPlans: readonly PlanSnapshot[];
  today: string;
  offDays: readonly string[];
}) {
  const ledger = useRequestLedger();
  const [copiedFor, setCopiedFor] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const draft = useMemo(() => buildDashboard({ requests: ledger.requests, plans: pinnedPlans, today, offDays }), [ledger.requests, pinnedPlans, today, offDays]);
  const nextKey = draft?.next ? `${draft.next.start}|${draft.next.end}` : '';
  const model = useMemo(() => copiedFor && copiedFor === nextKey
    ? buildDashboard({ requests: ledger.requests, plans: pinnedPlans, today, offDays, copied: true }) : draft,
  [copiedFor, nextKey, draft, ledger.requests, pinnedPlans, today, offDays]);

  if (!model) return null;
  const { next, plan, planLink } = model;
  const calendar = { workWeek: plan?.workWeek ?? DEFAULT_WORK_WEEK, offDays: [] as string[] };

  const copyRequest = async () => {
    if (!next) return;
    const brk = breakForRequestText(next);
    const isPto = (date: string) => next.ptoDates.includes(date);
    const text = next.noticePeriodDays !== undefined
      ? formatManagerEmailDetailed(brk, isPto, next.noticePeriodDays, calendar.workWeek, offDays, next.noticeUnit ?? 'calendar')
      : formatManagerEmailShort(brk, isPto);
    if (await copyText(text)) {
      setCopiedFor(nextKey);
      setStatus('Request text copied. Paste it into an email or your HR tool, then mark it requested here.');
    } else {
      setStatus('Copying isn’t available in this browser. Open the plan to see the request text.');
    }
  };

  const setRequestStatus = async (id: string, target: 'requested' | 'approved', expectedUpdatedAt?: string) => {
    const ok = await Promise.resolve(ledger.updateRequest(id, { status: target }, calendar, expectedUpdatedAt));
    setStatus(ok ? `Marked ${target}. Saved in this browser.` : ledger.message || 'This break could not be updated. Open My PTO to check it.');
  };

  const markRequested = async () => {
    if (!next) return;
    setPending(true);
    try {
      if (next.request) {
        await setRequestStatus(next.request.id, 'requested', next.request.updatedAt);
      } else {
        // A break from the saved plan joins My PTO the same way the planner's "Save break" does.
        const saved = await Promise.resolve(settleLedgerAction(ledger.saveBreak({
          start: next.start, end: next.end, ptoDates: next.ptoDates,
          noticePeriodDays: next.noticePeriodDays, noticeUnit: next.noticeUnit,
        }, calendar), (result) => result));
        if (saved.ok && saved.id) await setRequestStatus(saved.id, 'requested');
        else setStatus(saved.message);
      }
    } finally {
      setPending(false);
    }
  };

  const markApproved = async () => {
    if (!next?.request) return;
    setPending(true);
    try { await setRequestStatus(next.request.id, 'approved', next.request.updatedAt); } finally { setPending(false); }
  };

  const openPlan = planLink
    ? <a href={planLink.href} onClick={handOffOnClick(planLink.href, planLink.privateSearch)} className={LINK}>Open saved plan →</a>
    : null;
  const openTracker = <a href="/policy#requests" className={LINK}>Open in My PTO →</a>;
  // The secondary link goes where this break lives: a tracked request in My PTO, a plan break in the plan.
  const secondary = next?.request || !openPlan ? openTracker : openPlan;

  let primary: ReactNode;
  switch (model.action) {
    case 'copy-request': primary = <Button onClick={() => void copyRequest()}>Copy request</Button>; break;
    case 'mark-requested': primary = <Button disabled={pending} onClick={() => void markRequested()}>Mark requested</Button>; break;
    case 'mark-approved': primary = <Button disabled={pending} onClick={() => void markApproved()}>Mark approved</Button>; break;
    case 'open-plan': primary = openPlan; break;
    case 'open-tracker': primary = openTracker; break;
  }
  const showSecondary = model.action !== 'open-plan' && model.action !== 'open-tracker';

  return (
    <section aria-label="Welcome back" data-testid="welcome-back" data-dashboard-state={model.state} data-next-action={model.action}
      className="mb-6 rounded-[10px] border border-line bg-surface px-4 py-4 text-[15px] leading-6 sm:mb-10 sm:px-6 sm:py-5">
      <p className="text-sm font-semibold text-muted">Welcome back</p>
      <div className="mt-1 min-w-0">
        {next ? <NextBreakLines next={next} today={today} />
          : plan ? <>
            <h2 className="text-h2 font-bold type-condensed text-ink">Your saved plan: {plan.summary.totalDaysOff} days off for {plural(plan.summary.budgetSpent, 'PTO day')}</h2>
            <p className="mt-1 text-muted tabular-nums">{model.state === 'past-only'
              ? `Its breaks between ${breakDates({ start: plan.rangeStart, end: plan.rangeEnd })} are behind you.`
              : `${plural(plan.summary.breakCountActual, 'break')} between ${breakDates({ start: plan.rangeStart, end: plan.rangeEnd })}`}</p>
          </> : null}
        {model.pto && <p data-testid="pto-line" className="mt-1 text-ink tabular-nums">{ptoLineText(model.pto)}</p>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {primary}
        {showSecondary && secondary}
      </div>
      {status && <p role="status" className="mt-2 text-sm text-muted">{status}</p>}
      {model.reminder && <p data-testid="dashboard-reminder" className="mt-3 border-t border-line pt-3 text-ink">{reminderText(model.reminder)}</p>}
      <BackupReminder />
      <p className="mt-3 border-t border-line pt-2">
        <a href="#landing-heading" className={LINK}>Plan something new ↓</a>
      </p>
    </section>
  );
}

/** Shown only when saved data is worth keeping and has no recent backup (see backupReminderDue). */
function BackupReminder() {
  const [now] = useState(() => new Date());
  const [state, setState] = useState(() => {
    const summary = summarizeSavedData(browserEnumerableStorage());
    return { summary, status: readRetentionStatus() };
  });
  const [message, setMessage] = useState('');
  const meaningful = state.summary.pinnedPlans > 0 || state.summary.requests > 0;
  useEffect(() => {
    // Saved before this reminder existed: start its 14-day clock from this visit.
    if (meaningful && !state.status.firstSavedAt) noteFirstSave(now);
  }, [meaningful, state.status.firstSavedAt, now]);
  const dataSince = [state.status.firstSavedAt, state.summary.oldestRequestAt].filter((value): value is string => !!value).sort()[0];
  const due = backupReminderDue({ hasMeaningfulData: meaningful, dataSince, status: state.status, now });
  if (message) return <p role="status" className="mt-3 border-t border-line pt-3 text-sm text-muted">{message}</p>;
  if (!due) return null;
  const backUp = () => {
    const at = new Date();
    if (downloadSavedDataBackup(browserEnumerableStorage(), at)) {
      updateRetentionStatus({ lastBackupAt: at.toISOString() });
      setMessage('Backup file downloaded. Keep it outside this browser, for example in your files or email.');
    } else {
      setMessage('The backup file could not be made in this browser.');
    }
  };
  const dismiss = () => {
    updateRetentionStatus({ backupReminderDismissedAt: new Date().toISOString() });
    setState((previous) => ({ ...previous, status: readRetentionStatus() }));
  };
  return (
    <div data-testid="backup-reminder" className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-sm text-muted">
      <p className="min-w-0">Your saved plans and requests are only in this browser. {state.status.lastBackupAt
        ? `Your last backup was ${formatShort(state.status.lastBackupAt.slice(0, 10))}.` : 'You haven’t made a backup file yet.'}</p>
      <span className="flex items-center gap-1">
        <Button variant="quiet" size="sm" className="min-h-11" onClick={backUp}>Back up</Button>
        <Button variant="quiet" size="sm" className="min-h-11" onClick={dismiss}>Not now</Button>
      </span>
    </div>
  );
}

export type { DashboardModel };
