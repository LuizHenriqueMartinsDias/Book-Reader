import type { EpubFont, Theme } from '../../store/ui';

/** Page colors per app theme, matching the --paper tokens in index.css. */
export const EPUB_THEMES: Record<Theme, { background: string; color: string; link: string }> = {
  light: { background: '#ffffff', color: '#1c1917', link: '#b45309' },
  sepia: { background: '#f4ecdc', color: '#3b2f22', link: '#92400e' },
  dark: { background: '#1f1f1f', color: '#e7e5e4', link: '#fbbf24' },
};

export const EPUB_FONTS: Record<EpubFont, { label: string; family: string | null }> = {
  original: { label: 'Original', family: null },
  // Bundled with the app (lib/fonts.ts); each page of the book gets its @font-face.
  literata: { label: 'Literata', family: 'Literata, Georgia, serif' },
  serif: { label: 'Serifa', family: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  sans: { label: 'Sem serifa', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};

export const FONT_SIZES = [80, 90, 100, 110, 125, 140, 160, 180, 200];
