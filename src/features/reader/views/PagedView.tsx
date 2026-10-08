import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CSS_UNITS } from '../../../lib/pdf';
import { useUi } from '../../../store/ui';
import CurlBook, { type BookHandle } from '../paged/CurlBook';
import SlideStrip from '../paged/SlideStrip';
import { buildSpreads, firstPageOf, resolveDouble, spreadIndexOf } from '../paged/spreads';
import type { TurnDir } from '../paged/useTurnGesture';
import { useReader } from '../readerStore';
import { MAX_ZOOM, type ViewProps } from './types';
import { useZoomGestures } from './useZoomGestures';

const PADDING = 20;
const WHEEL_THRESHOLD = 60;
const WHEEL_LOCK_MS = 450;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** One spread at a time, turned as a book (curl), a carousel (slide) or instantly. */
export default function PagedView({ doc, sizes, zoom, onZoom }: ViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<BookHandle>(null);
  const viewMode = useUi((s) => s.viewMode);
  const spreadLayout = useUi((s) => s.spreadLayout);
  const tool = useUi((s) => s.tool);
  const penDetected = useUi((s) => s.penDetected);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [page, setPage] = useState(() => useReader.getState().currentPage);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slots are sized for the largest page so the book keeps one shape while turning.
  const ref = useMemo(
    () => ({ width: Math.max(...sizes.map((s) => s.width)), height: Math.max(...sizes.map((s) => s.height)) }),
    [sizes],
  );
  const availW = Math.max(1, stage.w - 2 * PADDING);
  const availH = Math.max(1, stage.h - 2 * PADDING);
  const double = resolveDouble(spreadLayout, availW, availH, ref);
  const spreads = useMemo(() => buildSpreads(sizes.length, double), [sizes.length, double]);
  const index = Math.min(spreads.length - 1, Math.max(0, spreadIndexOf(page, double)));

  const fitScale = Math.min(availW / ((double ? 2 : 1) * ref.width), availH / ref.height);
  const scale = zoom === null ? fitScale : Math.min(zoom * CSS_UNITS, MAX_ZOOM * CSS_UNITS);
  const zoomed = scale > fitScale * 1.01;
  const geo = useMemo(() => ({ double, slotW: ref.width * scale, slotH: ref.height * scale, scale }), [double, ref, scale]);

  const animate = viewMode !== 'instant' && !prefersReducedMotion();
  // Dragging pages around would fight with panning a zoomed-in page.
  const dragEnabled = !zoomed && (tool === 'select' || penDetected);

  const onTurned = useCallback((i: number) => setPage(firstPageOf(spreads[i])), [spreads]);

  const goToPage = useCallback(
    (target: number) => {
      const p = Math.min(Math.max(1, Math.round(target)), sizes.length);
      const i = spreadIndexOf(p, double);
      if (i === index + 1) bookRef.current?.turn('next');
      else if (i === index - 1) bookRef.current?.turn('prev');
      else if (i !== index) setPage(p);
    },
    [sizes.length, double, index],
  );

  useEffect(() => {
    const turn = (dir: TurnDir) => () => bookRef.current?.turn(dir);
    useReader.setState({ scale, goToPage, next: turn('next'), prev: turn('prev') });
  }, [scale, goToPage]);

  useEffect(() => {
    const first = spreads[index] ? firstPageOf(spreads[index]) : 1;
    if (first !== useReader.getState().currentPage) useReader.setState({ currentPage: first });
  }, [spreads, index]);

  useZoomGestures(stageRef, onZoom);

  // A wheel or two-finger trackpad swipe turns the page when nothing needs scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || zoomed) return;
    let acc = 0;
    let lockedUntil = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.timeStamp < lockedUntil) return;
      acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(acc) < WHEEL_THRESHOLD) return;
      bookRef.current?.turn(acc > 0 ? 'next' : 'prev');
      acc = 0;
      lockedUntil = e.timeStamp + WHEEL_LOCK_MS;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomed]);

  // With reduced motion every mode degrades to the instant one (CurlBook without animation).
  const Book = viewMode === 'slide' && animate ? SlideStrip : CurlBook;

  return (
    <div
      ref={stageRef}
      className={`flex min-w-0 flex-1 ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}
      style={{ touchAction: zoomed ? 'pan-x pan-y' : 'none' }}
    >
      {stage.w > 0 && (
        <div className="m-auto shrink-0" style={{ padding: PADDING }}>
          <Book
            ref={bookRef}
            doc={doc}
            sizes={sizes}
            spreads={spreads}
            index={index}
            geo={geo}
            animate={animate}
            dragEnabled={dragEnabled}
            onTurned={onTurned}
          />
        </div>
      )}
    </div>
  );
}
