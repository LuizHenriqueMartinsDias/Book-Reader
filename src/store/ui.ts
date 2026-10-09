import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Brush } from '../db/schema';

/** `sticky`: a tap on a PDF page sticks a post-it there. */
export type Tool = 'select' | 'pen' | 'marker' | 'eraser' | 'sticky';
export type Theme = 'light' | 'sepia' | 'dark';
/** How pages advance: continuous vertical scroll, or one spread at a time with a transition. */
export type ViewMode = 'scroll' | 'flip' | 'slide' | 'instant';
export type SpreadLayout = 'auto' | 'single' | 'double';
export type EpubFont = 'original' | 'serif' | 'sans';

/** Thickness a pen starts with, by kind (each kind then remembers its own). */
export const BRUSH_WIDTHS: Record<Brush, number> = { pen: 2, fineliner: 1.5, brush: 6, pencil: 2 };

export const PEN_COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#9333ea'];
export const MARKER_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'];
export const HIGHLIGHT_COLORS = MARKER_COLORS;

interface UiState {
  tool: Tool;
  penColor: string;
  /** Kind of pen, and the thickness last used with each kind (`penWidth` is the current one's). */
  penBrush: Brush;
  brushWidths: Partial<Record<Brush, number>>;
  penWidth: number;
  markerColor: string;
  markerWidth: number;
  theme: Theme;
  viewMode: ViewMode;
  spreadLayout: SpreadLayout;
  /** EPUB text size in percent and typeface. */
  epubFontSize: number;
  epubFont: EpubFont;
  sidebarOpen: boolean;
  /** Once a stylus is seen, finger touches scroll instead of drawing (palm rejection). */
  penDetected: boolean;
  /** With a stylus, it writes even when the select tool is active; fingers keep selecting and navigating. */
  stylusAlwaysInks: boolean;
  /** Paper color of new post-its on book pages. */
  stickyColor: string;
  /** Ink tool the stylus uses under the select tool: the last one picked. */
  lastInkTool: 'pen' | 'marker';
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      tool: 'select',
      penColor: PEN_COLORS[0],
      penBrush: 'pen',
      brushWidths: {},
      penWidth: 2,
      markerColor: MARKER_COLORS[0],
      markerWidth: 14,
      theme: 'light',
      viewMode: 'scroll',
      spreadLayout: 'auto',
      epubFontSize: 100,
      epubFont: 'original',
      sidebarOpen: false,
      penDetected: false,
      stylusAlwaysInks: true,
      lastInkTool: 'pen',
      stickyColor: '#fef08a',
      set: (patch) =>
        set((s) => {
          const next = patch.tool === 'pen' || patch.tool === 'marker' ? { ...patch, lastInkTool: patch.tool } : patch;
          // Switching pens: keep this one's thickness, take up the new one's.
          if (patch.penBrush && patch.penBrush !== s.penBrush) {
            const brushWidths = { ...s.brushWidths, [s.penBrush]: s.penWidth };
            return { ...next, brushWidths, penWidth: patch.penWidth ?? brushWidths[patch.penBrush] ?? BRUSH_WIDTHS[patch.penBrush] };
          }
          return next;
        }),
    }),
    {
      name: 'book-reader-ui',
      partialize: ({ set: _set, tool: _tool, ...rest }) => rest,
    },
  ),
);
