import { describe, expect, it } from 'vitest';
import { catalogHref, parseCatalogView } from './routes';

const parse = (hash: string) => {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  return parseCatalogView(path, new URLSearchParams(query), 'por');
};

describe('catalog routes', () => {
  it('round-trips the links it builds', () => {
    expect(parse(catalogHref.home)).toEqual({ kind: 'home' });
    expect(parse(catalogHref.search('dom casmurro'))).toEqual({ kind: 'search', query: 'dom casmurro', source: 'all' });
    expect(parse(catalogHref.search('poe & co', 'archive'))).toEqual({ kind: 'search', query: 'poe & co', source: 'archive' });
    expect(parse(catalogHref.book('ia:id with/slash'))).toEqual({ kind: 'book', key: 'ia:id with/slash' });
    expect(parse(catalogHref.author('Eça de Queirós'))).toMatchObject({ kind: 'list', list: { title: 'Eça de Queirós', filter: { authors: ['Eça de Queirós'] } } });
    expect(parse(catalogHref.subject('Brazilian fiction'))).toMatchObject({
      kind: 'list',
      list: { filter: { subject: { gutenberg: 'Brazilian fiction', archive: ['Brazilian fiction'] } } },
    });
  });

  it('finds genres and home shelves, and reports unknown ones', () => {
    expect(parse(catalogHref.category('poesia'))).toMatchObject({ kind: 'list', list: { title: 'Poesia', sources: ['gutenberg', 'archive'] } });
    expect(parse(catalogHref.shelf('populares'))).toMatchObject({ kind: 'list', list: { title: 'Mais baixados', filter: {} } });
    expect(parse(catalogHref.category('nope'))).toEqual({ kind: 'list', list: null });
  });
});
