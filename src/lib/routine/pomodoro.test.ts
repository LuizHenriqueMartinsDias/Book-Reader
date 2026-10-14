import { describe, expect, it } from 'vitest';
import { advance, clock, credit, DEFAULT_SETTINGS, IDLE, pause, remaining, resume, skip, start, stop, type Pomodoro } from './pomodoro';

const at = (h: number, m = 0, s = 0, day = 10) => new Date(2026, 9, day, h, m, s).getTime();
const min = 60_000;
const settings = DEFAULT_SETTINGS;
const seconds = (credit: { seconds: number }[]) => credit.reduce((n, c) => n + c.seconds, 0);

/** Runs a whole focus from `t` to its end, returning the state after it. */
const focusAt = (state: Pomodoro, t: number) => advance(start(state, 'focus', settings, t).state, settings, t + 25 * min).state;

describe('pomodoro', () => {
  it('keeps the time left across a pause', () => {
    let s = start(IDLE, 'focus', settings, at(10)).state;
    s = pause(s, at(10, 10)).state;
    expect(remaining(s, settings, at(11))).toBe(15 * min);
    s = resume(s, settings, at(11)).state;
    expect(s.endsAt).toBe(at(11, 15));
    expect(remaining(s, settings, at(11, 5))).toBe(10 * min);
  });

  it('offers a short break after a focus and a long one after the fourth', () => {
    let s = IDLE;
    for (let i = 0; i < 3; i++) {
      s = focusAt(s, at(10 + i));
      expect(s).toMatchObject({ status: 'ended', phase: 'short', done: i + 1 });
    }
    s = focusAt(s, at(14));
    expect(s).toMatchObject({ status: 'ended', phase: 'long', done: 4 });
    s = start(s, 'long', settings, at(15)).state;
    expect(s.done).toBe(4);
    s = advance(s, settings, at(15, 15)).state;
    expect(s).toMatchObject({ status: 'ended', phase: 'focus', done: 0 });
  });

  it('tells which phases ran out, and when', () => {
    const s = start(IDLE, 'focus', settings, at(10)).state;
    expect(advance(s, settings, at(10, 20)).ended).toEqual([]);
    expect(advance(s, settings, at(10, 30)).ended).toEqual([{ phase: 'focus', at: at(10, 25) }]);
  });

  it('goes on by itself with autoNext, even through phases missed with the app closed', () => {
    const auto = { ...settings, autoNext: true };
    const s = start(IDLE, 'focus', auto, at(10)).state;
    // 25 focus + 5 break + 25 focus, then 2 minutes into the next break.
    const step = advance(s, auto, at(10, 57));
    expect(step.ended.map((e) => e.phase)).toEqual(['focus', 'short', 'focus']);
    expect(step.state).toMatchObject({ status: 'running', phase: 'short', endsAt: at(11, 0), done: 2 });
    expect(step.credit).toEqual([{ day: '2026-10-10', seconds: 50 * 60 }]);
  });

  it('gives only focus time to study, up to the end of the focus', () => {
    let s = start(IDLE, 'focus', settings, at(10)).state;
    const first = credit(s, at(10, 10));
    expect(first.credit).toEqual([{ day: '2026-10-10', seconds: 600 }]);
    s = first.state;
    // The app reopened hours later: only the rest of the focus counts.
    const later = advance(s, settings, at(14));
    expect(later.credit).toEqual([{ day: '2026-10-10', seconds: 15 * 60 }]);
    // A break counts nothing.
    s = start(later.state, 'short', settings, at(14)).state;
    expect(credit(s, at(14, 4)).credit).toEqual([]);
  });

  it('gives the breaks to study too when set so', () => {
    const breaks = { ...settings, breaks: true };
    let s = start(IDLE, 'short', breaks, at(10)).state;
    expect(credit(s, at(10, 4)).credit).toEqual([{ day: '2026-10-10', seconds: 240 }]);
    // With autoNext: 25 focus + 5 break + 10 of the next focus, all of it study.
    const auto = { ...breaks, autoNext: true };
    s = start(IDLE, 'focus', auto, at(11)).state;
    expect(seconds(advance(s, auto, at(11, 40)).credit)).toBe(40 * 60);
    // A break paused and resumed still counts.
    s = pause(start(IDLE, 'long', breaks, at(12)).state, at(12, 5)).state;
    s = resume(s, breaks, at(13)).state;
    expect(seconds(credit(s, at(13, 10)).credit)).toBe(600);
  });

  it('does not count a paused focus', () => {
    let s = start(IDLE, 'focus', settings, at(10)).state;
    const paused = pause(s, at(10, 5));
    expect(seconds(paused.credit)).toBe(300);
    s = resume(paused.state, settings, at(11)).state;
    expect(seconds(credit(s, at(11, 5)).credit)).toBe(300);
  });

  it('never counts the same time twice', () => {
    let s = start(IDLE, 'focus', settings, at(10)).state;
    let total = 0;
    for (let t = at(10) + 15_500; t <= at(10, 30); t += 15_500) {
      const step = advance(s, settings, t);
      const c = step.state === s ? credit(s, t) : step;
      total += seconds(c.credit);
      s = c.state;
    }
    expect(total).toBe(25 * 60);
  });

  it('splits a focus across midnight', () => {
    const s = start(IDLE, 'focus', settings, at(23, 50)).state;
    expect(advance(s, settings, at(0, 20, 0, 11)).credit).toEqual([
      { day: '2026-10-10', seconds: 600 },
      { day: '2026-10-11', seconds: 900 },
    ]);
  });

  it('keeps the focus so far when stopped', () => {
    const s = start(IDLE, 'focus', settings, at(10)).state;
    const step = stop(s, at(10, 12));
    expect(step.credit).toEqual([{ day: '2026-10-10', seconds: 720 }]);
    expect(step.state).toEqual(IDLE);
  });

  it('skips to the next phase without counting the focus as done', () => {
    let s = start(IDLE, 'focus', settings, at(10)).state;
    const step = skip(s, settings, at(10, 5));
    expect(seconds(step.credit)).toBe(300);
    expect(step.state).toMatchObject({ status: 'running', phase: 'short', done: 0, endsAt: at(10, 10) });
    // Between phases, skipping passes over the one waiting.
    s = focusAt(IDLE, at(11));
    expect(skip(s, settings, at(12)).state).toMatchObject({ status: 'running', phase: 'focus', endsAt: at(12, 25) });
  });

  it('shows the clock rounded up', () => {
    expect(clock(25 * min)).toBe('25:00');
    expect(clock(500)).toBe('00:01');
    expect(clock(90 * min)).toBe('90:00');
  });
});
