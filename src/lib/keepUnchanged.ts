/** Whether two versions of an item are the same (a database copy of the one on screen). */
export function sameItem<T extends object>(a: T, b: T) {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = (a as unknown as Record<string, unknown>)[key];
    const y = (b as unknown as Record<string, unknown>)[key];
    if (x === y) continue;
    if (key === 'points') {
      const p = x as number[][];
      const q = y as number[][];
      if (!Array.isArray(q) || p.length !== q.length) return false;
      for (let i = 0; i < p.length; i++) if (p[i][0] !== q[i][0] || p[i][1] !== q[i][1] || p[i][2] !== q[i][2]) return false;
    } else if (typeof x !== 'object' || x === null || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

/**
 * Items read from the database (notebook items, a book page's strokes), with the objects already
 * on screen kept for those that didn't change. Every read makes new copies of all of them; keeping
 * the old ones keeps what's worked out per object (a stroke's outline, its box) and lets the page
 * redraw only what changed.
 */
export function keepUnchanged<T extends { id: string }>(known: Map<string, T>, read: T[]): T[] {
  return read.map((item) => {
    const old = known.get(item.id);
    return old && sameItem(old, item) ? old : item;
  });
}
