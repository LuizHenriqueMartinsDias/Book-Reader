import type { NoteItem, Paper, ShapeItem, StrokeItem } from '../../db/schema';
import { MARKER_OPACITY, outlineToSvgPath, strokeOutline } from '../ink';

export const PAPER_COLORS = ['#ffffff', '#fdf6e3', '#f1f5f9', '#1f2937'];

/** Line spacing of ruled paper and cell size of grid/dotted paper, in points. */
export const PAPER_SPACING = { lined: 28, grid: 20, dotted: 20 } as const;

const isDark = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 110;
};
export const paperInk = (paper: Paper) => (isDark(paper.color) ? 'rgb(255 255 255 / 0.14)' : 'rgb(30 64 175 / 0.16)');
/** Default ink on this paper: dark on light pages, light on dark ones. */
export const defaultInk = (paper: Paper) => (isDark(paper.color) ? '#f5f5f4' : '#1f2937');

/** CSS background for a page at `scale` (screen px per point). `offset` shifts the pattern (infinite canvas). */
export function paperCss(paper: Paper, scale: number, offset: [number, number] = [0, 0]): React.CSSProperties {
  const line = paperInk(paper);
  const pos = `${offset[0]}px ${offset[1]}px`;
  switch (paper.style) {
    case 'lined': {
      const s = PAPER_SPACING.lined * scale;
      return {
        backgroundColor: paper.color,
        backgroundImage: `linear-gradient(to bottom, transparent ${s - 1}px, ${line} ${s - 1}px)`,
        backgroundSize: `100% ${s}px`,
        backgroundPosition: `0 ${offset[1] + 2 * s}px`,
      };
    }
    case 'grid': {
      const s = PAPER_SPACING.grid * scale;
      return {
        backgroundColor: paper.color,
        backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
        backgroundSize: `${s}px ${s}px`,
        backgroundPosition: pos,
      };
    }
    case 'dotted': {
      const s = PAPER_SPACING.dotted * scale;
      const r = Math.max(1, 1.2 * Math.min(scale, 1.5));
      return {
        backgroundColor: paper.color,
        backgroundImage: `radial-gradient(circle, ${line.replace(/0\.1[46]/, '0.45')} ${r}px, transparent ${r + 0.5}px)`,
        backgroundSize: `${s}px ${s}px`,
        backgroundPosition: pos,
      };
    }
    default:
      return { backgroundColor: paper.color };
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Pick<ShapeItem, 'shape' | 'x1' | 'y1' | 'x2' | 'y2' | 'color' | 'width'>) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (s.shape === 'rect') {
    ctx.rect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
  } else if (s.shape === 'ellipse') {
    ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, Math.abs(s.x2 - s.x1) / 2, Math.abs(s.y2 - s.y1) / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
  if (s.shape === 'arrow') {
    const head = arrowHead(s);
    ctx.beginPath();
    ctx.moveTo(head[0][0], head[0][1]);
    ctx.lineTo(s.x2, s.y2);
    ctx.lineTo(head[1][0], head[1][1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** The two barb ends of an arrow head at (x2, y2). */
export function arrowHead(s: Pick<ShapeItem, 'x1' | 'y1' | 'x2' | 'y2' | 'width'>): [[number, number], [number, number]] {
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const size = s.width * 3 + 8;
  const spread = Math.PI / 7;
  return [
    [s.x2 - size * Math.cos(angle - spread), s.y2 - size * Math.sin(angle - spread)],
    [s.x2 - size * Math.cos(angle + spread), s.y2 - size * Math.sin(angle + spread)],
  ];
}

// Outlines are costly to compute and the infinite canvas redraws on every pan frame; items
// are immutable (edits create new objects), so cache their paths by identity.
const pathCache = new WeakMap<StrokeItem, Path2D>();

function strokePath(s: StrokeItem) {
  let path = pathCache.get(s);
  if (!path) {
    path = new Path2D(outlineToSvgPath(strokeOutline(s)));
    pathCache.set(s, path);
  }
  return path;
}

export function drawStrokeItem(ctx: CanvasRenderingContext2D, s: StrokeItem) {
  ctx.save();
  if (s.tool === 'marker') {
    ctx.globalAlpha = MARKER_OPACITY;
    ctx.globalCompositeOperation = 'multiply';
  }
  ctx.fillStyle = s.color;
  ctx.fill(strokePath(s));
  ctx.restore();
}

/** Draws the ink of a page (strokes and shapes) in stacking order; text and images are DOM. */
export function drawItems(ctx: CanvasRenderingContext2D, items: NoteItem[], hidden?: Set<string>) {
  for (const item of [...items].sort((a, b) => a.z - b.z)) {
    if (hidden?.has(item.id)) continue;
    if (item.type === 'stroke') drawStrokeItem(ctx, item);
    else if (item.type === 'shape') drawShape(ctx, item);
  }
}
