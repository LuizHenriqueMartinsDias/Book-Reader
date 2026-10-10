import type { CoverPattern } from '../../db/schema';

export const COVER_PATTERNS: { id: CoverPattern; label: string }[] = [
  { id: 'plain', label: 'Liso' },
  { id: 'stripes', label: 'Listras' },
  { id: 'grid', label: 'Quadriculado' },
  { id: 'dots', label: 'Bolinhas' },
  { id: 'linen', label: 'Tecido' },
  { id: 'chevron', label: 'Zigue-zague' },
  { id: 'leather', label: 'Couro' },
  { id: 'kraft', label: 'Kraft' },
];

const light = (a: number) => `rgb(255 255 255 / ${a})`;
const dark = (a: number) => `rgb(0 0 0 / ${a})`;
/** A soft light from the top-left, so every cover looks like a material and not a flat swatch. */
const SHEEN = `linear-gradient(135deg, ${light(0.12)}, transparent 45%, ${dark(0.14)})`;

/** CSS `background` of a cover: its pattern drawn in light and shade over its color. */
export function coverBackground(pattern: CoverPattern, color: string) {
  const layers: Record<CoverPattern, string[]> = {
    plain: [],
    stripes: [`repeating-linear-gradient(45deg, ${light(0.16)} 0 8px, transparent 8px 18px)`],
    grid: [`linear-gradient(${light(0.18)} 1px, transparent 1px) 0 0 / 12px 12px`, `linear-gradient(90deg, ${light(0.18)} 1px, transparent 1px) 0 0 / 12px 12px`],
    dots: [`radial-gradient(${light(0.26)} 2px, transparent 2.5px) 0 0 / 14px 14px`, `radial-gradient(${light(0.26)} 2px, transparent 2.5px) 7px 7px / 14px 14px`],
    linen: [`repeating-linear-gradient(0deg, ${light(0.08)} 0 1px, transparent 1px 3px)`, `repeating-linear-gradient(90deg, ${dark(0.09)} 0 1px, transparent 1px 3px)`],
    chevron: [
      `linear-gradient(135deg, ${light(0.15)} 25%, transparent 25%) -9px 0 / 18px 18px`,
      `linear-gradient(225deg, ${light(0.15)} 25%, transparent 25%) -9px 0 / 18px 18px`,
      `linear-gradient(315deg, ${light(0.15)} 25%, transparent 25%) 0 0 / 18px 18px`,
      `linear-gradient(45deg, ${light(0.15)} 25%, transparent 25%) 0 0 / 18px 18px`,
    ],
    leather: [
      `radial-gradient(ellipse at 30% 20%, ${light(0.14)}, transparent 60%)`,
      `radial-gradient(${dark(0.2)} 0.8px, transparent 1.2px) 0 0 / 4px 4px`,
      `radial-gradient(${light(0.07)} 0.8px, transparent 1.2px) 2px 1px / 5px 3px`,
    ],
    kraft: [
      `radial-gradient(${dark(0.18)} 0.7px, transparent 1px) 0 0 / 7px 9px`,
      `radial-gradient(${light(0.16)} 0.7px, transparent 1px) 3px 4px / 11px 7px`,
      `repeating-linear-gradient(100deg, ${dark(0.04)} 0 2px, transparent 2px 9px)`,
    ],
  };
  return [SHEEN, ...layers[pattern], color].join(', ');
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Where a cover picture shows after a drag of (dx, dy) px, on a cover `boxW`×`boxH` px that it
 * fills (CSS object-fit: cover). Positions work like object-position in percent: only the side
 * where the picture is larger than the cover can move, and dragging right shows more of its left.
 */
export function panCover([x, y]: [number, number], [dx, dy]: [number, number], imageAspect: number, [boxW, boxH]: [number, number]): [number, number] {
  const width = Math.max(boxW, boxH * imageAspect);
  const height = width / imageAspect;
  const overX = width - boxW;
  const overY = height - boxH;
  return [overX > 0.5 ? clamp(x - (dx / overX) * 100) : x, overY > 0.5 ? clamp(y - (dy / overY) * 100) : y];
}
