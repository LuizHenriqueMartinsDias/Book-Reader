import { describe, expect, it } from 'vitest';
import bookXml from './fixtures/gutenberg_55752.xml?raw';
import searchXml from './fixtures/gutenberg_search.xml?raw';
import { gutenbergUrl, parseBookFeed, parseSearchFeed } from './gutenberg';

describe('parseSearchFeed', () => {
  it('reads the books of a real search feed, with covers and EPUBs from their number', () => {
    const page = parseSearchFeed(searchXml);
    expect(page.hasMore).toBe(true);
    expect(page.items.length).toBeGreaterThan(20);
    expect(page.items[0]).toMatchObject({
      key: 'pg:3333',
      source: 'gutenberg',
      title: 'Os Lusíadas',
      authors: 'Luís de Camões',
      rights: { kind: 'public-domain' },
      cover: 'https://www.gutenberg.org/cache/epub/3333/pg3333.cover.medium.jpg',
      fileUrl: 'https://www.gutenberg.org/ebooks/3333.epub3.images',
    });
    // Titles lose the language Gutenberg appends, and line breaks.
    expect(page.items.every((i) => !/\(Portuguese\)|\n/.test(i.title))).toBe(true);
  });

  it('skips entries that are not books', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>https://www.gutenberg.org/ebooks/subjects/search.opds/</id><title>Subjects</title></entry>
      <entry><id>https://www.gutenberg.org/ebooks/1.opds</id><title>A (English)</title><content>B</content></entry>
      <entry><id>https://www.gutenberg.org/ebooks/2.opds</id><title>Bible</title><content>49245 downloads</content></entry>
    </feed>`;
    expect(parseSearchFeed(xml)).toMatchObject({
      hasMore: false,
      items: [
        { key: 'pg:1', title: 'A', authors: 'B' },
        { key: 'pg:2', authors: '', downloads: 49245 },
      ],
    });
  });
});

describe('parseBookFeed', () => {
  it('reads the summary, bookshelves, subjects and downloads of a real book feed', () => {
    const item = parseBookFeed('55752', bookXml);
    expect(item).toMatchObject({ key: 'pg:55752', title: 'Dom Casmurro', authors: 'Machado de Assis', rights: { kind: 'public-domain' } });
    expect(item.summary).toMatch(/^"Dom Casmurro" by Machado de Assis is a novel/);
    expect(item.summary).not.toContain('automatically generated');
    expect(item.subjects?.[0]).toBe('Novels');
    expect(item.subjects).toContain('Adultery');
    expect(item.downloads).toBeGreaterThan(1000);
  });
});

describe('gutenbergUrl', () => {
  it('turns filters into search prefixes and pages by start index', () => {
    const url = gutenbergUrl({ author: 'Machado de Assis', topic: 'short stories', language: 'por', page: 3 });
    expect(Object.fromEntries(url.searchParams)).toEqual({
      query: 'a.machado a.assis s.short s.stories l.pt',
      sort_order: 'downloads',
      start_index: '51',
    });
  });

  it('sorts by relevance when searching for words', () => {
    const url = gutenbergUrl({ query: ' dom casmurro ', language: 'all', page: 1 });
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: 'dom casmurro' });
  });
});
