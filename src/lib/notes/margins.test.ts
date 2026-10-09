import { describe, expect, it } from 'vitest';
import type { NotePage } from '../../db/schema';
import { pdfBox, withMargins } from './margins';

const page: NotePage = { id: 'p', notebookId: 'n', order: 0, width: 600, height: 800, background: { pdfPage: 1 } };

describe('sheet margins', () => {
  it('grows the page around the PDF and moves items by the left and top margins', () => {
    const r = withMargins(page, { top: 10, right: 300, bottom: 0, left: 50 })!;
    expect(r.page).toMatchObject({ width: 950, height: 810 });
    expect(pdfBox(r.page)).toEqual({ x: 50, y: 10, w: 600, h: 800 });
    expect([r.dx, r.dy]).toEqual([50, 10]);
  });

  it('changes margins relative to the current ones and drops them when back to none', () => {
    const stretched = withMargins(page, { top: 40, right: 0, bottom: 0, left: 100 })!.page;
    const r = withMargins(stretched, { top: 0, right: 0, bottom: 0, left: 30 })!;
    expect([r.dx, r.dy]).toEqual([-70, -40]);
    const back = withMargins(r.page, { top: 0, right: 0, bottom: 0, left: 0 })!;
    expect(back.page).toEqual(page);
  });

  it('only applies to PDF pages', () => {
    expect(withMargins({ ...page, background: undefined }, { top: 1, right: 1, bottom: 1, left: 1 })).toBeNull();
  });
});
