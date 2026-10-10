import { beforeEach, describe, expect, it } from 'vitest';
import { addActivity, addAmount, bump, convertUnit, createHabit, removeAmount, deleteHabit, routineData, setDaysOff, setOff, setValue, statusOn } from './habits';
import { db } from './schema';

describe('habits', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('logs a day, never below zero for manual habits', async () => {
    const water = await createHabit({ name: 'Água', icon: 'water', color: '#2563eb', kind: 'count', goal: 8, unit: 'copos' });
    await bump(water, '2026-10-10', 1);
    await bump(water, '2026-10-10', 1);
    await bump(water, '2026-10-11', -1);
    const data = await routineData('2026-10-10', '2026-10-11');
    expect(statusOn(data, water, '2026-10-10').value).toBe(2);
    expect(statusOn(data, water, '2026-10-11').value).toBe(0);
  });

  it('adds measured time to an automatic habit, created later or not', async () => {
    await addActivity('reading', '2026-10-09', 600);
    await addActivity('reading', '2026-10-09', 1200);
    const reading = await createHabit({ name: 'Leitura', icon: 'book', color: '#16a34a', kind: 'time', goal: 30, auto: 'reading' });
    await setValue(reading.id, '2026-10-09', 5);
    const data = await routineData('2026-10-09', '2026-10-09');
    expect(statusOn(data, reading, '2026-10-09')).toMatchObject({ value: 35, met: true });
  });

  it('keeps days off, for one habit or for all', async () => {
    const gym = await createHabit({ name: 'Academia', icon: 'gym', color: '#ea580c', kind: 'check', goal: 1, days: [1, 2, 3, 4, 5] });
    await setOff(gym.id, '2026-10-13', true);
    await setDaysOff('2026-10-14', '2026-10-16', true);
    let data = await routineData('2026-10-12', '2026-10-16');
    expect(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-16'].map((d) => statusOn(data, gym, d).off)).toEqual([null, 'off', 'dayoff', 'dayoff']);
    await setDaysOff('2026-10-15', '2026-10-15', false);
    await setOff(gym.id, '2026-10-13', false);
    data = await routineData('2026-10-12', '2026-10-16');
    expect(['2026-10-13', '2026-10-15'].map((d) => statusOn(data, gym, d).off)).toEqual([null, null]);
  });

  it('adds amounts through the day and takes any of them back', async () => {
    const water = await createHabit({ name: 'Água', icon: 'water', color: '#2563eb', kind: 'count', goal: 2000, unit: 'ml', amounts: [200, 500] });
    await addAmount(water.id, '2026-10-10', 200);
    await addAmount(water.id, '2026-10-10', 500);
    await addAmount(water.id, '2026-10-10', 350);
    await removeAmount(water.id, '2026-10-10');
    await removeAmount(water.id, '2026-10-10', 0);
    const log = await db.habitLogs.get(`${water.id}|2026-10-10`);
    expect(log).toMatchObject({ value: 500, entries: [500] });
  });

  it('converts a counted habit\'s history to another unit', async () => {
    const water = await createHabit({ name: 'Água', icon: 'water', color: '#2563eb', kind: 'count', goal: 8, unit: 'copos' });
    await bump(water, '2026-10-09', 6);
    await addAmount(water.id, '2026-10-10', 2);
    await convertUnit(water.id, 250);
    expect((await db.habitLogs.get(`${water.id}|2026-10-09`))?.value).toBe(1500);
    expect(await db.habitLogs.get(`${water.id}|2026-10-10`)).toMatchObject({ value: 500, entries: [500] });
  });

  it('orders new habits last and deletes one with its history', async () => {
    const a = await createHabit({ name: 'A', icon: 'water', color: '#000000', kind: 'check', goal: 1 });
    const b = await createHabit({ name: 'B', icon: 'water', color: '#000000', kind: 'check', goal: 1 });
    expect(b.order).toBeGreaterThan(a.order);
    await bump(a, '2026-10-10', 1);
    await deleteHabit(a.id);
    expect(await db.habitLogs.count()).toBe(0);
    expect((await db.habits.toArray()).map((h) => h.name)).toEqual(['B']);
  });
});
