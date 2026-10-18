import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { addActivity } from '../../db/habits';
import type { ActivityKind } from '../../db/schema';
import { ActiveTime, TICK_MS } from '../../lib/routine/activity';
import { studyRunning } from '../../store/pomodoro';
import { useSplit } from '../split/splitStore';

/** How long without input still counts: a dense page can take a while to read. */
const IDLE_MS: Record<ActivityKind, number> = { reading: 5 * 60_000, study: 3 * 60_000 };
const INPUTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

/** The open notebooks' clocks: side by side, using the book keeps them going too. */
const studyClocks = new Set<ActiveTime>();
const sideBySide = () => useSplit.getState().active !== null;

/**
 * Counts the time spent reading (or studying) on this screen for the routine: while the app is
 * visible and there's input inside `scope`. Side by side, it's all study: input on the book
 * counts for the notebook, and the book itself counts nothing.
 * Returns `poke`, for input the scope doesn't see (a page turned in an EPUB's own frame).
 */
export function useActiveTime(kind: ActivityKind, scope: RefObject<HTMLElement | null>) {
  const clock = useRef<ActiveTime | null>(null);
  const input = useCallback(
    (now: number) => {
      clock.current?.input(now);
      if (kind === 'reading' && sideBySide()) studyClocks.forEach((c) => c.input(now));
    },
    [kind],
  );
  const poke = useCallback(() => input(Date.now()), [input]);

  useEffect(() => {
    const c = new ActiveTime(IDLE_MS[kind], Date.now());
    clock.current = c;
    if (kind === 'study') studyClocks.add(c);
    input(Date.now()); // opening the book or notebook is using it
    const save = (ready: { day: string; seconds: number }[]) => ready.forEach(({ day, seconds }) => addActivity(kind, day, seconds).catch(() => {}));
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
    const onInput = () => input(Date.now());
    const el = scope.current ?? document;
    for (const ev of INPUTS) el.addEventListener(ev, onInput, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    // While the pomodoro counts as study (a focus, or a break if set so), the notebook would count it twice.
    const counts = () => (kind === 'study' ? !studyRunning() : !sideBySide());
    const inUse = () => counts() && document.visibilityState === 'visible';
    const timer = setInterval(() => save(c.tick(Date.now(), inUse())), TICK_MS);
    return () => {
      for (const ev of INPUTS) el.removeEventListener(ev, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      clearInterval(timer);
      if (document.visibilityState === 'visible') leave();
      studyClocks.delete(c);
      clock.current = null;
    };
  }, [kind, scope, input]);

  return poke;
}
