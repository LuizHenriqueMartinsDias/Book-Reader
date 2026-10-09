import { RotateCw } from 'lucide-react';
import { useRef } from 'react';
import { displayAngle, snapAngle, type Ruler } from '../../../lib/notes/ruler';
import { useNoteEditor } from './editorStore';

/** Points per centimeter (1 pt = 1/72 inch). */
const PT_PER_CM = 72 / 2.54;

interface Props {
  ruler: Ruler;
  /** Screen px per page point, so the marks match the page's real centimeters. */
  scale: number;
}

type Drag =
  | { kind: 'move'; id: number; last: [number, number] }
  | { kind: 'rotate'; id: number; offset: number }
  | { kind: 'pinch'; ids: [number, number]; startAngle: number; rulerAngle: number; mid: [number, number] };

/** Re-sends a pen press on the ruler to the note page's input canvas under it. */
function passToPage(e: React.PointerEvent) {
  const input = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLCanvasElement && el.dataset.noteInput !== undefined);
  if (!input) return;
  e.stopPropagation();
  const n = e.nativeEvent;
  input.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: n.pointerId,
      pointerType: n.pointerType,
      isPrimary: n.isPrimary,
      clientX: n.clientX,
      clientY: n.clientY,
      screenX: n.screenX,
      screenY: n.screenY,
      pressure: n.pressure,
      tiltX: n.tiltX,
      tiltY: n.tiltY,
      width: n.width,
      height: n.height,
      button: n.button,
      buttons: n.buttons,
    }),
  );
}

/**
 * A see-through ruler over the page. Drag it with a finger or the mouse, turn it with two
 * fingers or the round handles; pen strokes next to its edges come out straight (NoteSurface).
 */
export default function RulerOverlay({ ruler, scale }: Props) {
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());

  const host = () => useNoteEditor.getState().rulerHost!.getBoundingClientRect();
  const update = (patch: Partial<Ruler>) => {
    const current = useNoteEditor.getState().ruler;
    if (current) useNoteEditor.getState().set({ ruler: { ...current, ...patch } });
  };
  const local = (e: React.PointerEvent): [number, number] => {
    const r = host();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const pairAngle = (a: [number, number], b: [number, number]) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // The pen writes, not moves the ruler: hand it to the page underneath, where the stroke
    // follows the nearest edge (see NoteSurface).
    if (e.pointerType === 'pen') return passToPage(e);
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.entries()];
      drag.current = {
        kind: 'pinch',
        ids: [a[0], b[0]],
        startAngle: pairAngle(a[1], b[1]),
        rulerAngle: ruler.angle,
        mid: [(a[1][0] + b[1][0]) / 2, (a[1][1] + b[1][1]) / 2],
      };
    } else drag.current = { kind: 'move', id: e.pointerId, last: p };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (d.kind === 'move' && d.id === e.pointerId) {
      update({ x: ruler.x + p[0] - d.last[0], y: ruler.y + p[1] - d.last[1] });
      d.last = p;
    } else if (d.kind === 'rotate' && d.id === e.pointerId) {
      update({ angle: snapAngle(pairAngle([ruler.x, ruler.y], p) + d.offset) });
    } else if (d.kind === 'pinch') {
      const a = pointers.current.get(d.ids[0]);
      const b = pointers.current.get(d.ids[1]);
      if (!a || !b) return;
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      update({
        angle: snapAngle(d.rulerAngle + pairAngle(a, b) - d.startAngle),
        x: ruler.x + mid[0] - d.mid[0],
        y: ruler.y + mid[1] - d.mid[1],
      });
      d.mid = mid;
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pinch') {
      // One finger left: keep moving with it.
      const rest = [...pointers.current.entries()][0];
      drag.current = rest ? { kind: 'move', id: rest[0], last: rest[1] } : null;
    } else if (d.id === e.pointerId) drag.current = null;
  };

  const startRotate = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'pen') return passToPage(e);
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    // Keep the angle between the pointer and the ruler, so grabbing either end doesn't flip it.
    drag.current = { kind: 'rotate', id: e.pointerId, offset: ruler.angle - pairAngle([ruler.x, ruler.y], p) };
  };

  // Centimeter marks (millimeters when there's room), from the left end.
  const pxPerCm = PT_PER_CM * scale;
  const step = pxPerCm / 10 >= 4 ? 0.1 : pxPerCm / 2 >= 6 ? 0.5 : 1;
  const ticks: { x: number; h: number; label?: number }[] = [];
  for (let cm = 0, i = 0; cm * pxPerCm <= ruler.length - 8; i++, cm = +(i * step).toFixed(2)) {
    const whole = Math.abs(cm - Math.round(cm)) < 1e-6;
    const half = Math.abs(cm * 2 - Math.round(cm * 2)) < 1e-6;
    ticks.push({ x: 8 + cm * pxPerCm, h: whole ? 18 : half ? 12 : 7, label: whole ? Math.round(cm) : undefined });
  }

  return (
    <div
      className="pointer-events-auto absolute z-20 touch-none select-none"
      style={{
        left: ruler.x - ruler.length / 2,
        top: ruler.y - ruler.width / 2,
        width: ruler.length,
        height: ruler.width,
        transform: `rotate(${ruler.angle}deg)`,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="absolute inset-0 rounded-md border border-stone-500/50 bg-stone-200/55 shadow-lg backdrop-blur-[1px] dark:bg-stone-700/55" />
      <svg className="absolute inset-0 overflow-visible" width={ruler.length} height={ruler.width}>
        {ticks.map((t, i) => (
          <g key={i} className="text-stone-700 dark:text-stone-200">
            <line x1={t.x} x2={t.x} y1={0} y2={t.h} stroke="currentColor" strokeWidth={t.label !== undefined ? 1.2 : 0.8} />
            <line x1={t.x} x2={t.x} y1={ruler.width} y2={ruler.width - t.h} stroke="currentColor" strokeWidth={t.label !== undefined ? 1.2 : 0.8} />
            {t.label !== undefined && t.label > 0 && (
              <text x={t.x} y={30} fontSize={11} textAnchor="middle" fill="currentColor">
                {t.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-900/75 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
        {displayAngle(ruler.angle)}°
      </div>
      {[0, 1].map((end) => (
        <div
          key={end}
          title="Girar"
          className="absolute top-1/2 flex size-7 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-stone-900/70 text-white"
          style={end ? { right: 6 } : { left: 6 }}
          onPointerDown={startRotate}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <RotateCw className="size-3.5" />
        </div>
      ))}
    </div>
  );
}
