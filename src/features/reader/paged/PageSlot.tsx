import type { CSSProperties } from 'react';
import type { PageSize, PDFDocumentProxy } from '../../../lib/pdf';
import PageView from '../PageView';

export type Slot = 'left' | 'right';

export interface SlotGeometry {
  double: boolean;
  slotW: number;
  slotH: number;
  scale: number;
}

/** In a double spread even pages sit on the left and odd ones on the right (page 1 is the cover). */
export const slotOf = (page: number, double: boolean): Slot => (double && page % 2 === 0 ? 'left' : 'right');
export const slotX = (slot: Slot, { double, slotW }: SlotGeometry) => (double && slot === 'right' ? slotW : 0);

interface Props {
  doc: PDFDocumentProxy;
  page: number;
  size: PageSize;
  geo: SlotGeometry;
  /** Positioning of the slot (left/top/z-index/visibility/filter). */
  outer?: CSSProperties;
  /** Transform and clip of the page inside its slot. */
  inner?: CSSProperties;
  interactive: boolean;
}

/**
 * A page inside a book-sized slot. The element tree is the same for every role a page can
 * take during a turn, so React keeps the instance (and its rendered canvas) as roles change.
 */
export default function PageSlot({ doc, page, size, geo, outer, inner, interactive }: Props) {
  const w = size.width * geo.scale;
  const h = size.height * geo.scale;
  // Pages hug the spine in a double spread; a single page is centered in its slot.
  const slot = slotOf(page, geo.double);
  const x = !geo.double ? (geo.slotW - w) / 2 : slot === 'left' ? geo.slotW - w : 0;

  return (
    <div className="absolute top-0" style={{ width: geo.slotW, height: geo.slotH, ...outer }}>
      <div className="absolute inset-0" style={{ transformOrigin: '0 0', ...inner }}>
        <div className="absolute" style={{ left: x, top: (geo.slotH - h) / 2 }}>
          <PageView doc={doc} pageNumber={page} size={size} scale={geo.scale} active interactive={interactive} shadow={false} />
        </div>
      </div>
    </div>
  );
}
