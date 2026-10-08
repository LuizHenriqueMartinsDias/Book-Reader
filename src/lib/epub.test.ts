import { describe, expect, it } from 'vitest';
import { buildLocationIndex, progressAt, sniffFormat, spineIndexOfCfi } from './epub';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('sniffFormat', () => {
  it('tells PDFs from EPUBs by their first bytes', () => {
    expect(sniffFormat(bytes('%PDF-1.7\n...'))).toBe('pdf');
    expect(sniffFormat(bytes('PK\x03\x04....mimetypeapplication/epub+zip'))).toBe('epub');
    expect(sniffFormat(bytes('PK\x03\x04 some zip'), 'book.epub')).toBe('epub');
    expect(sniffFormat(bytes('PK\x03\x04 some zip'), 'photos.zip')).toBeNull();
    expect(sniffFormat(bytes('<html>'))).toBeNull();
  });
});

describe('progress from locations', () => {
  // Cover (no text), a header, then two big text files: like a Project Gutenberg EPUB.
  const cfis = [
    'epubcfi(/6/4!/4/2,/1:0,/1:100)',
    ...Array.from({ length: 60 }, (_, i) => `epubcfi(/6/6!/4/${i * 2 + 2},/1:0,/1:999)`),
    ...Array.from({ length: 39 }, (_, i) => `epubcfi(/6/8!/4/${i * 2 + 2},/1:0,/1:999)`),
  ];
  const index = buildLocationIndex(cfis, 5);

  it('counts locations per spine item', () => {
    expect(spineIndexOfCfi('epubcfi(/6/6!/4/2)')).toBe(2);
    expect(index.counts).toEqual([0, 1, 60, 39, 0]);
    expect(index.before).toEqual([0, 0, 1, 61, 100]);
    expect(index.total).toBe(100);
  });

  it('places the reader by spine item and page within it', () => {
    expect(progressAt(index, 0, 1, 1)).toEqual({ fraction: 0, position: 1 });
    expect(progressAt(index, 1, 1, 1).fraction).toBe(0); // the header is right at the start, not halfway
    expect(progressAt(index, 2, 31, 60)).toEqual({ fraction: 0.31, position: 32 });
    expect(progressAt(index, 3, 39, 39).fraction).toBeCloseTo(0.99, 2);
    expect(progressAt(index, 4, 1, 1).fraction).toBe(1);
  });
});
