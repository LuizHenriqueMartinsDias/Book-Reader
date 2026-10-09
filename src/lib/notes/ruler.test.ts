import { describe, expect, it } from 'vitest';
import { displayAngle, edgeNear, fromRulerSpace, onRuler, projectOnEdge, snapAngle, toRulerSpace, type Ruler } from './ruler';

const flat: Ruler = { x: 500, y: 400, angle: 0, length: 800, width: 80 };
const tilted: Ruler = { ...flat, angle: 30 };

describe('ruler geometry', () => {
  it('round-trips between screen and ruler space', () => {
    const p: [number, number] = [612, 377];
    const back = fromRulerSpace(tilted, toRulerSpace(tilted, p));
    expect(back[0]).toBeCloseTo(612, 9);
    expect(back[1]).toBeCloseTo(377, 9);
  });

  it('knows what is on the ruler and which edge a stroke starts next to', () => {
    expect(onRuler(flat, [500, 400])).toBe(true);
    expect(onRuler(flat, [500, 445])).toBe(false);
    expect(edgeNear(flat, [300, 350], 24)).toBe(-1); // just above the top edge (y = 360)
    expect(edgeNear(flat, [300, 452], 24)).toBe(1); // just below the bottom edge (y = 440)
    expect(edgeNear(flat, [300, 365], 24)).toBe(-1); // on the ruler: the nearest edge
    expect(edgeNear(flat, [300, 430], 24)).toBe(1);
    expect(edgeNear(flat, [300, 300], 24)).toBeNull(); // too far
    expect(edgeNear(flat, [950, 350], 24)).toBeNull(); // past the end
  });

  it('projects strokes onto the edge, also when the ruler is rotated', () => {
    expect(projectOnEdge(flat, [123, 352], -1)).toEqual([123, 360]);
    const p = projectOnEdge(tilted, [700, 300], -1);
    const [, v] = toRulerSpace(tilted, p);
    expect(v).toBeCloseTo(-40, 9);
  });

  it('snaps to common angles and shows protractor degrees', () => {
    expect(snapAngle(44)).toBe(45);
    expect(snapAngle(-1)).toBe(0);
    expect(snapAngle(37)).toBe(37);
    expect(displayAngle(-30)).toBe(150);
    expect(displayAngle(210)).toBe(30);
  });
});
