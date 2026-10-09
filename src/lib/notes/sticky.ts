import type { StickyItem } from '../../db/schema';
import type { Box } from './geometry';

/** Post-it paper colors: yellow, pink, blue, green, orange. */
export const STICKY_COLORS = ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0', '#fed7aa'];
/** A new post-it is a square this big, in points. */
export const STICKY_SIZE = 150;
/** The strip at its top to drag it by, with its buttons, in points. */
export const STICKY_HEADER = 22;
/** Size of a collapsed post-it's icon, in points. */
export const STICKY_ICON = 26;
/** A post-it stuck on a book page, in page points. */
export const BOOK_STICKY = { w: 140, h: 120, fontSize: 12 };
/** Ink on post-its is always dark: the papers are all light. */
export const STICKY_INK = '#1f2937';

export const isSticky = (i: { type: string }): i is StickyItem => i.type === 'sticky';

/** What a post-it covers on the page: all of it, or just its icon when collapsed. */
export const stickyBox = (s: StickyItem): Box => (s.collapsed ? { x: s.x, y: s.y, w: STICKY_ICON, h: STICKY_ICON } : { x: s.x, y: s.y, w: s.w, h: s.h });
