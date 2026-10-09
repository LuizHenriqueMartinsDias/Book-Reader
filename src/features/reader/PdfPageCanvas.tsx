import type { PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PDFDocumentProxy } from '../../lib/pdf';
import { sizeCanvas } from './canvasSize';

/** Re-rendering on every zoom step is costly; let the old bitmap stretch until zooming settles. */
const RERENDER_DELAY = 180;

export function usePdfPage(doc: PDFDocumentProxy, pageNumber: number) {
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFPageProxy | null = null;
    doc.getPage(pageNumber).then((p) => {
      if (cancelled) return;
      loaded = p;
      setPage(p);
    });
    return () => {
      cancelled = true;
      loaded?.cleanup();
    };
  }, [doc, pageNumber]);
  return page;
}

/** `scale`, but only once it has stopped changing for a moment. */
export function useSettledScale(scale: number) {
  const [settled, setSettled] = useState(scale);
  useEffect(() => {
    if (scale === settled) return;
    const t = setTimeout(() => setSettled(scale), RERENDER_DELAY);
    return () => clearTimeout(t);
  }, [scale, settled]);
  return settled;
}

/** Renders a PDF page into the canvas at `scale`, offscreen first so the old bitmap stays up meanwhile. */
export function usePdfCanvas(canvasRef: RefObject<HTMLCanvasElement | null>, page: PDFPageProxy | null, scale: number) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const viewport = page.getViewport({ scale });
    const offscreen = document.createElement('canvas');
    const ratio = sizeCanvas(offscreen, viewport.width, viewport.height);
    const task = page.render({
      canvasContext: offscreen.getContext('2d')!,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
    });
    task.promise
      .then(() => {
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.getContext('2d')!.drawImage(offscreen, 0, 0);
      })
      .catch((e) => {
        if (e?.name !== 'RenderingCancelledException') console.error(e);
      });
    return () => task.cancel();
  }, [canvasRef, page, scale]);
}

/** Just the rendered page, stretched to its container (e.g. under a notebook page). */
export default function PdfPageCanvas({ doc, pageNumber, scale }: { doc: PDFDocumentProxy; pageNumber: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const page = usePdfPage(doc, pageNumber);
  usePdfCanvas(canvasRef, page, useSettledScale(scale));
  return <canvas ref={canvasRef} className="page-canvas absolute inset-0 size-full" />;
}
