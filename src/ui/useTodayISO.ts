import { useEffect, useState } from 'react';
import { todayISO } from './today';

/** Track the viewer's calendar date while a page stays open, including DST transitions. */
export function useTodayISO(override?: string): string {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    if (override !== undefined) return;
    let timer: number;
    function refresh() {
      window.clearTimeout(timer);
      setToday(todayISO());
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [override]);

  return override ?? today;
}
