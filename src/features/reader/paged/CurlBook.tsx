import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import type { PageSize, PDFDocumentProxy } from '../../../lib/pdf';
import { computeCurl, curlLeft, matrixCss, polygonCss, type Curl, type Vec } from './curl';
import PageSlot, { slotOf, slotX, type Slot, type SlotGeometry } from './PageSlot';
import { spreadPages, type Spread } from './spreads';
import { useTurnGesture, type ClientPoint, type TurnDir } from './useTurnGesture';

export interface BookHandle {
  turn: (dir: TurnDir) => void;
}

interface Props {
  doc: PDFDocumentProxy;
  sizes: PageSize[];
  spreads: Spread[];
  index: number;
  geo: SlotGeometry;
  /** False for the instant mode (and reduced motion): turns complete immediately. */
  animate: boolean;
  dragEnabled: boolean;
  onTurned: (index: number) => void;
}

interface Turn {
  dir: TurnDir;
  /** Which kind of leaf: spine on its left (`right`, computeCurl) or on its right (`left`, curlLeft). */
  kind: Slot;
  leafSlot: Slot;
  leaf: number;
  back: number | 'paper';
  under?: number;
  /** Corner y (top or bottom edge), start and end of the dragged point in leaf space. */
  cy: number;
  from: Vec;
  to: Vec;
  point: Vec;
  /** Pointer position (leaf space) and point when a drag began. */
  grab?: { pointer: Vec; point: Vec };
}

const AUTO_MS = 700;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Book view whose pages curl over like paper when turned. */
const CurlBook = forwardRef<BookHandle, Props>(function CurlBook(
  { doc, sizes, spreads, index, geo, animate, dragEnabled, onTurned },
  ref,
) {
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  /** Instant mode: direction of a swipe in progress, committed on release. */
  const swipeDir = useRef<TurnDir | null>(null);
  const frame = useRef(0);
  const bookRef = useRef<HTMLDivElement>(null);
  const W = geo.slotW;
  const H = geo.slotH;

  const update = (t: Turn | null) => {
    turnRef.current = t;
    setTurn(t);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A layout change mid-turn invalidates the geometry; drop the turn.
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    update(null);
  }, [index, geo.double, W, H]);

  const plan = useCallback(
    (dir: TurnDir, cy: number): Turn | null => {
      const cur = spreads[index];
      const target = spreads[index + (dir === 'next' ? 1 : -1)];
      if (!cur || !target) return null;
      const base = { dir, cy };
      if (dir === 'next') {
        const leaf = cur.right;
        if (leaf === undefined) return null;
        const from: Vec = [W, cy];
        return {
          ...base,
          kind: 'right',
          leafSlot: 'right',
          leaf,
          back: geo.double ? (target.left ?? 'paper') : 'paper',
          under: target.right,
          from,
          to: [-W, cy],
          point: from,
        };
      }
      if (geo.double) {
        const leaf = cur.left;
        if (leaf === undefined) return null;
        const from: Vec = [0, cy];
        return { ...base, kind: 'left', leafSlot: 'left', leaf, back: target.right ?? 'paper', under: target.left, from, to: [2 * W, cy], point: from };
      }
      // Single page backwards: the previous page un-turns back onto the current one.
      const from: Vec = [-W, cy];
      return { ...base, kind: 'right', leafSlot: 'right', leaf: target.right!, back: 'paper', under: cur.right, from, to: [W, cy], point: from };
    },
    [spreads, index, geo.double, W],
  );

  const run = useCallback(
    (target: Vec, duration: number, lift: number, done: () => void) => {
      cancelAnimationFrame(frame.current);
      const t0 = performance.now();
      const startTurn = turnRef.current!;
      const p0 = startTurn.point;
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const e = ease(t);
        const lifted = (startTurn.cy === 0 ? 1 : -1) * Math.sin(Math.PI * t) * lift;
        update({ ...turnRef.current!, point: [p0[0] + (target[0] - p0[0]) * e, p0[1] + (target[1] - p0[1]) * e + lifted] });
        if (t < 1) frame.current = requestAnimationFrame(step);
        else done();
      };
      frame.current = requestAnimationFrame(step);
    },
    [],
  );

  const complete = useCallback(
    (t: Turn) => {
      const remaining = Math.abs((t.to[0] - t.point[0]) / (t.to[0] - t.from[0]));
      run(t.to, Math.max(180, AUTO_MS * remaining), H * 0.12 * remaining, () => {
        update(null);
        onTurned(index + (t.dir === 'next' ? 1 : -1));
      });
    },
    [run, H, index, onTurned],
  );

  const turnPage = useCallback(
    (dir: TurnDir) => {
      if (turnRef.current) return;
      const t = plan(dir, H);
      if (!t) return;
      if (!animate) return onTurned(index + (dir === 'next' ? 1 : -1));
      update(t);
      complete(t);
    },
    [plan, H, animate, onTurned, index, complete],
  );

  useImperativeHandle(ref, () => ({ turn: turnPage }), [turnPage]);

  const toLeaf = (p: ClientPoint, slot: Slot): Vec => {
    const rect = bookRef.current!.getBoundingClientRect();
    return [p.x - rect.left - slotX(slot, geo), p.y - rect.top];
  };

  useTurnGesture(
    {
      begin: (dir, start) => {
        if (!animate) {
          swipeDir.current = plan(dir, H) ? dir : null;
          return !!swipeDir.current;
        }
        if (turnRef.current) return false;
        const probe = plan(dir, H);
        if (!probe) return false;
        const pointer = toLeaf(start, probe.leafSlot);
        const t = plan(dir, pointer[1] < H / 2 ? 0 : H)!;
        update({ ...t, grab: { pointer, point: t.point } });
        return true;
      },
      move: (p) => {
        const t = turnRef.current;
        if (!t?.grab) return;
        const [x, y] = toLeaf(p, t.leafSlot);
        // Un-turning a single page needs to cover twice the page width.
        const k = !geo.double && t.dir === 'prev' ? 1.6 : 1;
        update({ ...t, point: [t.grab.point[0] + (x - t.grab.pointer[0]) * k, t.grab.point[1] + (y - t.grab.pointer[1])] });
      },
      end: (_p, vx) => {
        const t = turnRef.current;
        if (!animate) {
          if (swipeDir.current) turnPage(swipeDir.current);
          swipeDir.current = null;
          return;
        }
        if (!t) return;
        const sign = Math.sign(t.to[0] - t.from[0]);
        const progress = (t.point[0] - t.from[0]) / (t.to[0] - t.from[0]);
        if ((progress > 0.25 && vx * sign > -0.3) || vx * sign > 0.35) return complete({ ...t, grab: undefined });
        const back = Math.abs(progress);
        run(t.from, Math.max(150, 450 * back), 0, () => update(null));
      },
      tap: (dir) => {
        const t = turnRef.current;
        if (!animate) return turnPage(dir);
        if (t && t.dir === dir) complete({ ...t, grab: undefined });
        else if (!t) turnPage(dir);
      },
    },
    dragEnabled,
    bookRef,
  );

  const cur = spreads[index];
  const neighbours = [spreads[index - 1], cur, spreads[index + 1]].flatMap(spreadPages);
  const curl: Curl | null = turn
    ? turn.kind === 'right'
      ? computeCurl([W, turn.cy], turn.point, W, H)
      : curlLeft([0, turn.cy], turn.point, W, H)
    : null;

  const roleStyle = (page: number): { outer: CSSProperties; inner?: CSSProperties } => {
    const natural = { left: slotX(slotOf(page, geo.double), geo) };
    if (!turn || !curl) {
      return spreadPages(cur).includes(page) ? { outer: { ...natural, zIndex: 1 } } : { outer: { ...natural, visibility: 'hidden' } };
    }
    const leafLeft = slotX(turn.leafSlot, geo);
    if (page === turn.leaf) return { outer: { left: leafLeft, zIndex: 3 }, inner: { clipPath: polygonCss(curl.front) } };
    if (page === turn.under) return { outer: { left: leafLeft, zIndex: 2 }, inner: { clipPath: polygonCss(curl.exposed) } };
    if (page === turn.back) return backStyle(leafLeft, curl);
    if (spreadPages(cur).includes(page)) return { outer: { ...natural, zIndex: 1 } };
    return { outer: { ...natural, visibility: 'hidden' } };
  };

  return (
    <div
      ref={bookRef}
      data-reader-pages
      className="relative"
      style={{ width: (geo.double ? 2 : 1) * W, height: H, touchAction: dragEnabled ? 'none' : undefined }}
    >
      <div className="pointer-events-none absolute inset-0 shadow-xl" style={{ left: cur.left === undefined && geo.double ? W : 0, right: cur.right === undefined && geo.double ? W : 0 }} />
      {neighbours.map((page) => {
        const { outer, inner } = roleStyle(page);
        return <PageSlot key={page} doc={doc} page={page} size={sizes[page - 1]} geo={geo} outer={outer} inner={inner} interactive={!turn} />;
      })}
      {turn && curl && turn.back === 'paper' && (
        <div className="absolute top-0" style={{ width: W, height: H, ...backStyle(slotX(turn.leafSlot, geo), curl).outer }}>
          <div className="absolute inset-0" style={{ background: 'var(--paper)', transformOrigin: '0 0', ...backStyle(0, curl).inner }} />
        </div>
      )}
      {turn && curl && <Shading curl={curl} left={slotX(turn.leafSlot, geo)} w={W} h={H} />}
      {geo.double && cur.left !== undefined && cur.right !== undefined && <div className="pointer-events-none absolute inset-y-0 z-[6] w-12 -translate-x-1/2" style={{ left: W, background: 'linear-gradient(to right, transparent, rgb(0 0 0 / 0.07) 45%, rgb(0 0 0 / 0.12) 50%, rgb(0 0 0 / 0.07) 55%, transparent)' }} />}
      {dragEnabled && !turn && <HotZones />}
    </div>
  );
});

export default CurlBook;

function backStyle(left: number, curl: Curl): { outer: CSSProperties; inner: CSSProperties } {
  return {
    outer: { left, zIndex: 4, filter: 'drop-shadow(0 0 6px rgb(0 0 0 / 0.3))' },
    inner: { transform: matrixCss(curl.backMatrix), clipPath: polygonCss(curl.backClip) },
  };
}

/** Light and shadow along the fold: on the flap (back of the leaf) and cast onto the page below. */
function Shading({ curl, left, w, h }: { curl: Curl; left: number; w: number; h: number }) {
  const { origin: o, normal: n } = curl.fold;
  const lifted = Math.hypot(curl.point[0] - o[0], curl.point[1] - o[1]); // fold-to-tip distance
  const cast = Math.min(w * 0.35, lifted * 0.8 + 8);
  const flapEnd: Vec = [o[0] - n[0] * lifted, o[1] - n[1] * lifted];
  const castEnd: Vec = [o[0] + n[0] * cast, o[1] + n[1] * cast];
  const id = 'curl';
  return (
    <svg className="pointer-events-none absolute top-0 z-[5] overflow-visible" style={{ left }} width={w} height={h}>
      <defs>
        <linearGradient id={`${id}-cast`} gradientUnits="userSpaceOnUse" x1={o[0]} y1={o[1]} x2={castEnd[0]} y2={castEnd[1]}>
          <stop offset="0" stopColor="#000" stopOpacity="0.38" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-flap`} gradientUnits="userSpaceOnUse" x1={o[0]} y1={o[1]} x2={flapEnd[0]} y2={flapEnd[1]}>
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {curl.exposed.length > 0 && <polygon points={curl.exposed.map((v) => v.join(',')).join(' ')} fill={`url(#${id}-cast)`} />}
      {curl.flap.length > 0 && <polygon points={curl.flap.map((v) => v.join(',')).join(' ')} fill={`url(#${id}-flap)`} />}
    </svg>
  );
}

/** Grab areas at the outer edges, so a mouse can pick up the page without selecting text. */
function HotZones() {
  const zone = 'absolute inset-y-0 z-30 w-[12%] cursor-pointer select-none transition-colors';
  return (
    <>
      <div className={`${zone} left-0 hover:bg-gradient-to-r hover:from-black/5`} />
      <div className={`${zone} right-0 hover:bg-gradient-to-l hover:from-black/5`} />
    </>
  );
}
