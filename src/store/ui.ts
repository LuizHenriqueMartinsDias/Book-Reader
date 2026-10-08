import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tool = 'select' | 'pen' | 'marker' | 'eraser';
export type Theme = 'light' | 'sepia' | 'dark';
/** How pages advance: continuous vertical scroll, or one spread at a time with a transition. */
export type ViewMode = 'scroll' | 'flip' | 'slide' | 'instant';
export type SpreadLayout = 'auto' | 'single' | 'double';

export const PEN_COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#9333ea'];
export const MARKER_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#fb923c'];
export const HIGHLIGHT_COLORS = MARKER_COLORS;

interface UiState {
  tool: Tool;
  penColor: string;
  penWidth: number;
  markerColor: string;
  markerWidth: number;
  theme: Theme;
  viewMode: ViewMode;
  spreadLayout: SpreadLayout;
  sidebarOpen: boolean;
  /** Once a stylus is seen, finger touches scroll instead of drawing (palm rejection). */
  penDetected: boolean;
  set: (patch: Partial<Omit<UiState, "set">>) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      tool: 'select',
      penColor: PEN_COLORS[0],
      penWidth: 2,
      markerColor: MARKER_COLORS[0],
      markerWidth: 14,
      theme: 'light',
      viewMode: 'scroll',
      spreadLayout: 'auto',
      sidebarOpen: false,
      penDetected: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'book-reader-ui',
      partialize: ({ set: _set, tool: _tool, ...rest }) => rest,
    },
  ),
);
