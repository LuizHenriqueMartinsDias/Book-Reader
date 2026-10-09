import { describe, expect, it } from 'vitest';
import { zoomedTurn } from './zoomedTurns';

const base = { dx: 0, dy: 0, ms: 120, startFraction: 0.5, atLeft: false, atRight: false };

describe('zoomedTurn', () => {
  it('turns on quick taps near the screen edges only', () => {
    expect(zoomedTurn({ ...base, startFraction: 0.95 })).toBe('next');
    expect(zoomedTurn({ ...base, startFraction: 0.05 })).toBe('prev');
    expect(zoomedTurn({ ...base, startFraction: 0.5 })).toBeNull();
    expect(zoomedTurn({ ...base, startFraction: 0.95, ms: 900 })).toBeNull(); // long press: selecting text
  });

  it('turns on a horizontal swipe only once the page is scrolled to that edge', () => {
    expect(zoomedTurn({ ...base, dx: -150, dy: 10, atRight: true })).toBe('next');
    expect(zoomedTurn({ ...base, dx: -150, dy: 10, atRight: false })).toBeNull(); // still panning
    expect(zoomedTurn({ ...base, dx: 150, dy: -5, atLeft: true })).toBe('prev');
    expect(zoomedTurn({ ...base, dx: 80, dy: 120, atLeft: true })).toBeNull(); // mostly vertical
    expect(zoomedTurn({ ...base, dx: -30, atRight: true })).toBeNull(); // too short
  });
});
