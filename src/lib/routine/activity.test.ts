import { describe, expect, it } from 'vitest';
import { ActiveTime, TICK_MS } from './activity';

const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 10, h, m, s).getTime();

describe('active time', () => {
  it('counts while the page is visible, a minute at a time', () => {
    const clock = new ActiveTime(at(10));
    const saved = [];
    for (let t = at(10) + TICK_MS; t <= at(10, 2); t += TICK_MS) saved.push(...clock.tick(t, true));
    expect(saved).toEqual([
      { day: '2026-10-10', seconds: 60 },
      { day: '2026-10-10', seconds: 60 },
    ]);
  });

  it('keeps counting without input, and stops while the page is hidden', () => {
    const clock = new ActiveTime(at(10));
    let seconds = 0;
    for (let t = at(10) + TICK_MS; t <= at(10, 10); t += TICK_MS) seconds += clock.tick(t, t <= at(10, 5)).reduce((n, s) => n + s.seconds, 0);
    seconds += clock.flush().reduce((n, s) => n + s.seconds, 0);
    expect(seconds).toBe(300);
  });

  it('does not count the time a tablet slept', () => {
    const clock = new ActiveTime(at(10));
    clock.tick(at(11), true);
    expect(clock.flush()).toEqual([{ day: '2026-10-10', seconds: 30 }]);
  });

  it('gives the time before midnight to the day before', () => {
    const clock = new ActiveTime(at(23, 59, 30));
    expect(clock.tick(at(23, 59, 45), true)).toEqual([]);
    expect(clock.tick(new Date(2026, 9, 11, 0, 0, 0).getTime(), true)).toEqual([{ day: '2026-10-10', seconds: 15 }]);
    expect(clock.flush()).toEqual([{ day: '2026-10-11', seconds: 15 }]);
  });
});
