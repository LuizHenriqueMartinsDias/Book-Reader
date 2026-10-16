import { describe, expect, it } from 'vitest';
import { penButtonClicks, type PenSample } from './penButton';

/** Hover moves every 11 ms from `from`, with the button held or not. */
const hover = (from: number, count: number, buttons: number): PenSample[] =>
  Array.from({ length: count }, (_, i) => ({ type: 'pointermove', pointerType: 'pen', buttons, pressure: 0, time: from + i * 11 }));

const clicks = (events: PenSample[]) => {
  const feed = penButtonClicks();
  return events.filter(feed).map((e) => e.time);
};

describe('pen button click', () => {
  it('is a press and release while the pen hovers', () => {
    // As the Tab S10 Lite reports it: `buttons` 1 while held in the air.
    expect(clicks([...hover(0, 5, 0), ...hover(55, 20, 1), ...hover(275, 3, 0)])).toEqual([275]);
  });

  it('counts a release that arrives late, once the still pen moves again', () => {
    expect(clicks([...hover(0, 3, 1), ...hover(530, 3, 0)])).toEqual([530]);
  });

  it('is not a press held long, as when it touched the screen meanwhile (the page sees nothing)', () => {
    expect(clicks([...hover(0, 5, 1), ...hover(4500, 3, 0)])).toEqual([]);
  });

  it('ignores the end of a stroke and writing itself', () => {
    const stroke: PenSample[] = [
      { type: 'pointerdown', pointerType: 'pen', buttons: 1, pressure: 0.3, time: 0 },
      { type: 'pointermove', pointerType: 'pen', buttons: 1, pressure: 0, time: 11 },
      { type: 'pointerup', pointerType: 'pen', buttons: 0, pressure: 0, time: 12 },
    ];
    expect(clicks([...stroke, ...hover(20, 5, 0)])).toEqual([]);
  });

  it('ignores fingers and the mouse', () => {
    const mouse = hover(0, 5, 1).map((e) => ({ ...e, pointerType: 'mouse' }));
    expect(clicks([...mouse, ...hover(55, 3, 0).map((e) => ({ ...e, pointerType: 'mouse' }))])).toEqual([]);
  });
});
