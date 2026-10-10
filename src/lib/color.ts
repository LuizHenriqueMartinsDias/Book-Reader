/** Colors as `#rrggbb` (what strokes store and the PDF export reads) and as hue/saturation/value for the picker. */

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

/** `#abc`, `abc`, `#AABBCC`… as `#aabbcc`; null when it isn't a color. */
export function normalizeHex(input: string): string | null {
  const m = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(m)) return `#${[...m].map((c) => c + c).join('')}`;
  return /^[0-9a-f]{6}$/.test(m) ? `#${m}` : null;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt((normalizeHex(hex) ?? '#000000').slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}
