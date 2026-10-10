import { describe, expect, it } from 'vitest';
import type { CatalogItem } from '../../lib/catalog/types';
import { fold, suggest } from './suggest';

const book = (title: string, authors: string) => ({ key: `pg:${title}`, title, authors }) as CatalogItem;

describe('suggest', () => {
  it('offers recent searches when nothing is typed yet', () => {
    expect(suggest('  ', ['poesia', 'contos'], [])).toEqual({ recent: ['poesia', 'contos'], authors: [], genres: [], books: [] });
  });

  it('matches authors, genres and seen books ignoring accents and case', () => {
    const seen = [book('Iracema', 'José de Alencar'), book('O Guarani', 'José de Alencar'), book('Iracema', 'José de Alencar')];
    const s = suggest('jose', ['jose de alencar contos'], seen);
    expect(s.authors).toEqual(['José de Alencar']);
    expect(s.recent).toEqual(['jose de alencar contos']);
    expect(suggest('IRACE', [], seen).books.map((b) => b.title)).toEqual(['Iracema']);
    expect(suggest('poes', [], []).genres.map((g) => g.label)).toEqual(['Poesia']);
  });

  it('keeps characters in place so the match can be highlighted', () => {
    expect(fold('Eça de Queirós')).toBe('eca de queiros');
    expect(fold('Eça de Queirós').length).toBe('Eça de Queirós'.length);
  });
});
