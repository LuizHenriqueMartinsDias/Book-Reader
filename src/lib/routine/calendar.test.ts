import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../../db/schema';
import { addDays, dayKey, dayStatus, easter, formatAmount, fromKey, gridWeeks, holidayName, level, overallLevel, streaks, type DayStatus } from './calendar';

const habit = (h: Partial<Habit> = {}): Habit => ({ id: 'h', name: 'Academia', icon: 'gym', color: '#ea580c', kind: 'check', goal: 1, order: 1, createdAt: 0, ...h });
const log = (date: string, value: number, extra: Partial<HabitLog> = {}): HabitLog => ({ id: `h|${date}`, habitId: 'h', date, value, updatedAt: 0, ...extra });

describe('days', () => {
  it('are keyed by local date', () => {
    expect(dayKey(new Date(2026, 9, 10, 23, 30))).toBe('2026-10-10');
    expect(dayKey(fromKey('2027-01-01'))).toBe('2027-01-01');
    expect(dayKey(addDays(fromKey('2026-12-31'), 1))).toBe('2027-01-01');
  });
});

describe('holidays', () => {
  it('finds Easter', () => {
    expect(dayKey(easter(2026))).toBe('2026-04-05');
    expect(dayKey(easter(2027))).toBe('2027-03-28');
  });

  it('knows the fixed and the movable national holidays', () => {
    expect(holidayName('2026-09-07')).toBe('Independência');
    expect(holidayName('2026-11-20')).toBe('Consciência Negra');
    expect(holidayName('2026-02-16')).toBe('Carnaval');
    expect(holidayName('2026-02-17')).toBe('Carnaval');
    expect(holidayName('2026-04-03')).toBe('Sexta-feira Santa');
    expect(holidayName('2026-06-04')).toBe('Corpus Christi');
    expect(holidayName('2027-05-27')).toBe('Corpus Christi');
    expect(holidayName('2026-09-08')).toBeUndefined();
  });
});

describe('a day of a habit', () => {
  const weekdays = habit({ days: [1, 2, 3, 4, 5], holidaysOff: true });

  it("is off on days it is not due, holidays, its own days off and everyone's", () => {
    expect(dayStatus(weekdays, '2026-10-10', {}).off).toBe('unscheduled'); // a Saturday
    expect(dayStatus(weekdays, '2026-09-07', {}).off).toBe('holiday'); // a Monday
    expect(dayStatus(weekdays, '2026-10-14', { log: log('2026-10-14', 0, { off: true }) }).off).toBe('off');
    expect(dayStatus(weekdays, '2026-10-14', { allOff: true }).off).toBe('dayoff');
    expect(dayStatus(weekdays, '2026-10-14', {}).off).toBeNull();
    expect(dayStatus(habit({ days: [1, 2, 3, 4, 5] }), '2026-09-07', {}).off).toBeNull();
  });

  it('counts when done anyway on a day off', () => {
    expect(dayStatus(weekdays, '2026-10-10', { log: log('2026-10-10', 1) })).toMatchObject({ off: null, met: true });
  });

  it('adds measured minutes to an automatic habit, with corrections', () => {
    const reading = habit({ kind: 'time', goal: 30, auto: 'reading' });
    expect(dayStatus(reading, '2026-10-10', { activitySeconds: 25 * 60 + 50 }).value).toBe(25);
    expect(dayStatus(reading, '2026-10-10', { activitySeconds: 25 * 60, log: log('2026-10-10', 10) })).toMatchObject({ value: 35, met: true });
  });

  it('is shaded by how close it came to the goal', () => {
    const water = habit({ kind: 'count', goal: 8 });
    expect([0, 3, 5, 8, 12].map((v) => level(water, v))).toEqual([0, 1, 2, 3, 4]);
    expect(level(habit(), 1)).toBe(3);
  });
});

const st = (met: boolean, off: DayStatus['off'] = null, value = met ? 1 : 0): DayStatus => ({ met, off, value, level: met ? 3 : 0 });

describe('streaks', () => {
  const run = (days: Record<string, DayStatus>, from: string, today: string) => streaks((k) => days[k] ?? st(false), fromKey(from), fromKey(today));

  it('skip days off instead of breaking', () => {
    // Mon–Fri done, the weekend off, Monday a holiday, Tuesday done.
    const days = {
      '2026-08-31': st(true), '2026-09-01': st(true), '2026-09-02': st(true), '2026-09-03': st(true), '2026-09-04': st(true),
      '2026-09-05': st(false, 'unscheduled'), '2026-09-06': st(false, 'unscheduled'), '2026-09-07': st(false, 'holiday'), '2026-09-08': st(true),
    };
    expect(run(days, '2026-08-31', '2026-09-08')).toEqual({ current: 6, best: 6 });
  });

  it('break on a day that was due and not done, and keep the best', () => {
    const days = { '2026-10-01': st(true), '2026-10-02': st(true), '2026-10-03': st(false), '2026-10-04': st(true) };
    expect(run(days, '2026-10-01', '2026-10-04')).toEqual({ current: 1, best: 2 });
  });

  it('do not break while today is still going', () => {
    const days = { '2026-10-08': st(true), '2026-10-09': st(true) };
    expect(run(days, '2026-10-08', '2026-10-10')).toEqual({ current: 2, best: 2 });
  });
});

describe('the year grid', () => {
  it('has columns from Sunday to Saturday, ending in the week of today', () => {
    const weeks = gridWeeks(new Date(2026, 9, 7), 53); // a Wednesday
    expect(weeks).toHaveLength(53);
    const last = weeks[52].days;
    expect(last.slice(0, 4)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(last.slice(4)).toEqual([null, null, null]);
    expect(fromKey(weeks[0].days[0]!).getDay()).toBe(0);
  });

  it('names a month where it starts', () => {
    const weeks = gridWeeks(new Date(2026, 9, 10), 6);
    expect(weeks.map((w) => w.month ?? '')).toEqual(['', 'set', '', '', '', 'out']);
  });

  it('shades a day by how many of the habits due met their goal', () => {
    expect(overallLevel([st(true), st(true)])).toBe(4);
    expect(overallLevel([st(true), st(false), st(false, 'holiday')])).toBe(2);
    expect(overallLevel([st(false), st(false)])).toBe(0);
    expect(overallLevel([st(false, 'unscheduled')])).toBe('off');
  });
});

describe('amounts', () => {
  it('read in liters from a liter of milliliters up', () => {
    expect(formatAmount(750, 'ml')).toBe('750 ml');
    expect(formatAmount(1250, 'ml')).toBe('1,25 L');
    expect(formatAmount(2000, 'ML')).toBe('2 L');
    expect(formatAmount(5, 'copos')).toBe('5 copos');
    expect(formatAmount(1500, 'passos')).toBe('1.500 passos');
  });
});
