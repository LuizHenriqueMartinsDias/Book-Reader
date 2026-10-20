import { describe, expect, it } from 'vitest';
import { zoomedTurn } from './zoomedTurns';

const base = { dx: 0, dy: 0, ms: 120, startFraction: 0.5, edge: null };
const atRight = (dx: number, dy = 0) => ({ dx, dy, atLeft: false, atRight: true });
const atLeft = (dx: number, dy = 0) => ({ dx, dy, atLeft: true, atRight: false });

describe('zoomedTurn', () => {
  it('turns on quick taps near the screen edges only', () => {
    expect(zoomedTurn({ ...base, startFraction: 0.95 })).toBe('next');
    expect(zoomedTurn({ ...base, startFraction: 0.05 })).toBe('prev');
    expect(zoomedTurn({ ...base, startFraction: 0.5 })).toBeNull();
    expect(zoomedTurn({ ...base, startFraction: 0.95, ms: 900 })).toBeNull(); // long press: selecting text
  });

  it('turns on a horizontal swipe that goes on past the page edge', () => {
    expect(zoomedTurn({ ...base, dx: -150, dy: 10, edge: atRight(-150, 10) })).toBe('next'); // already there
    expect(zoomedTurn({ ...base, dx: -250, dy: 10, edge: atRight(-160, 6) })).toBe('next'); // got there on the way
    expect(zoomedTurn({ ...base, dx: 150, dy: -5, edge: atLeft(150, -5) })).toBe('prev');
  });

  it('only pans when the swipe stops at the edge, or is not sideways', () => {
    expect(zoomedTurn({ ...base, dx: -150, dy: 10 })).toBeNull(); // never got to the edge
    expect(zoomedTurn({ ...base, dx: -150, dy: 10, edge: atRight(-30) })).toBeNull(); // stopped right after it
    expect(zoomedTurn({ ...base, dx: -150, dy: 10, edge: atLeft(-150, 10) })).toBeNull(); // panning away from the left edge
    expect(zoomedTurn({ ...base, dx: 80, dy: 120, edge: atLeft(80, 120) })).toBeNull(); // mostly vertical
  });
});
