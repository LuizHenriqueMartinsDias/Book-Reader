import { useEffect } from 'react';
import { addActivity } from '../../db/habits';
import type { ActivityKind } from '../../db/schema';
import { ActiveTime, TICK_MS } from '../../lib/routine/activity';
import { studyRunning } from '../../store/pomodoro';
import { useSplit } from '../split/splitStore';

const sideBySide = () => useSplit.getState().active !== null;

/**
 * Counts the time spent reading (or studying) on this screen for the routine: while it is open
 * and the app is visible. Side by side, it's all study: the notebook counts, the book doesn't.
 */
export function useActiveTime(kind: ActivityKind) {
  useEffect(() => {
    const c = new ActiveTime(Date.now());
    const save = (ready: { day: string; seconds: number }[]) => ready.forEach(({ day, seconds }) => addActivity(kind, day, seconds).catch(() => {}));
    // While the pomodoro counts as study (a focus, or a break if set so), the notebook would count it twice.
    const counts = () => (kind === 'study' ? !studyRunning() : !sideBySide());
    // Up to now the page was visible: count that, then save what's left.
    const leave = () => {
      save(c.tick(Date.now(), counts()));
      save(c.flush());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
      // Back: the time away doesn't count.
      else c.tick(Date.now(), false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    const timer = setInterval(() => save(c.tick(Date.now(), counts() && document.visibilityState === 'visible')), TICK_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      clearInterval(timer);
      if (document.visibilityState === 'visible') leave();
    };
  }, [kind]);
}
