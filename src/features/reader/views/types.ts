import type { PageSize, PDFDocumentProxy } from '../../../lib/pdf';

/** `zoom` is relative to pdf.js' 100% (1pt = 96/72 px); `null` means fit (width when scrolling, page when paged). */
export type ZoomMode = number | null;
export type ZoomChange = ZoomMode | ((current: number) => number);

export interface ViewProps {
  doc: PDFDocumentProxy;
  sizes: PageSize[];
  zoom: ZoomMode;
  onZoom: (next: ZoomChange) => void;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;
