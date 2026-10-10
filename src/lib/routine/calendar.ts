import type { Habit, HabitLog } from '../../db/schema';

/** `2026-10-10`: a day by its local date (not UTC, so it doesn't change at 21h in Brazil). */
export function dayKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Easter Sunday (anonymous Gregorian algorithm, Meeus/Jones/Butcher). */
export function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED_HOLIDAYS: [string, string][] = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Consciência Negra'],
  ['12-25', 'Natal'],
];

const holidayCache = new Map<number, Map<string, string>>();

/** Brazil's national holidays of a year, by day key: the fixed ones and the ones that follow Easter. */
export function nationalHolidays(year: number): Map<string, string> {
  let found = holidayCache.get(year);
  if (found) return found;
  const e = easter(year);
  found = new Map([
    ...FIXED_HOLIDAYS.map(([md, name]): [string, string] => [`${year}-${md}`, name]),
    [dayKey(addDays(e, -48)), 'Carnaval'],
    [dayKey(addDays(e, -47)), 'Carnaval'],
    [dayKey(addDays(e, -2)), 'Sexta-feira Santa'],
    [dayKey(addDays(e, 60)), 'Corpus Christi'],
  ]);
  holidayCache.set(year, found);
  return found;
}

export const holidayName = (key: string) => nationalHolidays(Number(key.slice(0, 4))).get(key);

/** Whether a habit is due on a day of the week. */
export const isScheduled = (habit: Habit, date: Date) => !habit.days || habit.days.includes(date.getDay());

/** What a habit came to on a day: the logged value, plus the measured minutes for an automatic one. */
export function dayValue(habit: Habit, log: HabitLog | undefined, activitySeconds = 0) {
  const logged = log?.value ?? 0;
  return habit.auto ? Math.max(0, Math.floor(activitySeconds / 60) + logged) : logged;
}

/** Shade of a day's square, 0 (nothing) to 4: past the goal by half is darker than just reaching it. */
export function level(habit: Habit, value: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  if (habit.kind === 'check') return 3;
  const r = value / habit.goal;
  return r < 0.5 ? 1 : r < 1 ? 2 : r < 1.5 ? 3 : 4;
}

export const met = (habit: Habit, value: number) => value >= habit.goal;

/** Why a day doesn't count for a habit: not one of its days, its own day off, everyone's day off, a holiday. */
export type OffReason = 'unscheduled' | 'off' | 'dayoff' | 'holiday';

export interface DayStatus {
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
  met: boolean;
  /** A day that doesn't count: it neither adds to nor breaks a streak (unless done anyway, then it counts). */
  off: OffReason | null;
}

export function dayStatus(habit: Habit, key: string, o: { log?: HabitLog; allOff?: boolean; activitySeconds?: number }): DayStatus {
  const value = dayValue(habit, o.log, o.activitySeconds);
  const reason: OffReason | null = !isScheduled(habit, fromKey(key))
    ? 'unscheduled'
    : o.log?.off
      ? 'off'
      : o.allOff
        ? 'dayoff'
        : habit.holidaysOff && holidayName(key)
          ? 'holiday'
          : null;
  // Done anyway on a day off: an extra, counted like any other day.
  return { value, level: level(habit, value), met: met(habit, value), off: reason && value <= 0 ? reason : null };
}

/**
 * Shade of a day in the year grid for all habits: how many of those due that day met their goal.
 * 'off' when none was due (weekend, holiday, a day off for everything).
 */
export function overallLevel(statuses: DayStatus[]): 0 | 1 | 2 | 3 | 4 | 'off' {
  const due = statuses.filter((s) => !s.off);
  if (!due.length) return 'off';
  const f = due.filter((s) => s.met).length / due.length;
  if (f === 0) return due.some((s) => s.value > 0) ? 1 : 0;
  return f < 0.5 ? 1 : f < 0.75 ? 2 : f < 1 ? 3 : 4;
}

/**
 * Current and best streak, in days that count: days off are skipped, a day due but not met
 * breaks it, and today doesn't break it while it's still going.
 */
export function streaks(statusOf: (key: string) => DayStatus, from: Date, today: Date) {
  let run = 0;
  let best = 0;
  const todayKey = dayKey(today);
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const key = dayKey(d);
    const s = statusOf(key);
    if (s.met) best = Math.max(best, ++run);
    else if (!s.off && key !== todayKey) run = 0;
  }
  return { current: run, best };
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface GridWeek {
  /** Month name over the column where a month starts. */
  month?: string;
  /** Sunday to Saturday; null after today. */
  days: (string | null)[];
}

/** The year grid: `weeks` columns, Sunday to Saturday, the last one holding today. */
export function gridWeeks(today: Date, weeks = 53): GridWeek[] {
  const start = addDays(today, -today.getDay() - (weeks - 1) * 7);
  const todayKey = dayKey(today);
  const out: GridWeek[] = [];
  let past = false;
  for (let w = 0; w < weeks; w++) {
    const days: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(addDays(start, w * 7 + d));
      days.push(past ? null : key);
      if (key === todayKey) past = true;
    }
    const sunday = addDays(start, w * 7);
    const prev = addDays(sunday, -7);
    // Labeled where the month changes; the first column only if the next label is far enough.
    const month = w === 0 || sunday.getMonth() !== prev.getMonth() ? MONTHS[sunday.getMonth()] : undefined;
    out.push({ month, days });
  }
  if (out.length > 2 && (out[1].month || out[2].month)) out[0].month = undefined;
  return out;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "Segunda, 7 de setembro". */
export function dayTitle(key: string) {
  const d = fromKey(key);
  const name = WEEKDAYS[d.getDay()];
  return `${name[0].toUpperCase()}${name.slice(1)}, ${d.getDate()} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()]}`;
}

/** "1 h 10 min", "45 min", "2 h". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}
