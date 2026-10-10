import { describe, expect, it } from 'vitest';
import fixture from './fixtures/domcasmurro_1899.json';
import { archiveItem, buildQuery, classifyRights, dedupe, displayName, pickBookFile } from './archive';

describe('buildQuery', () => {
  it('limits to public PDFs and applies the license and language filters', () => {
    const q = buildQuery({ query: 'dom casmurro', language: 'por', openOnly: true });
    expect(q).toContain('(title:(dom casmurro)^4 OR creator:(dom casmurro)^3 OR (dom casmurro)) AND mediatype:texts AND format:(pdf OR epub)');
    expect(q).toContain('NOT access-restricted-item:true');
    expect(q).toContain('(licenseurl:* OR year:[* TO 1929])');
    expect(q).toContain('language:(por OR portuguese OR pt OR português OR portugues)');
  });

  it('strips query syntax so user input cannot widen the filters', () => {
    const q = buildQuery({ query: 'x) OR (mediatype:movies', language: 'all', openOnly: false });
    expect(q.startsWith('(title:(x mediatype movies)^4 OR creator:(x mediatype movies)^3 OR (x mediatype movies)) AND')).toBe(true);
    expect(q).not.toContain('mediatype:movies');
  });

  it('filters by any of several authors, in any name order, and by subjects', () => {
    const q = buildQuery({ query: '', authors: ['Machado de Assis', 'Eça de Queirós'], subjects: ['poesia', 'short stories'], language: 'all', openOnly: false });
    expect(q.startsWith('*:* AND creator:((Machado AND Assis) OR (Eça AND Queirós)) AND subject:(poesia OR "short stories") AND')).toBe(true);
  });
});

describe('archive items', () => {
  it('shows library-style names the usual way round', () => {
    expect(displayName('Assis, Machado de, 1839-1908')).toBe('Machado de Assis');
    expect(displayName('Alencar, José Martiniano de, 1829-1877.')).toBe('José Martiniano de Alencar');
    expect(displayName('Machado de Assis')).toBe('Machado de Assis');
  });

  it('reads the description as text and splits packed subjects', () => {
    const item = archiveItem({ identifier: 'x', title: 'T', description: 'Um <b>romance</b> &amp; mais<br>linha', subject: 'romance; literatura brasileira' });
    expect(item.summary).toBe('Um romance & mais\nlinha');
    expect(item.subjects).toEqual(['romance', 'literatura brasileira']);
  });

  it('leaves out subjects that only repeat the title, author or year', () => {
    const item = archiveItem({ identifier: 'x', title: 'Dom Casmurro', creator: 'Machado de Assis', subject: ['livro', 'Machado de Assis', 'dom casmurro', '1899', 'realismo'] });
    expect(item.subjects).toEqual(['realismo']);
  });

  it('drops copies of the same title by the same author', () => {
    const items = [
      archiveItem({ identifier: 'a', title: 'Dom Casmurro', creator: 'Machado de Assis' }),
      archiveItem({ identifier: 'b', title: 'Dom  casmurro.', creator: 'Assis, Machado de' }),
      archiveItem({ identifier: 'c', title: 'Dom Casmurro', creator: 'Outro Autor' }),
    ];
    expect(dedupe(items).map((i) => i.key)).toEqual(['ia:a', 'ia:c']);
  });
});

describe('classifyRights', () => {
  it('reads public domain marks, CC licenses and old publication years', () => {
    expect(classifyRights({ identifier: 'a', licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/' }).kind).toBe('public-domain');
    expect(classifyRights({ identifier: 'a', licenseurl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/br/' })).toEqual({
      kind: 'open-license',
      label: 'CC BY-NC-SA 3.0',
    });
    expect(classifyRights({ identifier: 'a', year: 1899 }).kind).toBe('public-domain');
    expect(classifyRights({ identifier: 'a', date: '1975-01-01T00:00:00Z' }).kind).toBe('unknown');
  });
});

describe('pickBookFile', () => {
  it('picks the uploaded PDF of a real item over its derived EPUB', () => {
    expect(pickBookFile('domcasmurro_1899', fixture.files)).toEqual({
      name: '000181844.pdf',
      size: 31346440,
      format: 'pdf',
      url: 'https://archive.org/download/domcasmurro_1899/000181844.pdf',
    });
  });

  it('prefers the original upload, then the Text PDF, then the largest', () => {
    const files = [
      { name: 'a_text.pdf', format: 'Text PDF', size: '10', source: 'derivative' },
      { name: 'b.pdf', format: 'Image Container PDF', size: '99', source: 'original' },
    ];
    expect(pickBookFile('x', files)?.name).toBe('b.pdf');
    expect(pickBookFile('x', [files[0], { name: 'c.pdf', size: '500', source: 'derivative' }])?.name).toBe('a_text.pdf');
    expect(pickBookFile('x', [{ name: 'notes.txt' }])).toBeNull();
    expect(pickBookFile('id with space', [{ name: 'dir/my book.pdf' }])?.url).toBe('https://archive.org/download/id%20with%20space/dir/my%20book.pdf');
  });

  it('takes an uploaded EPUB before PDFs derived from scans', () => {
    const files = [
      { name: 'book.epub', format: 'EPUB', size: '200', source: 'original' },
      { name: 'book_text.pdf', format: 'Text PDF', size: '900', source: 'derivative' },
    ];
    expect(pickBookFile('x', files)).toMatchObject({ name: 'book.epub', format: 'epub' });
  });
});
