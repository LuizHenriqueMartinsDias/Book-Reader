import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { updateNotebook } from '../../../db/notes';
import type { Notebook, NotePage } from '../../../db/schema';
import { CSS_UNITS } from '../../../lib/pdf';
import { paperCss } from '../../../lib/notes/render';
import type { ZoomChange } from '../../reader/views/types';
import { useNoteEditor } from './editorStore';
import NoteSurface, { type View } from './NoteSurface';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

interface Props {
  notebook: Notebook;
  page: NotePage;
  /** Lets the toolbar zoom buttons drive this view. */
  registerZoom: (fn: (z: ZoomChange) => void) => void;
  onScale: (scale: number) => void;
}

/**
 * A boundless board: fingers (or space + drag, or the wheel) pan, pinch and Ctrl + wheel zoom
 * around the pointer; the view is remembered per notebook.
 */
export default function InfiniteCanvas({ notebook, page, registerZoom, onScale }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => {
    const c = notebook.camera;
    return c ? { x: c.x, y: c.y, zoom: c.zoom } : { x: -40, y: -40, zoom: CSS_UNITS };
  });
  const viewRef = useRef(view);
  viewRef.current = view;

  useLayoutEffect(() => {
    const el = hostRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => onScale(view.zoom), [view.zoom, onScale]);

  // Remember where the view was left.
  useEffect(() => {
    const t = setTimeout(() => updateNotebook(notebook.id, { camera: view }), 600);
    return () => clearTimeout(t);
  }, [notebook.id, view]);

  /** Zoom to `zoom`, keeping the world point under screen point (sx, sy) in place. */
  const zoomAt = useCallback((zoom: number, sx: number, sy: number) => {
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
      const wx = v.x + sx / v.zoom;
      const wy = v.y + sy / v.zoom;
      return { zoom: z, x: wx - sx / z, y: wy - sy / z };
    });
  }, []);

  useEffect(() => {
    registerZoom((z) => {
      const el = hostRef.current;
      if (!el) return;
      const current = viewRef.current.zoom / CSS_UNITS;
      const next = z === null ? 1 : typeof z === 'function' ? z(current) : z;
      zoomAt(next * CSS_UNITS, el.clientWidth / 2, el.clientHeight / 2);
    });
  }, [registerZoom, zoomAt]);

  useEffect(() => {
    useNoteEditor.getState().set({
      currentPageId: page.id,
      insertTarget: () => {
        const v = viewRef.current;
        const el = hostRef.current!;
        return { pageId: page.id, x: v.x + el.clientWidth / 2 / v.zoom, y: v.y + el.clientHeight / 2 / v.zoom, viewWidth: el.clientWidth / v.zoom };
      },
    });
  }, [page.id]);

  // Panning and zooming. Pointer events for one-finger/space/middle-button pans; touch
  // events for pinch (two fingers), which also pans by the midpoint.
  useEffect(() => {
    const el = hostRef.current!;
    let pan: { id: number; x: number; y: number } | null = null;
    let pinch: { dist: number; mid: [number, number]; zoom: number } | null = null;
    let space = false;

    const local = (x: number, y: number): [number, number] => {
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
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      pan = { ...pan, x: e.clientX, y: e.clientY };
      setView((v) => ({ ...v, x: v.x - dx / v.zoom, y: v.y - dy / v.zoom }));
    };
    const onUp = (e: PointerEvent) => {
      if (pan?.id === e.pointerId) pan = null;
    };
    const touchInfo = (t: TouchList) => {
      const a = local(t[0].clientX, t[0].clientY);
      const b = local(t[1].clientX, t[1].clientY);
      return { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number] };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pan = null;
        pinch = { ...touchInfo(e.touches), zoom: viewRef.current.zoom };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const now = touchInfo(e.touches);
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * (now.dist / pinch.dist)));
      setView((v) => {
        // Keep the world point that was under the previous midpoint under the new one.
        const wx = v.x + pinch!.mid[0] / v.zoom;
        const wy = v.y + pinch!.mid[1] / v.zoom;
        return { zoom, x: wx - now.mid[0] / zoom, y: wy - now.mid[1] / zoom };
      });
      pinch.mid = now.mid;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const [sx, sy] = local(e.clientX, e.clientY);
        zoomAt(viewRef.current.zoom * Math.exp(-e.deltaY * 0.01), sx, sy);
      } else {
        setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }));
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
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [zoomAt]);

  const spacing = { lined: 28, grid: 20, dotted: 20, blank: 20 }[notebook.paper.style] * view.zoom;
  const offset: [number, number] = [-((view.x * view.zoom) % spacing), -((view.y * view.zoom) % spacing)];

  return (
    <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden" style={{ touchAction: 'none', ...paperCss(notebook.paper, view.zoom, offset) }}>
      {size.w > 0 && <NoteSurface notebook={notebook} page={page} width={size.w} height={size.h} view={view} infinite />}
    </div>
  );
}
