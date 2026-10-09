import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { updateNotebook } from '../../../db/notes';
import type { Notebook, NotePage } from '../../../db/schema';
import { rotateVec, snapQuarter, type Vec } from '../../../lib/notes/geometry';
import { PAPER_SPACING, paperCss } from '../../../lib/notes/render';
import { appliedTurn, classify, initialTwoFinger, rotates, zooms, type TwoFingerState } from '../../../lib/notes/twoFinger';
import { CSS_UNITS } from '../../../lib/pdf';
import type { ZoomChange } from '../../reader/views/types';
import { useNoteEditor } from './editorStore';
import NoteSurface from './NoteSurface';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/** World point at the center of the screen, zoom (px per point) and rotation (degrees, clockwise). */
interface Camera {
  cx: number;
  cy: number;
  zoom: number;
  rotation: number;
}

interface Props {
  notebook: Notebook;
  page: NotePage;
  /** Lets the toolbar zoom buttons drive this view. */
  registerZoom: (fn: (z: ZoomChange) => void) => void;
  onScale: (scale: number) => void;
}

function initialCamera(notebook: Notebook): Camera {
  const c = notebook.camera;
  if (!c) return { cx: 300, cy: 300, zoom: CSS_UNITS, rotation: 0 };
  // Older saves stored the top-left point; the screen size then is unknown, the window's is close.
  if (!c.centered) return { cx: c.x + innerWidth / 2 / c.zoom, cy: c.y + innerHeight / 2 / c.zoom, zoom: c.zoom, rotation: 0 };
  return { cx: c.x, cy: c.y, zoom: c.zoom, rotation: c.rotation ?? 0 };
}

/**
 * A boundless board: fingers (or space + drag, or the wheel) pan; pinch and Ctrl + wheel zoom
 * around the pointer; turning two fingers rotates it. The view is remembered per notebook.
 */
export default function InfiniteCanvas({ notebook, page, registerZoom, onScale }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>(() => initialCamera(notebook));
  const camRef = useRef(cam);
  camRef.current = cam;

  useLayoutEffect(() => {
    const el = hostRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => onScale(cam.zoom), [cam.zoom, onScale]);

  useEffect(() => {
    const t = setTimeout(() => updateNotebook(notebook.id, { camera: { x: cam.cx, y: cam.cy, zoom: cam.zoom, rotation: cam.rotation, centered: true } }), 600);
    return () => clearTimeout(t);
  }, [notebook.id, cam]);

  useEffect(() => {
    useNoteEditor.getState().set({ canvasRotation: cam.rotation });
  }, [cam.rotation]);

  /** World point under a host-relative screen point, for a given camera. */
  const worldAt = useCallback((c: Camera, [sx, sy]: Vec): Vec => {
    const el = hostRef.current!;
    const [dx, dy] = rotateVec([sx - el.clientWidth / 2, sy - el.clientHeight / 2], -c.rotation);
    return [c.cx + dx / c.zoom, c.cy + dy / c.zoom];
  }, []);

  /** The camera that shows world point `w` at screen point `s` with this zoom and rotation. */
  const pinTo = useCallback((w: Vec, [sx, sy]: Vec, zoom: number, rotation: number): Camera => {
    const el = hostRef.current!;
    const [dx, dy] = rotateVec([sx - el.clientWidth / 2, sy - el.clientHeight / 2], -rotation);
    return { cx: w[0] - dx / zoom, cy: w[1] - dy / zoom, zoom, rotation };
  }, []);

  const zoomAt = useCallback(
    (zoom: number, s: Vec) =>
      setCam((c) => pinTo(worldAt(c, s), s, Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)), c.rotation)),
    [pinTo, worldAt],
  );

  useEffect(() => {
    registerZoom((z) => {
      const el = hostRef.current;
      if (!el) return;
      const current = camRef.current.zoom / CSS_UNITS;
      const next = z === null ? 1 : typeof z === 'function' ? z(current) : z;
      zoomAt(next * CSS_UNITS, [el.clientWidth / 2, el.clientHeight / 2]);
    });
  }, [registerZoom, zoomAt]);

  useEffect(() => {
    useNoteEditor.getState().set({
      currentPageId: page.id,
      insertTarget: () => {
        const c = camRef.current;
        return { pageId: page.id, x: c.cx, y: c.cy, viewWidth: hostRef.current!.clientWidth / c.zoom };
      },
      straightenCanvas: () => {
        const el = hostRef.current!;
        const mid: Vec = [el.clientWidth / 2, el.clientHeight / 2];
        setCam((c) => pinTo(worldAt(c, mid), mid, c.zoom, 0));
      },
    });
    return () => useNoteEditor.getState().set({ straightenCanvas: null, canvasRotation: 0 });
  }, [page.id, pinTo, worldAt]);

  // Pointer events pan with one finger / space / middle button; touch events handle the
  // two-finger pinch, which pans by the midpoint, zooms and (past a few degrees) turns.
  useEffect(() => {
    const el = hostRef.current!;
    let pan: { id: number; x: number; y: number } | null = null;
    let pinch: { dist: number; angle: number; mid: Vec; world: Vec; zoom: number; rotation: number; tf: TwoFingerState } | null = null;
    let space = false;

    const local = (x: number, y: number): Vec => {
      const r = el.getBoundingClientRect();
      return [x - r.left, y - r.top];
    };
    const onDown = (e: PointerEvent) => {
      const fingerPans = e.pointerType === 'touch' && !useNoteEditor.getState().fingerDraws;
      if (!(fingerPans || e.button === 1 || space)) return;
      // Space/middle-button drags pan instead of drawing.
      if (!fingerPans) e.stopPropagation();
      pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!pan || pan.id !== e.pointerId || pinch) return;
      const d: Vec = [e.clientX - pan.x, e.clientY - pan.y];
      pan = { ...pan, x: e.clientX, y: e.clientY };
      setCam((c) => {
        const [wx, wy] = rotateVec(d, -c.rotation);
        return { ...c, cx: c.cx - wx / c.zoom, cy: c.cy - wy / c.zoom };
      });
    };
    const onUp = (e: PointerEvent) => {
      if (pan?.id === e.pointerId) pan = null;
    };
    const touchInfo = (t: TouchList) => {
      const a = local(t[0].clientX, t[0].clientY);
      const b = local(t[1].clientX, t[1].clientY);
      return {
        dist: Math.hypot(a[0] - b[0], a[1] - b[1]),
        angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
        mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Vec,
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pan = null;
      const t = touchInfo(e.touches);
      const c = camRef.current;
      pinch = { ...t, world: worldAt(c, t.mid), zoom: c.zoom, rotation: c.rotation, tf: initialTwoFinger() };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const t = touchInfo(e.touches);
      const ratio = t.dist / pinch.dist;
      const delta = ((t.angle - pinch.angle + 540) % 360) - 180;
      pinch.tf = classify(pinch.tf, ratio, delta);
      // Panning by the midpoint always works; zoom and rotation join in as the gesture shows them.
      const zoom = zooms(pinch.tf) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * ratio)) : pinch.zoom;
      const rotation = rotates(pinch.tf) ? snapQuarter(pinch.rotation + appliedTurn(pinch.tf, delta)) : pinch.rotation;
      if (rotates(pinch.tf)) useNoteEditor.getState().set({ rotationHint: rotation });
      // Keep the world point that was under the fingers under them.
      setCam(pinTo(pinch.world, t.mid, zoom, rotation));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;
      if (pinch && rotates(pinch.tf)) useNoteEditor.getState().set({ rotationHint: null });
      pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(camRef.current.zoom * Math.exp(-e.deltaY * 0.01), local(e.clientX, e.clientY));
      } else {
        setCam((c) => {
          const [wx, wy] = rotateVec([e.deltaX, e.deltaY], -c.rotation);
          return { ...c, cx: c.cx + wx / c.zoom, cy: c.cy + wy / c.zoom };
        });
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.code === 'Space') {
        space = e.type === 'keydown';
        el.style.cursor = space ? 'grab' : '';
        if (space) e.preventDefault();
      }
    };

    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [zoomAt, pinTo, worldAt]);

  // The drawing surface is a square as wide as the screen's diagonal, turned around the screen
  // center, so the corners stay covered at any angle.
  const side = Math.ceil(Math.hypot(size.w, size.h)) + 2;
  const view = { x: cam.cx - side / 2 / cam.zoom, y: cam.cy - side / 2 / cam.zoom, zoom: cam.zoom };
  const spacing = (notebook.paper.style === 'lined' ? PAPER_SPACING.lined : PAPER_SPACING.grid) * cam.zoom;
  const offset: Vec = [-((view.x * cam.zoom) % spacing), -((view.y * cam.zoom) % spacing)];

  return (
    <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ touchAction: 'none', background: notebook.paper.color }}>
      {size.w > 0 && (
        <div
          className="absolute"
          style={{
            left: (size.w - side) / 2,
            top: (size.h - side) / 2,
            width: side,
            height: side,
            transform: cam.rotation ? `rotate(${cam.rotation}deg)` : undefined,
            ...paperCss(notebook.paper, cam.zoom, offset),
          }}
        >
          <NoteSurface notebook={notebook} page={page} width={side} height={side} view={view} rotation={cam.rotation} infinite />
        </div>
      )}
    </div>
  );
}
