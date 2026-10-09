import type { ConnectorItem, NodeItem, NoteItem, Paper, ShapeItem, StickyItem, StrokeItem } from '../../db/schema';
import { fillInk, hexToRgb, outlineToSvgPath, strokeOutline } from '../ink';
import { barbs, connectorPoints, heads, midpoint, nodesById } from './connectors';
import { nodeRadius, type Vec } from './geometry';
import { isSticky, STICKY_HEADER, STICKY_INK } from './sticky';

/** How strong a filled box's tint of its outline color is. */
export const NODE_FILL_OPACITY = 0.14;

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
  fillInk(ctx, strokePath(s), s);
}

/** A diagram box's outline and tint (its text is DOM in the editor; see `drawNodeText`). */
export function drawNode(ctx: CanvasRenderingContext2D, n: NodeItem) {
  const { x, y, w, h } = n;
  const path = new Path2D();
  if (n.shape === 'rect') path.rect(x, y, w, h);
  else if (n.shape === 'round') path.roundRect(x, y, w, h, nodeRadius(n));
  else if (n.shape === 'ellipse') path.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else {
    path.moveTo(x + w / 2, y);
    path.lineTo(x + w, y + h / 2);
    path.lineTo(x + w / 2, y + h);
    path.lineTo(x, y + h / 2);
    path.closePath();
  }
  ctx.save();
  if (n.filled) {
    const [r, g, b] = hexToRgb(n.color).map((c) => Math.round(c * 255));
    ctx.fillStyle = `rgb(${r} ${g} ${b} / ${NODE_FILL_OPACITY})`;
    ctx.fill(path);
  }
  ctx.strokeStyle = n.color;
  ctx.lineWidth = n.width;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** A box's text on a canvas (thumbnails and previews; the editor uses an editable DOM box). */
export function drawNodeText(ctx: CanvasRenderingContext2D, n: NodeItem) {
  if (!n.text) return;
  const lines = n.text.split('\n');
  const lh = n.fontSize * 1.3;
  ctx.save();
  ctx.fillStyle = n.color;
  ctx.font = `${n.fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, n.x + n.w / 2, n.y + n.h / 2 + (i - (lines.length - 1) / 2) * lh, n.w * 0.9));
  ctx.restore();
}

/** A diagram arrow along `points` (see connectors.ts), with its heads; its text is DOM in the editor. */
export function drawConnector(ctx: CanvasRenderingContext2D, c: Pick<ConnectorItem, 'arrows' | 'color' | 'width'>, points: Vec[]) {
  ctx.save();
  ctx.strokeStyle = c.color;
  ctx.lineWidth = c.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  for (const [tip, from] of heads(c, points)) {
    const [a, b] = barbs(tip, from, c.width);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.restore();
}

/** An arrow's text on a canvas (thumbnails), on a patch of paper so the line doesn't cross it. */
export function drawConnectorLabel(ctx: CanvasRenderingContext2D, c: ConnectorItem, points: Vec[], paperColor: string) {
  if (!c.label) return;
  const [x, y] = midpoint(points);
  ctx.save();
  ctx.font = `${c.fontSize}px system-ui, sans-serif`;
  const w = ctx.measureText(c.label).width + 8;
  ctx.fillStyle = paperColor;
  ctx.fillRect(x - w / 2, y - c.fontSize * 0.7, w, c.fontSize * 1.4);
  ctx.fillStyle = c.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.label, x, y);
  ctx.restore();
}

/** A post-it's paper (open ones only; a collapsed one is a DOM icon), with a slightly darker strip to drag it by. */
export function drawSticky(ctx: CanvasRenderingContext2D, s: StickyItem) {
  ctx.save();
  ctx.shadowColor = 'rgb(0 0 0 / 0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = s.color;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgb(0 0 0 / 0.06)';
  ctx.fillRect(s.x, s.y, s.w, Math.min(STICKY_HEADER, s.h));
  ctx.restore();
}

/** A post-it's text on a canvas (thumbnails; the editor uses an editable DOM box), wrapped to its width. */
export function drawStickyText(ctx: CanvasRenderingContext2D, s: StickyItem) {
  if (s.collapsed || !s.text) return;
  ctx.save();
  ctx.fillStyle = STICKY_INK;
  ctx.font = `${s.fontSize}px system-ui, sans-serif`;
  const pad = 6;
  let y = s.y + STICKY_HEADER + pad + s.fontSize;
  for (const paragraph of s.text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > s.w - 2 * pad) {
        ctx.fillText(line, s.x + pad, y);
        y += s.fontSize * 1.35;
        line = word;
      } else line = next;
    }
    ctx.fillText(line, s.x + pad, y);
    y += s.fontSize * 1.35;
  }
  ctx.restore();
}

/**
 * Stacking on a page's canvas: diagram boxes, their arrows, ink, then post-its (paper over the
 * page) with the writing on them on top.
 */
function canvasLayer(i: NoteItem, stickies: Map<string, StickyItem>) {
  if (i.type === 'node') return 0;
  if (i.type === 'connector') return 1;
  if (i.type === 'sticky') return 3;
  return i.parentId && stickies.has(i.parentId) ? 4 : 2;
}

/** Draws the ink of a page in stacking order (see `canvasLayer`); text and images are DOM. */
export function drawItems(ctx: CanvasRenderingContext2D, items: NoteItem[], hidden?: Set<string>) {
  const stickies = new Map(items.filter(isSticky).map((s) => [s.id, s]));
  const sorted = [...items].sort((a, b) => canvasLayer(a, stickies) - canvasLayer(b, stickies) || a.z - b.z);
  let nodes: ReturnType<typeof nodesById> | null = null;
  for (const item of sorted) {
    if (hidden?.has(item.id)) continue;
    // What's written on a collapsed post-it is folded away with it.
    if (item.parentId && stickies.get(item.parentId)?.collapsed) continue;
    if (item.type === 'sticky') {
      if (!item.collapsed) drawSticky(ctx, item);
      continue;
    }
    if (item.type === 'stroke') drawStrokeItem(ctx, item);
    else if (item.type === 'shape') drawShape(ctx, item);
    else if (item.type === 'node') drawNode(ctx, item);
    else if (item.type === 'connector') drawConnector(ctx, item, connectorPoints(item, (nodes ??= nodesById(items.filter((i) => !hidden?.has(i.id))))));
  }
}
