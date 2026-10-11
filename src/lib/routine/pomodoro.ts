import { dayKey } from './calendar';

/** A stretch of focus, a short break, or the long break after a few focuses. */
export type Phase = 'focus' | 'short' | 'long';

/** Minutes of each phase, how many focuses until a long break, and whether the next phase starts by itself. */
export interface PomodoroSettings {
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  autoNext: boolean;
}

export const DEFAULT_SETTINGS: PomodoroSettings = { focus: 25, short: 5, long: 15, longEvery: 4, autoNext: false };

/**
 * Where the timer is. It runs by its end time, not by counting seconds, so it stays right while
 * the app is closed or the tablet sleeps. `ended`: a phase finished and `phase` is the one that
 * comes next, waiting for a tap.
 */
export interface Pomodoro {
  phase: Phase;
  status: 'idle' | 'running' | 'paused' | 'ended';
  endsAt: number | null;
  /** Paused: milliseconds left. */
  left: number | null;
  /** A focus running: up to when its time was given to study. */
  credited: number | null;
  /** Focuses finished since the last long break. */
  done: number;
}

export const IDLE: Pomodoro = { phase: 'focus', status: 'idle', endsAt: null, left: null, credited: null, done: 0 };

/** Seconds of focus to add to each day's study. */
export type Credit = { day: string; seconds: number }[];

/** What an action leads to: the new state, focus time to save, and the phases that ran out. */
export interface Step {
  state: Pomodoro;
  credit: Credit;
  /** Phases that finished on their own, with when (for the chime and the day's count). */
  ended: { phase: Phase; at: number }[];
}

export const phaseMs = (phase: Phase, settings: PomodoroSettings) => settings[phase] * 60_000;

/** The phase after `phase`, given how many focuses are done (the long break comes every `longEvery`). */
function nextPhase(phase: Phase, done: number, settings: PomodoroSettings): Phase {
  if (phase !== 'focus') return 'focus';
  return done > 0 && done % settings.longEvery === 0 ? 'long' : 'short';
}

/** `from`…`to` in whole seconds, split at local midnight; returns where it got to (the leftover under a second waits). */
function splitByDay(from: number, to: number): { credit: Credit; until: number } {
  const credit: Credit = [];
  let t = from;
  while (to - t >= 1000) {
    const d = new Date(t);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const seconds = Math.floor((Math.min(to, midnight) - t) / 1000);
    if (seconds > 0) credit.push({ day: dayKey(d), seconds });
    if (to < midnight) {
      t += seconds * 1000;
      break;
    }
    t = midnight;
  }
  return { credit, until: t };
}

/** Gives the focus time since the last credit (up to the end of the focus) to study. */
export function credit(state: Pomodoro, now: number): Step {
  if (state.status !== 'running' || state.phase !== 'focus' || state.credited === null || state.endsAt === null) return { state, credit: [], ended: [] };
  const { credit, until } = splitByDay(state.credited, Math.min(now, state.endsAt));
  return { state: { ...state, credited: until }, credit, ended: [] };
}

/** Runs `next` on the state after crediting it, keeping that credit. */
function after(state: Pomodoro, now: number, next: (s: Pomodoro) => Pomodoro): Step {
  const c = credit(state, now);
  return { ...c, state: next(c.state) };
}

const running = (phase: Phase, endsAt: number, from: number, done: number): Pomodoro => ({
  phase,
  status: 'running',
  endsAt,
  left: null,
  credited: phase === 'focus' ? from : null,
  done,
});

/** Starts `phase` now (whatever was running stops, its focus time kept). */
export const start = (state: Pomodoro, phase: Phase, settings: PomodoroSettings, now: number): Step =>
  after(state, now, (s) => running(phase, now + phaseMs(phase, settings), now, s.phase === 'long' && phase !== 'long' ? 0 : s.done));

export const pause = (state: Pomodoro, now: number): Step =>
  state.status !== 'running' || state.endsAt === null ? { state, credit: [], ended: [] } : after(state, now, (s) => ({ ...s, status: 'paused', left: Math.max(0, s.endsAt! - now), endsAt: null, credited: null }));

export const resume = (state: Pomodoro, now: number): Step =>
  state.status !== 'paused' || state.left === null ? { state, credit: [], ended: [] } : { state: running(state.phase, now + state.left, now, state.done), credit: [], ended: [] };

/** Stops the round: back to the start, with the focus time so far kept. */
export const stop = (state: Pomodoro, now: number): Step => after(state, now, () => IDLE);

/**
 * Leaves this phase (or, between phases, the one waiting) for the next one, right away. A focus
 * cut short doesn't count as done; leaving a long break starts a new round.
 */
export function skip(state: Pomodoro, settings: PomodoroSettings, now: number): Step {
  return after(state, now, (s) => {
    const done = s.phase === 'long' ? 0 : s.done;
    const phase = nextPhase(s.phase, done, settings);
    return running(phase, now + phaseMs(phase, settings), now, done);
  });
}

/**
 * Catches up with the clock: a phase past its end finishes, and the next one waits for a tap or,
 * with `autoNext`, starts where the last one ended (several may have gone by with the app closed).
 */
export function advance(state: Pomodoro, settings: PomodoroSettings, now: number): Step {
  let s = state;
  const out: Credit = [];
  const ended: Step['ended'] = [];
  while (s.status === 'running' && s.endsAt !== null && now >= s.endsAt) {
    const c = credit(s, s.endsAt);
    out.push(...c.credit);
    const at = s.endsAt;
    const done = s.phase === 'focus' ? s.done + 1 : s.phase === 'long' ? 0 : s.done;
    const phase = nextPhase(s.phase, done, settings);
    ended.push({ phase: s.phase, at });
    s = settings.autoNext ? running(phase, at + phaseMs(phase, settings), at, done) : { ...IDLE, phase, status: 'ended', done };
  }
  if (s !== state && s.status === 'running') {
    const c = credit(s, now);
    out.push(...c.credit);
    s = c.state;
  }
  return { state: s, credit: mergeDays(out), ended };
}

function mergeDays(credit: Credit): Credit {
  const byDay = new Map<string, number>();
  for (const { day, seconds } of credit) byDay.set(day, (byDay.get(day) ?? 0) + seconds);
  return [...byDay].map(([day, seconds]) => ({ day, seconds }));
}

/** Milliseconds left in the phase (its full length when it hasn't started). */
export function remaining(state: Pomodoro, settings: PomodoroSettings, now: number) {
  if (state.status === 'running' && state.endsAt !== null) return Math.max(0, state.endsAt - now);
  if (state.status === 'paused' && state.left !== null) return state.left;
  return phaseMs(state.phase, settings);
}

/** `24:59` (minutes may pass 60: `90:00`). Rounds up, so the last second shows `00:01`, not `00:00`. */
export function clock(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
