import { memo, useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import { pdfjs, type PageSize, type PDFDocumentProxy } from '../../lib/pdf';
import { sizeCanvas } from './canvasSize';
import HighlightLayer from './HighlightLayer';
import InkLayer from './InkLayer';

interface Props {
  doc: PDFDocumentProxy;
  pageNumber: number;
  size: PageSize;
  scale: number;
  /** Only pages near the viewport render content; others are sized placeholders. */
  active: boolean;
  /** False while the page is mid-animation: no drawing, selecting or clicking. */
  interactive?: boolean;
  shadow?: boolean;
}

/** Re-rendering on every zoom step is costly; let the old bitmap stretch until zooming settles. */
const RERENDER_DELAY = 180;

export default memo(function PageView({ doc, pageNumber, size, scale, active, interactive = true, shadow = true }: Props) {
  const width = size.width * scale;
  const height = size.height * scale;

  return (
    <div
      data-page={pageNumber}
      data-scale={scale}
      className={`page relative mx-auto bg-white ${shadow ? 'shadow-md' : ''} ${interactive ? '' : 'page-inert'}`}
      style={{ width, height, ['--scale-factor' as string]: scale }}
    >
      {active ? (
        <PageContent doc={doc} pageNumber={pageNumber} size={size} scale={scale} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">{pageNumber}</div>
      )}
    </div>
  );
});

function PageContent({ doc, pageNumber, size, scale }: Pick<Props, 'doc' | 'pageNumber' | 'size' | 'scale'>) {
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [renderScale, setRenderScale] = useState(scale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (scale === renderScale) return;
    const t = setTimeout(() => setRenderScale(scale), RERENDER_DELAY);
    return () => clearTimeout(t);
  }, [scale, renderScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!page || !canvas) return;
    const viewport = page.getViewport({ scale: renderScale });
    // Render offscreen and swap in, so the previous bitmap stays visible meanwhile.
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
  }, [page, renderScale]);

  useEffect(() => {
    const container = textRef.current;
    if (!page || !container) return;
    container.replaceChildren();
    const layer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale: renderScale }),
    });
    layer.render().catch(() => {});
    return () => layer.cancel();
  }, [page, renderScale]);

  return (
    <>
      <canvas ref={canvasRef} className="page-canvas absolute inset-0 size-full" />
      <HighlightLayer pageNumber={pageNumber} scale={scale} />
      {/* The text layer is laid out for renderScale; stretch it to the live scale meanwhile. */}
      <div
        ref={textRef}
        className="textLayer"
        style={{ ['--scale-factor' as string]: renderScale, transform: `scale(${scale / renderScale})` }}
      />
      <InkLayer pageNumber={pageNumber} size={size} scale={scale} />
    </>
  );
}
