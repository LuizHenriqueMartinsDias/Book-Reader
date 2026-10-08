import { describe, expect, it } from 'vitest';
import { gutenbergItem } from './gutenberg';

const base = {
  id: 55752,
  title: 'Dom Casmurro',
  authors: [{ name: 'Assis, Machado de', birth_year: 1839, death_year: 1908 }],
  languages: ['pt'],
  copyright: false,
  download_count: 3732,
  formats: {
    'application/epub+zip': 'https://www.gutenberg.org/ebooks/55752.epub3.images',
    'image/jpeg': 'https://www.gutenberg.org/cache/epub/55752/pg55752.cover.medium.jpg',
  },
};

describe('gutenbergItem', () => {
  it('maps a Gutendex book to a catalog item with its EPUB', async () => {
    const item = gutenbergItem(base)!;
    expect(item).toMatchObject({ key: 'pg:55752', authors: 'Machado de Assis', rights: { kind: 'public-domain' } });
    expect(await item.resolveFile()).toEqual({ url: base.formats['application/epub+zip'], name: 'pg55752.epub', size: null, format: 'epub' });
  });

  it('skips books without an EPUB and flags copyrighted ones', () => {
    expect(gutenbergItem({ ...base, formats: {} })).toBeNull();
    expect(gutenbergItem({ ...base, copyright: true })!.rights.kind).toBe('unknown');
  });
});
