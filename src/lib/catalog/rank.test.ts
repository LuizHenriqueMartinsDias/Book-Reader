import { describe, expect, it } from 'vitest';
import { matchTier, rankByQuery } from './rank';
import type { CatalogItem } from './types';

const book = (title: string, authors = '') => ({ key: title, title, authors }) as CatalogItem;

describe('rankByQuery', () => {
  it('puts the exact title first, then titles with the words as typed, then the rest', () => {
    const items = [
      book('GIREP 1996 Ljubljana — New Ways in Teaching Physics'),
      book('Introduction To Machine Learning With Python'),
      book('An introduction to MM algorithms for machine learning'),
      book('Introduction to Machine Learning'),
      book('My Life and Work', 'Henry Ford'),
    ];
    expect(rankByQuery(items, 'introduction to machine learning').map((b) => b.title)).toEqual([
      'Introduction to Machine Learning',
      'Introduction To Machine Learning With Python',
      'An introduction to MM algorithms for machine learning',
      'GIREP 1996 Ljubljana — New Ways in Teaching Physics',
      'My Life and Work',
    ]);
  });

  it('ignores accents and case, and counts the author for the words', () => {
    expect(matchTier(book('Memórias Póstumas de Brás Cubas'), 'memorias postumas')).toBe(1);
    expect(matchTier(book('Dom Casmurro', 'Machado de Assis'), 'casmurro machado')).toBe(4);
    expect(matchTier(book('Anything'), '')).toBe(0);
  });
});
