import { db, type ActivityKind, type Habit, type HabitLog } from './schema';
import { addDays, dayKey, dayStatus, fromKey } from '../lib/routine/calendar';
import { newId } from './repo';

export type NewHabit = Omit<Habit, 'id' | 'order' | 'createdAt'>;

export async function createHabit(input: NewHabit) {
  const last = await db.habits.orderBy('order').last();
  const habit: Habit = { ...input, id: newId(), order: (last?.order ?? 0) + 1, createdAt: Date.now() };
  await db.habits.add(habit);
  return habit;
}

export const updateHabit = (id: string, changes: Partial<Habit>) => db.habits.update(id, changes);

/** Hides a habit from the routine; its history stays (and comes back if it's restored). */
export const archiveHabit = (id: string, archived = true) => db.habits.update(id, { archived });

/** Deletes a habit and its history. */
export async function deleteHabit(id: string) {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete();
    await db.habits.delete(id);
  });
}

const logId = (habitId: string, date: string) => `${habitId}|${date}`;

async function changeLog(habitId: string, date: string, change: (log: HabitLog) => void) {
  await db.transaction('rw', db.habitLogs, async () => {
    const log = (await db.habitLogs.get(logId(habitId, date))) ?? { id: logId(habitId, date), habitId, date, value: 0, updatedAt: 0 };
    change(log);
    log.updatedAt = Date.now();
    await db.habitLogs.put(log);
  });
}

/** Sets what a habit came to on a day (for an automatic one, the correction on top of the measured time). */
export const setValue = (habitId: string, date: string, value: number) =>
  changeLog(habitId, date, (log) => {
    log.value = value;
  });

/** Adds to (or takes from) a day's value; a manual habit never goes below 0. */
export const bump = (habit: Habit, date: string, delta: number) =>
  changeLog(habit.id, date, (log) => {
    log.value = habit.auto ? log.value + delta : Math.max(0, log.value + delta);
  });

/** A day off for one habit (holiday, gym closed). */
export const setOff = (habitId: string, date: string, off: boolean) =>
  changeLog(habitId, date, (log) => {
    if (off) log.off = true;
    else delete log.off;
  });

/** Days off for every habit, from one day to another (a trip); `off: false` takes them back. */
export async function setDaysOff(from: string, to: string, off: boolean) {
  const ids: string[] = [];
  for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) ids.push(dayKey(d));
  if (off) await db.dayOffs.bulkPut(ids.map((id) => ({ id })));
  else await db.dayOffs.bulkDelete(ids);
}

/** Adds measured seconds of reading or study to a day. */
export async function addActivity(kind: ActivityKind, date: string, seconds: number) {
  const id = `${kind}|${date}`;
  await db.transaction('rw', db.activity, async () => {
    const found = await db.activity.get(id);
    await db.activity.put({ id, kind, date, seconds: (found?.seconds ?? 0) + seconds });
  });
}

/** Everything the routine shows for days `from`…`to` (inclusive). */
export async function routineData(from: string, to: string) {
  const [habits, logs, dayOffs, activity] = await Promise.all([
    db.habits.orderBy('order').toArray(),
    db.habitLogs.where('date').between(from, to, true, true).toArray(),
    db.dayOffs.where('id').between(from, to, true, true).toArray(),
    db.activity.where('date').between(from, to, true, true).toArray(),
  ]);
  return {
    habits,
    logs: new Map(logs.map((l) => [l.id, l])),
    dayOffs: new Set(dayOffs.map((d) => d.id)),
    activity: new Map(activity.map((a) => [a.id, a.seconds])),
  };
}

export type RoutineData = Awaited<ReturnType<typeof routineData>>;

/** A habit on a day, with its log, everyone's days off and the measured time. */
export const statusOn = (data: RoutineData, habit: Habit, key: string) =>
  dayStatus(habit, key, {
    log: data.logs.get(logId(habit.id, key)),
    allOff: data.dayOffs.has(key),
    activitySeconds: habit.auto ? data.activity.get(`${habit.auto}|${key}`) : 0,
  });
