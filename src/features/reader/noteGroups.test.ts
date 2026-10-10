import { describe, expect, it } from 'vitest';
import { chapterAtPage, groupConsecutive } from './noteGroups';

describe('chapterAtPage', () => {
  it('finds the last outline entry starting on or before the page, nested ones included', () => {
    const chapterOf = chapterAtPage([
      { title: 'Prefácio', page: 3, items: [] },
      { title: 'Parte I', page: 10, items: [{ title: ' Cap. 1 ', page: 10, items: [] }, { title: 'Cap. 2', page: 25, items: [] }] },
      { title: 'Sem destino', page: null, items: [] },
    ]);
    expect(chapterOf(1)).toBeNull();
    expect(chapterOf(5)).toBe('Prefácio');
    expect(chapterOf(10)).toBe('Cap. 1');
    expect(chapterOf(30)).toBe('Cap. 2');
  });
});

describe('groupConsecutive', () => {
  it('starts a group whenever the heading changes', () => {
    const groups = groupConsecutive([1, 2, 5, 6, 2], (n) => (n < 5 ? 'a' : 'b'));
    expect(groups).toEqual([
      { title: 'a', items: [1, 2] },
      { title: 'b', items: [5, 6] },
      { title: 'a', items: [2] },
    ]);
  });
});
