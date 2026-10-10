import type { Theme } from '../../store/ui';

/** Card surface of each theme (`--panel` in index.css): the grid's squares sit on it. */
export const SURFACE: Record<Theme, string> = { light: '#ffffff', sepia: '#f6efe2', dark: '#1c1917' };
/** "Nothing done" squares: a step off the surface, like GitHub's empty days. */
export const EMPTY: Record<Theme, string> = { light: '#ebe8e5', sepia: '#e4d9c4', dark: '#2c2825' };
/** Amber of the overall grid (all habits together), the app's accent. */
export const OVERALL_COLOR = '#d97706';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** `k` of `a` over `b`. */
export const mix = (a: string, b: string, k: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v * k + y[i] * (1 - k)));
};

/** WCAG relative luminance. */
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The 4 shades of a habit's squares, little to a lot, from its own color: one hue, each step
 * further from the surface (darker on light paper, brighter on the dark theme).
 */
export function ramp(color: string, theme: Theme): [string, string, string, string] {
  const surface = SURFACE[theme];
  // A color too close to the surface (near-black on the dark theme, pale on paper) is moved off it first.
  if (theme === 'dark' && luminance(color) < 0.08) color = mix(color, '#ffffff', 0.55);
  if (theme !== 'dark' && luminance(color) > 0.6) color = mix(color, '#000000', 0.6);
  if (theme === 'dark') return [mix(color, surface, 0.35), mix(color, surface, 0.6), mix(color, surface, 0.88), mix(color, '#ffffff', 0.7)];
  return [mix(color, surface, 0.32), mix(color, surface, 0.58), mix(color, surface, 0.88), mix(color, '#000000', 0.72)];
}

/** Text or icon color on a fill of `color`: white, unless the fill is light (yellow, light blue). */
export const inkOn = (color: string) => (luminance(color) > 0.3 ? '#1c1917' : '#ffffff');
