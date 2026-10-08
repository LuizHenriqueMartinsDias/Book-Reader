import type { PageSize } from '../../../lib/pdf';
import type { SpreadLayout } from '../../../store/ui';

/** What's visible at once: one page, or a left/right pair like an open book. */
export interface Spread {
  left?: number;
  right?: number;
}

/**
 * Single: every page is its own spread (shown in the `right` slot, spine on its left).
 * Double: page 1 is the cover alone on the right, then [2,3], [4,5]… like a printed book.
 */
export function buildSpreads(pageCount: number, double: boolean): Spread[] {
  if (!double) return Array.from({ length: pageCount }, (_, i) => ({ right: i + 1 }));
  const spreads: Spread[] = [{ right: 1 }];
  for (let left = 2; left <= pageCount; left += 2) {
    spreads.push(left + 1 <= pageCount ? { left, right: left + 1 } : { left });
  }
  return spreads;
}

export function spreadIndexOf(page: number, double: boolean) {
  return double ? Math.floor(page / 2) : page - 1;
}

export const spreadPages = (s: Spread | undefined) => [s?.left, s?.right].filter((p): p is number => p !== undefined);

export const firstPageOf = (s: Spread) => s.left ?? s.right!;

/**
 * "Auto" shows two pages when the screen is wide enough that a pair fits at nearly the
 * same size as a single page would (i.e. landscape tablets and desktops, not phones).
 */
export function resolveDouble(layout: SpreadLayout, stageW: number, stageH: number, page: PageSize) {
  if (layout !== 'auto') return layout === 'double';
  const single = Math.min(stageW / page.width, stageH / page.height);
  const double = Math.min(stageW / (2 * page.width), stageH / page.height);
  return double >= 0.85 * single;
}
