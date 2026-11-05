import { Component, type ReactNode } from 'react';
import { buttonClasses } from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error boundaries must be class components - there is no hook equivalent of
 * getDerivedStateFromError/componentDidCatch. Wraps only the calendar grid, not the whole
 * app: a crash while rendering one plan's cells shouldn't take the controls, the summary
 * strip, or the export buttons down with it - the user can still change their inputs to get
 * out of whatever state triggered the crash, which is the actual recovery path, not just
 * the "try again" button (a crash from a reused faulty input immediately recurs).
 */
export class CalendarErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Calendar failed to render:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-[10px] border-2 border-ink bg-surface p-8 text-center text-ink">
          <p className="text-[15px] font-semibold">The calendar couldn&apos;t render.</p>
          <p className="max-w-sm text-sm text-muted">
            Try the button below, or adjust the date range, PTO days, or other plan settings - a change there often
            clears it.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className={buttonClasses('secondary', 'md')}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
