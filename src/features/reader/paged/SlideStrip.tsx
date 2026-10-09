import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PageSize, PDFDocumentProxy } from '../../../lib/pdf';
import type { BookHandle } from './CurlBook';
import PageSlot, { slotOf, slotX, type SlotGeometry } from './PageSlot';
import { spreadPages, type Spread } from './spreads';
import { useTurnGesture, type TurnDir } from './useTurnGesture';

interface Props {
  doc: PDFDocumentProxy;
  sizes: PageSize[];
  spreads: Spread[];
  index: number;
  geo: SlotGeometry;
  dragEnabled: boolean;
  onTurned: (index: number) => void;
}

const GAP = 24;
const SLIDE_MS = 280;

/** Carousel: neighbouring spreads sit side by side and slide in with the finger. */
const SlideStrip = forwardRef<BookHandle, Props>(function SlideStrip({ doc, sizes, spreads, index, geo, dragEnabled, onTurned }, ref) {
  const bookW = (geo.double ? 2 : 1) * geo.slotW;
  const step = bookW + GAP;
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  const busy = useRef(false);
  const timer = useRef(0);
  const grab = useRef<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = useCallback(
    (dir: TurnDir | null) => {
      busy.current = true;
      setSliding(true);
      setOffset(dir === 'next' ? -step : dir === 'prev' ? step : 0);
      timer.current = window.setTimeout(() => {
        // Swap the index and reset the offset in one render, without a transition.
        setSliding(false);
        setOffset(0);
        busy.current = false;
        if (dir) onTurned(index + (dir === 'next' ? 1 : -1));
      }, SLIDE_MS);
    },
    [step, index, onTurned],
  );

  const canTurn = (dir: TurnDir) => !!spreads[index + (dir === 'next' ? 1 : -1)];

  const turn = useCallback(
    (dir: TurnDir) => {
      if (!busy.current && spreads[index + (dir === 'next' ? 1 : -1)]) settle(dir);
    },
    [spreads, index, settle],
  );
  useImperativeHandle(ref, () => ({ turn }), [turn]);

  useTurnGesture(
    {
      begin: (_dir, start) => {
        if (busy.current) return false;
        grab.current = start.x;
        return true;
      },
      move: (p) => {
        if (grab.current === null) return;
        const dx = p.x - grab.current;
        // Resist past the first and last spreads.
        setOffset(canTurn(dx < 0 ? 'next' : 'prev') ? dx : dx / 4);
      },
      end: (p, vx) => {
        if (grab.current === null) return;
        const dx = p.x - grab.current;
        grab.current = null;
        const dir: TurnDir = dx < 0 ? 'next' : 'prev';
        const go = (Math.abs(dx) > bookW * 0.25 || Math.abs(vx) > 0.35) && Math.sign(vx || dx) === Math.sign(dx) && canTurn(dir);
        settle(go ? dir : null);
      },
      tap: (dir) => {
        grab.current = null;
        if (canTurn(dir)) turn(dir);
        else settle(null);
      },
    },
    dragEnabled,
    stripRef,
  );

  const moving = sliding || offset !== 0;
  const pages = [-1, 0, 1].flatMap((rel) => spreadPages(spreads[index + rel]).map((page) => ({ page, rel })));

  return (
    <div
      ref={stripRef}
      data-reader-pages
      className="relative"
      style={{ width: bookW, height: geo.slotH, touchAction: dragEnabled ? 'none' : undefined }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translateX(${offset}px)`, transition: sliding ? `transform ${SLIDE_MS}ms cubic-bezier(.2,.7,.3,1)` : 'none' }}
      >
        {pages.map(({ page, rel }) => (
          <PageSlot
            key={page}
            doc={doc}
            page={page}
            size={sizes[page - 1]}
            geo={geo}
            outer={{
              left: rel * step + slotX(slotOf(page, geo.double), geo),
              visibility: rel === 0 || moving ? 'visible' : 'hidden',
              boxShadow: '0 10px 25px -8px rgb(0 0 0 / 0.35)',
            }}
            interactive={!moving}
          />
        ))}
      </div>
      {dragEnabled && !moving && (
        <>
          <div className="absolute inset-y-0 left-0 z-30 w-[12%] cursor-pointer" />
          <div className="absolute inset-y-0 right-0 z-30 w-[12%] cursor-pointer" />
        </>
      )}
    </div>
  );
});

export default SlideStrip;
