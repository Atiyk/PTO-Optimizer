import { Component, type ReactNode } from 'react';

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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-800">The calendar couldn&apos;t render.</p>
          <p className="max-w-sm text-xs text-red-700">
            Try the button below, or adjust the date range, PTO days, or other settings above - a change there often
            clears it.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
