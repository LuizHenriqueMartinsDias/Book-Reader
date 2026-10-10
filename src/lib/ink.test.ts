import { beforeEach, describe, expect, it } from 'vitest';
import type { Brush, Point } from '../db/schema';
import { inkStyle, useUi } from '../store/ui';
import { inkOpacity, MARKER_OPACITY, PENCIL_OPACITY, strokeOutline } from './ink';

/** Width of a stroke's outline across its middle, for a straight line at a given pressure. */
function widthAt(brush: Brush, pressure: number) {
  const points: Point[] = Array.from({ length: 30 }, (_, i) => [i * 4, 0, pressure]);
  const outline = strokeOutline({ tool: 'pen', brush, width: 8, points });
  const middle = outline.filter(([x]) => Math.abs(x - 58) < 12).map(([, y]) => y);
  return Math.max(...middle) - Math.min(...middle);
}

describe('kinds of pen', () => {
  it('a fineliner keeps its thickness whatever the pressure; a pen and a brush follow it', () => {
    expect(widthAt('fineliner', 0.2)).toBeCloseTo(widthAt('fineliner', 1), 1);
    expect(widthAt('pen', 1)).toBeGreaterThan(widthAt('pen', 0.2) * 1.5);
    expect(widthAt('brush', 1) / widthAt('brush', 0.2)).toBeGreaterThan(widthAt('pen', 1) / widthAt('pen', 0.2));
  });

  it('treats strokes saved before pen kinds as the pen', () => {
    const points: Point[] = [[0, 0, 0.5], [20, 0, 0.5], [40, 0, 0.5]];
    expect(strokeOutline({ tool: 'pen', width: 3, points })).toEqual(strokeOutline({ tool: 'pen', brush: 'pen', width: 3, points }));
  });
});

describe('pen thickness per kind', () => {
  beforeEach(() => useUi.setState({ penBrush: 'pen', penWidth: 2, brushWidths: {} }));

  it('remembers the thickness of each kind of pen', () => {
    useUi.getState().set({ penWidth: 3.5 });
    useUi.getState().set({ penBrush: 'brush' });
    expect(useUi.getState().penWidth).toBe(6); // the brush's starting thickness
    useUi.getState().set({ penWidth: 10 });
    useUi.getState().set({ penBrush: 'pen' });
    expect(useUi.getState().penWidth).toBe(3.5);
    useUi.getState().set({ penBrush: 'brush' });
    expect(useUi.getState().penWidth).toBe(10);
  });
});

describe('ink opacity', () => {
  it('multiplies the picked opacity with the marker and pencil see-through', () => {
    expect(inkOpacity({ tool: 'pen' })).toBe(1);
    expect(inkOpacity({ tool: 'pen', opacity: 0.5 })).toBe(0.5);
    expect(inkOpacity({ tool: 'pen', brush: 'pencil', opacity: 0.5 })).toBeCloseTo(PENCIL_OPACITY * 0.5);
    expect(inkOpacity({ tool: 'marker', opacity: 0.5 })).toBeCloseTo(MARKER_OPACITY * 0.5);
  });

  it('leaves the opacity out of fully opaque strokes', () => {
    useUi.getState().set({ penOpacity: 1, markerOpacity: 0.4 });
    expect(inkStyle('pen')).not.toHaveProperty('opacity');
    expect(inkStyle('marker')).toMatchObject({ tool: 'marker', opacity: 0.4 });
  });
});
