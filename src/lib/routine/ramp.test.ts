import { describe, expect, it } from 'vitest';
import { EMPTY, luminance, OVERALL_COLOR, ramp, SURFACE } from './ramp';

const COLORS = [OVERALL_COLOR, '#2563eb', '#16a34a', '#9333ea', '#ea580c', '#db2777', '#0d9488', '#ca8a04', '#4f46e5', '#dc2626', '#1c1917', '#fde047', '#ffffff'];

describe('habit color ramps', () => {
  for (const theme of ['light', 'sepia', 'dark'] as const) {
    it(`step steadily away from the surface (${theme})`, () => {
      for (const color of COLORS) {
        const steps = [EMPTY[theme], ...ramp(color, theme)].map(luminance);
        const away = theme === 'dark' ? steps : steps.map((l) => -l);
        // Each shade further from the surface than the one before: more done never looks lighter.
        for (let i = 1; i < away.length; i++) expect(away[i], `${color} step ${i}`).toBeGreaterThan(away[i - 1]);
        expect(Math.abs(luminance(SURFACE[theme]) - steps[0])).toBeGreaterThan(0.01);
      }
    });
  }
});
