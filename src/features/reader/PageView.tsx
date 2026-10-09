import { memo, useEffect, useRef } from 'react';
import { pdfjs, type PageSize, type PDFDocumentProxy } from '../../lib/pdf';
import HighlightLayer from './HighlightLayer';
import InkLayer from './InkLayer';
import { usePdfCanvas, usePdfPage, useSettledScale } from './PdfPageCanvas';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const page = usePdfPage(doc, pageNumber);
  const renderScale = useSettledScale(scale);
  usePdfCanvas(canvasRef, page, renderScale);

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
