import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from '../lib/color';

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Fraction across (and down) an element from a pointer event. */
function fraction(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
}

/**
 * Any color: saturation and brightness in a square, hue in a bar, or its code typed in.
 * `onChange` follows every move; `onCommit` comes when a pick is done (finger lifted, code
 * entered), to remember the color.
 */
export default function ColorPicker({ value, onChange, onCommit }: { value: string; onChange: (hex: string) => void; onCommit: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [code, setCode] = useState(value);
  const last = useRef(value);

  // A color picked elsewhere (a swatch) moves the picker, keeping the hue of grays.
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const next = hexToHsv(value);
    setHsv((h) => (next.s === 0 || next.v === 0 ? { ...next, h: h.h } : next));
    setCode(value);
  }, [value]);

  // The latest color even before React re-renders (a pointerup can follow the last move at once).
  const current = useRef(hsv);
  current.current = hsv;

  const apply = (next: Hsv) => {
    const hex = hsvToHex(next);
    current.current = next;
    setHsv(next);
    setCode(hex);
    last.current = hex;
    onChange(hex);
  };
  const commit = () => onCommit(hsvToHex(current.current));

  const drag = (move: (e: PointerEvent<HTMLElement>) => void) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => e.currentTarget.hasPointerCapture(e.pointerId) && move(e),
    onPointerUp: commit,
  });
  const keys = (step: (key: string) => Hsv | null) => (e: KeyboardEvent) => {
    const next = step(e.key);
    if (!next) return;
    e.preventDefault();
    apply(next);
  };
  const hueColor = `hsl(${hsv.h} 100% 50%)`;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Saturação e brilho"
        aria-valuetext={`saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
        className="relative h-36 cursor-crosshair touch-none rounded-lg outline-offset-2"
        style={{ backgroundColor: hueColor, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}
        {...drag((e) => {
          const { x, y } = fraction(e);
          apply({ ...hsv, s: x, v: 1 - y });
        })}
        onKeyDown={keys((k) => {
          const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[k];
          return d ? { ...hsv, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) } : null;
        })}
        onKeyUp={commit}
      >
        <span
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
        />
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Matiz"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className="relative h-5 cursor-pointer touch-none rounded-full outline-offset-2"
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        {...drag((e) => apply({ ...hsv, h: fraction(e).x * 360 }))}
        onKeyDown={keys((k) => (k === 'ArrowLeft' ? { ...hsv, h: Math.max(0, hsv.h - 5) } : k === 'ArrowRight' ? { ...hsv, h: Math.min(360, hsv.h + 5) } : null))}
        onKeyUp={commit}
      >
        <span
          className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <span className="size-9 shrink-0 rounded-lg ring-1 ring-black/15" style={{ background: hsvToHex(hsv) }} />
        <span className="text-[var(--muted)]">Código</span>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) {
              const next = hexToHsv(hex);
              setHsv(next);
              last.current = hex;
              onChange(hex);
            }
          }}
          onBlur={() => {
            const hex = normalizeHex(code);
            setCode(hex ?? hsvToHex(hsv));
            if (hex) onCommit(hex);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          spellCheck={false}
          maxLength={7}
          aria-label="Código da cor (hexadecimal)"
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 font-mono text-sm uppercase outline-none focus:border-amber-500"
        />
      </label>
    </div>
  );
}
