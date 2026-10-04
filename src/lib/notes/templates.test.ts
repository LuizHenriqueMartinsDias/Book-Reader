import { describe, expect, it } from 'vitest';
import { isPdfFile, pictureSize } from './templates';

describe('page templates', () => {
  it('makes a picture A4-wide, keeping its shape', () => {
    expect(pictureSize(1240, 1754)).toEqual({ width: 595, height: 841.64 });
    expect(pictureSize(2000, 1000)).toEqual({ width: 595, height: 297.5 });
  });

  it('tells PDFs from pictures by type or name', () => {
    expect(isPdfFile(new File([], 'planner.PDF'))).toBe(true);
    expect(isPdfFile(new File([], 'x', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([], 'cornell.png', { type: 'image/png' }))).toBe(false);
  });
});
