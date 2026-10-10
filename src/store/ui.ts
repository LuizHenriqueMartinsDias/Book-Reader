import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Brush } from '../db/schema';

/** `sticky`: a tap on a PDF page sticks a post-it there. */
export type Tool = 'select' | 'pen' | 'marker' | 'eraser' | 'sticky';
export type Theme = 'light' | 'sepia' | 'dark';
/** How pages advance: continuous vertical scroll, or one spread at a time with a transition. */
export type ViewMode = 'scroll' | 'flip' | 'slide' | 'instant';
export type SpreadLayout = 'auto' | 'single' | 'double';
export type EpubFont = 'original' | 'literata' | 'serif' | 'sans';
export type LibrarySort = 'recent' | 'title' | 'added';

/** Thickness a pen starts with, by kind (each kind then remembers its own). */
export const BRUSH_WIDTHS: Record<Brush, number> = { pen: 2, fineliner: 1.5, brush: 6, pencil: 2 };

export const PEN_COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#9333ea'];
export const MARKER_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'];
export const HIGHLIGHT_COLORS = MARKER_COLORS;

/** Fuller palettes for the notebook's color options (the quick colors above come first in each). */
export const PEN_PALETTE = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#9333ea', '#6b7280', '#ffffff', '#92400e', '#ea580c', '#ca8a04', '#65a30d', '#0d9488', '#0284c7', '#4f46e5', '#c026d3', '#db2777'];
export const MARKER_PALETTE = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa', '#2dd4bf', '#f87171', '#a3e635', '#d1d5db'];
const MAX_CUSTOM_COLORS = 12;
export type InkKind = 'pen' | 'marker';

interface UiState {
  tool: Tool;
  penColor: string;
  /** Kind of pen, and the thickness last used with each kind (`penWidth` is the current one's). */
  penBrush: Brush;
  brushWidths: Partial<Record<Brush, number>>;
  penWidth: number;
  markerColor: string;
  /** Opacity of new pen and marker strokes, 0.1–1. */
  penOpacity: number;
  markerOpacity: number;
  markerWidth: number;
  theme: Theme;
  viewMode: ViewMode;
  spreadLayout: SpreadLayout;
  /** EPUB text size in percent and typeface. */
  epubFontSize: number;
  epubFont: EpubFont;
  /** Order of the shelf's books. */
  librarySort: LibrarySort;
  /** Colors mixed in the color picker, most recent first, per kind of ink. */
  customColors: Record<InkKind, string[]>;
  addCustomColor: (kind: InkKind, color: string) => void;
  removeCustomColor: (kind: InkKind, color: string) => void;
  /** The last book and notebook opened side by side, to pick up from the notebooks screen. */
  lastSplit: { bookId: string; notebookId: string; page?: number } | null;
  sidebarOpen: boolean;
  /** Once a stylus is seen, finger touches scroll instead of drawing (palm rejection). */
  penDetected: boolean;
  /** With a stylus, it writes even when the select tool is active; fingers keep selecting and navigating. */
  stylusAlwaysInks: boolean;
  /** Paper color of new post-its on book pages. */
  stickyColor: string;
  /** Ink tool the stylus uses under the select tool: the last one picked. */
  lastInkTool: 'pen' | 'marker';
  /** When the annotations were last backed up (any way: folder, share, download), or null if never. */
  lastBackupAt: number | null;
  /** Ink being written goes straight to the screen (Chrome's low-latency canvas) and reaches ahead to where the pen is going. */
  lowLatencyInk: boolean;
  /** The Google account whose Drive gets the backups, or null when not connected. */
  driveAccount: string | null;
  set: (patch: Partial<Omit<UiState, "set" | "addCustomColor" | "removeCustomColor">>) => void;
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
      penOpacity: 1,
      markerOpacity: 1,
      markerWidth: 14,
      theme: 'light',
      viewMode: 'scroll',
      spreadLayout: 'auto',
      epubFontSize: 100,
      epubFont: 'original',
      librarySort: 'recent',
      customColors: { pen: [], marker: [] },
      addCustomColor: (kind, color) =>
        set((s) => {
          const palette = kind === 'pen' ? PEN_PALETTE : MARKER_PALETTE;
          if (palette.includes(color)) return {};
          return { customColors: { ...s.customColors, [kind]: [color, ...s.customColors[kind].filter((c) => c !== color)].slice(0, MAX_CUSTOM_COLORS) } };
        }),
      removeCustomColor: (kind, color) => set((s) => ({ customColors: { ...s.customColors, [kind]: s.customColors[kind].filter((c) => c !== color) } })),
      lastSplit: null,
      sidebarOpen: false,
      penDetected: false,
      stylusAlwaysInks: true,
      lastInkTool: 'pen',
      stickyColor: '#fef08a',
      lastBackupAt: null,
      lowLatencyInk: true,
      driveAccount: null,
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
      partialize: ({ set: _set, tool: _tool, addCustomColor: _add, removeCustomColor: _remove, ...rest }) => rest,
    },
  ),
);

/** What a new stroke of the pen or marker is drawn with: color, kind of pen, thickness and opacity. */
export function inkStyle(tool: InkKind) {
  const ui = useUi.getState();
  const opacity = tool === 'pen' ? ui.penOpacity : ui.markerOpacity;
  const style = tool === 'pen' ? { tool, brush: ui.penBrush, color: ui.penColor, width: ui.penWidth } : { tool, color: ui.markerColor, width: ui.markerWidth };
  // Fully opaque ink leaves the field out, like strokes drawn before there was a choice.
  return opacity < 1 ? { ...style, opacity } : style;
}
