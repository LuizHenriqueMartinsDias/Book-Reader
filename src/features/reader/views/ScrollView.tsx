import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CSS_UNITS } from '../../../lib/pdf';
import PageView from '../PageView';
import { useReader } from '../readerStore';
import { MAX_ZOOM, type ViewProps } from './types';
import { useZoomGestures } from './useZoomGestures';

const GAP = 16;
const PADDING = 16;

/** Continuous vertical scrolling; only pages near the viewport render their content. */
export default function ScrollView({ doc, sizes, zoom, onZoom }: ViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 });

  const maxWidth = useMemo(() => Math.max(...sizes.map((s) => s.width)), [sizes]);
  const fitScale = Math.max(0.1, (viewport.width - 2 * PADDING) / maxWidth);
  const scale = zoom === null ? Math.min(fitScale, MAX_ZOOM * CSS_UNITS) : zoom * CSS_UNITS;

  const offsets = useMemo(() => {
    const out = [PADDING];
    for (const s of sizes) out.push(out[out.length - 1] + s.height * scale + GAP);
    return out;
  }, [sizes, scale]);

  const pageAt = useCallback(
    (y: number) => {
      let lo = 0;
      let hi = sizes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= y) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    },
    [offsets, sizes.length],
  );

  // Pages within one screen above/below render; everything else is a placeholder.
  const firstActive = pageAt(viewport.top - viewport.height);
  const lastActive = pageAt(viewport.top + viewport.height * 2);

  const goToPage = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const p = Math.min(Math.max(1, Math.round(page)), sizes.length);
      el.scrollTop = offsets[p - 1] - PADDING;
    },
    [offsets, sizes.length],
  );

  useEffect(() => {
    useReader.setState({
      scale,
      goToPage,
      next: () => goToPage(useReader.getState().currentPage + 1),
      prev: () => goToPage(useReader.getState().currentPage - 1),
    });
  }, [goToPage, scale]);

  // Open where the reader left off (last-read page, or the page shown in another view mode).
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !scrollRef.current) return;
    restored.current = true;
    goToPage(useReader.getState().currentPage);
  }, [goToPage]);

  // Keep the same spot of the same page in view across zoom changes.
  const anchor = useRef<{ page: number; fraction: number } | null>(null);
  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevScale.current === scale) return;
    prevScale.current = scale;
    if (anchor.current) {
      const { page, fraction } = anchor.current;
      el.scrollTop = offsets[page - 1] + fraction * sizes[page - 1].height * scale - PADDING;
    }
  }, [scale, offsets, sizes]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewport({ top: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
    const page = pageAt(el.scrollTop + el.clientHeight * 0.3);
    const top = el.scrollTop + PADDING;
    const p = pageAt(top);
    anchor.current = { page: p, fraction: (top - offsets[p - 1]) / (sizes[p - 1].height * scale) };
    if (page !== useReader.getState().currentPage) useReader.setState({ currentPage: page });
  }, [pageAt, offsets, sizes, scale]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useZoomGestures(scrollRef, onZoom);

  return (
    <div
      ref={scrollRef}
      onScroll={measure}
      className="min-w-0 flex-1 overflow-auto overscroll-contain"
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <div style={{ height: offsets[sizes.length] + PADDING - GAP, minWidth: maxWidth * scale + 2 * PADDING }}>
        <div data-reader-pages className="flex flex-col" style={{ gap: GAP, padding: PADDING }}>
          {sizes.map((size, i) => (
            <PageView
              key={i}
              doc={doc}
              pageNumber={i + 1}
              size={size}
              scale={scale}
              active={i + 1 >= firstActive && i + 1 <= lastActive}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
