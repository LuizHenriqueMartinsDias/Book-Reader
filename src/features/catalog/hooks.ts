import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../../db/schema';

/** Catalog entries already on the shelf, mapped to their book ids. */
export function useOnShelf(): Map<string, string> {
  const books = useLiveQuery(() => db.books.filter((b) => !!b.catalogKey).toArray(), []);
  return new Map((books ?? []).map((b) => [b.catalogKey!, b.id]));
}

const positions = new Map<string, number>();

/** Each screen opens at the top, or where it was left when going back to it. */
export function useScrollMemory(id: string) {
  useLayoutEffect(() => {
    window.scrollTo(0, positions.get(id) ?? 0);
    const onScroll = () => positions.set(id, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [id]);
}

/** Becomes true once the element comes near the viewport (and stays true). */
export function useNearViewport<T extends Element>(margin = '400px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
}

/** Calls `onReach` whenever the element scrolls into view, for loading more results. */
export function useOnReach<T extends Element>(onReach: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const callback = useRef(onReach);
  callback.current = onReach;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && callback.current(), { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);
  return ref;
}
