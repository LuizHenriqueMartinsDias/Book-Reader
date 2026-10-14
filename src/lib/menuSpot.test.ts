import { describe, expect, it } from 'vitest';
import { menuTop } from './menuSpot';

// A 1000px-tall screen: the search panel takes its last 96px, so a 48px menu fits down to 856.
const top = (selTop: number, selBottom: number) => menuTop(selTop, selBottom, 48, 1000);

describe('menuTop', () => {
  it('goes below the selection, where Android leaves room (its bar goes above)', () => {
    expect(top(300, 340)).toBe(348);
  });

  it('goes below the bar Android puts under a selection at the top of the screen', () => {
    expect(top(20, 60)).toBe(132);
  });

  it('goes above the selection and its bar when the search panel is below', () => {
    expect(top(840, 880)).toBe(840 - 8 - 48 - 64);
  });

  it('sits over the text, clear of the search panel, when the selection fills the screen', () => {
    expect(top(40, 980)).toBe(856);
  });
});
