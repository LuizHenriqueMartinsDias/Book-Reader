import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CSS_UNITS } from '../../../lib/pdf';
import { useUi } from '../../../store/ui';
import CurlBook, { type BookHandle } from '../paged/CurlBook';
import SlideStrip from '../paged/SlideStrip';
import { buildSpreads, firstPageOf, resolveDouble, spreadIndexOf } from '../paged/spreads';
import type { TurnDir } from '../paged/useTurnGesture';
import { zoomedTurn } from '../paged/zoomedTurns';
import { useReader } from '../readerStore';
import { MAX_ZOOM, type ViewProps } from './types';
import { useZoomGestures } from './useZoomGestures';

const PADDING = 20;
const WHEEL_THRESHOLD = 60;
const WHEEL_LOCK_MS = 450;
/** Above this many times the fit size, pages turn without animation. */
const ANIMATE_MAX_ZOOM = 1.6;

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
  // Here `zoom` is a multiple of the fit size (see Reader), so turning the tablet keeps its meaning.
  const scale = zoom === null ? fitScale : Math.min(fitScale * zoom, MAX_ZOOM * CSS_UNITS);
  const zoomed = scale > fitScale * 1.01;
  const geo = useMemo(() => ({ double, slotW: ref.width * scale, slotH: ref.height * scale, scale }), [double, ref, scale]);

  // Zoomed far in, only part of a huge page shows: curling it is slow and hard to follow, so
  // turn instantly. Moderate zoom keeps the animation.
  const animate = viewMode !== 'instant' && !prefersReducedMotion() && scale <= fitScale * ANIMATE_MAX_ZOOM;
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
    useReader.setState({ scale, fitScale, goToPage, next: turn('next'), prev: turn('prev') });
  }, [scale, fitScale, goToPage]);

  useEffect(() => {
    const first = spreads[index] ? firstPageOf(spreads[index]) : 1;
    if (first !== useReader.getState().currentPage) useReader.setState({ currentPage: first });
  }, [spreads, index]);

  useZoomGestures(stageRef, onZoom);

  // Zoomed in, fingers pan the page; reaching an edge and swiping on, or tapping the screen's
  // edges, turns it. The new page opens at its top.
  /** Where the page that's coming should open, once the turn (maybe animated) lands. */
  const openAt = useRef<'top' | 'bottom' | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !zoomed) return;
    let start: { x: number; y: number; t: number; atLeft: boolean; atRight: boolean } | null = null;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        start = null; // pinching
        return;
      }
      const max = el.scrollWidth - el.clientWidth;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp, atLeft: el.scrollLeft <= 2, atRight: el.scrollLeft >= max - 2 };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length) return;
      const t = e.changedTouches[0];
      const r = el.getBoundingClientRect();
      const dir = zoomedTurn({
        dx: t.clientX - start.x,
        dy: t.clientY - start.y,
        ms: e.timeStamp - start.t,
        startFraction: (start.x - r.left) / r.width,
        atLeft: start.atLeft,
        atRight: start.atRight,
      });
      start = null;
      const { tool, penDetected } = useUi.getState();
      // Fingers navigate under the select tool, or whenever a stylus does the writing.
      if (!dir || (tool !== 'select' && !penDetected) || !getSelection()?.isCollapsed) return;
      openAt.current = 'top';
      bookRef.current?.turn(dir);
    };
    // A sideways swipe with the page already at that edge is ours (it turns the page): keep the
    // browser from treating it as overscroll, which on Chrome means "go back".
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (Math.abs(dx) > Math.abs(dy) && ((dx > 0 && start.atLeft) || (dx < 0 && start.atRight))) e.preventDefault();
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [zoomed]);

  useEffect(() => {
    const el = stageRef.current;
    if (!openAt.current || !el) return;
    el.scrollTo({ left: 0, top: openAt.current === 'top' ? 0 : el.scrollHeight });
    openAt.current = null;
  }, [index]);

  // A wheel or two-finger trackpad swipe turns the page when nothing needs scrolling; zoomed in,
  // it scrolls, and keeps going onto the next/previous page past the bottom/top.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (zoomed) {
      let acc = 0;
      let lockedUntil = 0;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) return;
        // Right after a turn, the rest of the wheel flick mustn't scroll the new page away from its top.
        if (e.timeStamp < lockedUntil) {
          e.preventDefault();
          return;
        }
        const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
        const atTop = el.scrollTop <= 0;
        if ((e.deltaY > 0 && atBottom) || (e.deltaY < 0 && atTop)) acc += e.deltaY;
        else acc = 0;
        if (Math.abs(acc) < WHEEL_THRESHOLD * 3) return;
        const dir = acc > 0 ? 'next' : 'prev';
        acc = 0;
        lockedUntil = e.timeStamp + WHEEL_LOCK_MS;
        // Continue where reading continues: the top of the next page, the bottom of the previous.
        openAt.current = dir === 'next' ? 'top' : 'bottom';
        bookRef.current?.turn(dir);
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
    }
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
      data-turn-surface
      // overscroll-contain: a swipe past the edge must turn the page, not trigger the browser's "back" gesture.
      className={`flex min-w-0 flex-1 overscroll-contain ${zoomed ? 'overflow-auto' : 'overflow-hidden'}`}
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
