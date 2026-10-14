import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { addActivity } from '../db/habits';
import { dayKey } from '../lib/routine/calendar';
import * as timer from '../lib/routine/pomodoro';
import { DEFAULT_SETTINGS, IDLE, type Phase, type Pomodoro, type PomodoroSettings, type Step } from '../lib/routine/pomodoro';

export interface PomodoroPrefs extends PomodoroSettings {
  sound: boolean;
  vibrate: boolean;
  /** The screen stays on while a phase runs, so its end can be heard. */
  keepAwake: boolean;
}

/** Where the floating clock sits: against one side, this many pixels from the bottom. */
export interface ClockSpot {
  side: 'left' | 'right';
  bottom: number;
}

interface PomodoroState {
  timer: Pomodoro;
  prefs: PomodoroPrefs;
  /** Focuses finished on this device on `date`. */
  today: { date: string; focuses: number };
  spot: ClockSpot;
  panelOpen: boolean;
  set: (patch: Partial<Pick<PomodoroState, 'prefs' | 'spot' | 'panelOpen'>>) => void;
}

/**
 * The pomodoro of this device: its state lives in localStorage, like the other device settings
 * (not in backups); the time it gives to study goes to the `activity` table.
 */
export const usePomodoro = create<PomodoroState>()(
  persist(
    (set) => ({
      timer: IDLE,
      prefs: { ...DEFAULT_SETTINGS, sound: true, vibrate: true, keepAwake: true },
      today: { date: '', focuses: 0 },
      spot: { side: 'right', bottom: 112 },
      panelOpen: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'book-reader-pomodoro',
      partialize: ({ set: _set, panelOpen: _open, ...rest }) => rest,
      // Prefs saved before a setting existed get its default.
      merge: (saved, current) => {
        const s = saved as Partial<PomodoroState> | undefined;
        return { ...current, ...s, prefs: { ...current.prefs, ...s?.prefs } };
      },
    },
  ),
);

/** Takes on a step: the new state, its study time saved, the focuses that ended counted. */
function apply(step: Step) {
  for (const { day, seconds } of step.credit) addActivity('study', day, seconds).catch(() => {});
  usePomodoro.setState((s) => {
    let today = s.today;
    for (const { phase, at } of step.ended) {
      const date = dayKey(new Date(at));
      if (phase === 'focus') today = { date, focuses: (today.date === date ? today.focuses : 0) + 1 };
    }
    return { timer: step.state, today };
  });
  return step;
}

const now = () => Date.now();
const state = () => usePomodoro.getState();

export const startPhase = (phase: Phase) => apply(timer.start(state().timer, phase, state().prefs, now()));
export const pausePomodoro = () => apply(timer.pause(state().timer, now()));
export const resumePomodoro = () => apply(timer.resume(state().timer, state().prefs, now()));
export const stopPomodoro = () => apply(timer.stop(state().timer, now()));
export const skipPomodoro = () => apply(timer.skip(state().timer, state().prefs, now()));
/** Catches up with the clock; returns the phases that just ran out. */
export const advancePomodoro = () => apply(timer.advance(state().timer, state().prefs, now())).ended;
/** Saves the study time so far. */
export const creditPomodoro = () => apply(timer.credit(state().timer, now()));

/** A phase that counts as study is running, so the notebooks don't count that time again. */
export function studyRunning() {
  const { status, credited } = state().timer;
  return status === 'running' && credited !== null;
}

export const openPomodoro = () => state().set({ panelOpen: true });

/** Focuses finished today on this device. */
export function focusesToday(today: PomodoroState['today'], date = dayKey(new Date())) {
  return today.date === date ? today.focuses : 0;
}
