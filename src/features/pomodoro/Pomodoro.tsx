import { useEffect } from 'react';
import { advancePomodoro, creditPomodoro, startPhase, usePomodoro } from '../../store/pomodoro';
import type { Phase } from '../../lib/routine/pomodoro';
import { useToast } from '../Toast';
import { phaseAlert, unlockSound } from './alert';
import PomodoroChip from './PomodoroChip';
import PomodoroPanel from './PomodoroPanel';
import { PHASES } from './Ring';

/** How often focus time is saved while it runs (like the reading and study clocks). */
const CREDIT_MS = 15_000;
/** A phase that ended longer ago than this (the app was closed) ends quietly. */
const LATE_MS = 10_000;

/** The end of phases: a chime, a buzz and a word, unless it happened while the app was away. */
function announce(ended: { phase: Phase; at: number }[]) {
  const last = ended.at(-1);
  if (!last || Date.now() - last.at > LATE_MS) return;
  const { prefs, timer } = usePomodoro.getState();
  phaseAlert(prefs);
  const next = PHASES[timer.phase].label.toLowerCase();
  const what = last.phase === 'focus' ? 'Foco terminado' : 'Pausa terminada';
  if (timer.status === 'running') useToast.getState().show(`${what}: ${next} de ${prefs[timer.phase]} min`);
  else useToast.getState().show(`${what}.`, { label: `Começar ${next}`, run: () => startPhase(timer.phase) });
}

/** The screen stays on while `on` (the browser lets go when the page hides, so it's asked again on return). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const get = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (done) l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {});
    };
    get();
    document.addEventListener('visibilitychange', get);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', get);
      lock?.release().catch(() => {});
    };
  }, [on]);
}

/**
 * The pomodoro, over every screen: keeps the clock up to date, saves focus time as study, rings
 * at the end of each phase, and shows the floating clock and its panel.
 */
export default function Pomodoro() {
  const status = usePomodoro((s) => s.timer.status);
  const keepAwake = usePomodoro((s) => s.prefs.keepAwake);
  const panelOpen = usePomodoro((s) => s.panelOpen);

  useEffect(() => {
    // Opening the app (or coming back to it) catches up with what went by meanwhile.
    const catchUp = () => {
      advancePomodoro();
      creditPomodoro();
    };
    catchUp();
    const onVisibility = () => (document.visibilityState === 'hidden' ? creditPomodoro() : catchUp());
    // Another tab started or paused it: take that on (only the visible tab saves focus time).
    const onStorage = (e: StorageEvent) => e.key === usePomodoro.persist.getOptions().name && usePomodoro.persist.rehydrate();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', creditPomodoro);
    window.addEventListener('storage', onStorage);
    // Sound can only start from a tap; after a reload, the first tap anywhere gets it ready.
    document.addEventListener('pointerdown', unlockSound, { once: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', creditPomodoro);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('pointerdown', unlockSound);
    };
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    let credited = Date.now();
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const ended = advancePomodoro();
      if (ended.length) announce(ended);
      else if (Date.now() - credited >= CREDIT_MS) {
        creditPomodoro();
        credited = Date.now();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  useWakeLock(status === 'running' && keepAwake);

  return (
    <>
      {status !== 'idle' && <PomodoroChip />}
      {panelOpen && <PomodoroPanel />}
    </>
  );
}
