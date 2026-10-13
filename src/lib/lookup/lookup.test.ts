import { describe, expect, it } from 'vitest';
import { lookupable, lookupWord, parseEntry } from './dictionary';

/** The shape of a pt.wiktionary entry's HTML, trimmed. */
const heading = (level: number, id: string, text = id) =>
  `<div class="mw-heading mw-heading${level}"><h${level} id="${id}"><style>.lnklng{color:black}</style>${text}</h${level}><span class="mw-editsection">[editar]</span></div>`;
const entry = (...parts: string[]) => `<div class="mw-content-ltr mw-parser-output" lang="pt">${parts.join('\n')}</div>`;

describe('parseEntry', () => {
  it('reads the senses per language and part of speech, without examples or translations', () => {
    const html = entry(
      heading(1, 'Português'),
      heading(2, 'Substantivo'),
      '<table><tr><td>melancolias</td></tr></table><p><b>me.lan.co.li.a</b></p>',
      '<ol><li><a href="/wiki/tristeza" title="tristeza">tristeza</a> profunda<dl><dd>Exemplo: uma tarde de melancolia.</dd></dl></li>',
      '<li><style>.escopo{}</style>(<span class="escopo">psiquiatria</span>) estado de abatimento<sup>[1]</sup></li></ol>',
      heading(3, 'Tradução'),
      '<ol><li>melancholy</li></ol>',
      heading(1, 'Galego'),
      heading(2, 'Substantivo'),
      '<ol><li>melancolia</li></ol>',
    );
    expect(parseEntry(html)).toEqual({
      entries: [
        { language: 'Português', kind: 'Substantivo', senses: ['tristeza profunda', '(psiquiatria) estado de abatimento'] },
        { language: 'Galego', kind: 'Substantivo', senses: ['melancolia'] },
      ],
      base: undefined,
    });
  });

  it('puts Portuguese first and points an inflected form to its base word', () => {
    const html = entry(
      heading(1, 'Inglês'),
      heading(2, 'Verbo'),
      '<ol><li>to run (em inglês)</li></ol>',
      heading(1, 'Português'),
      heading(2, 'Forma verbal'),
      '<ol><li><a title="terceira">terceira</a> pessoa do plural do pretérito do verbo <a href="/wiki/correr" title="correr">correr</a></li></ol>',
    );
    const { entries, base } = parseEntry(html);
    expect(entries.map((e) => e.language)).toEqual(['Português', 'Inglês']);
    expect(base).toBe('correr');
  });

  it('leaves the base word out when the word has meanings of its own', () => {
    const html = entry(
      heading(1, 'Português'),
      heading(2, 'Substantivo'),
      '<ol><li>fruto da mangueira</li></ol>',
      heading(2, 'Forma verbal'),
      '<ol><li>terceira pessoa do verbo <a title="mangar">mangar</a></li></ol>',
    );
    expect(parseEntry(html).base).toBeUndefined();
  });

  it('finds nothing in a page without senses', () => {
    expect(parseEntry(entry(heading(1, 'Português'), '<p>Esboço.</p>')).entries).toEqual([]);
  });
});

describe('lookupWord', () => {
  it('takes punctuation and line-break hyphens out, but keeps a symbol on its own', () => {
    expect(lookupWord(' “Melancolia,” ')).toBe('Melancolia');
    expect(lookupWord('melan-\n colia')).toBe('melancolia');
    expect(lookupWord('pala­vra')).toBe('palavra');
    expect(lookupWord('§')).toBe('§');
    expect(lookupWord('—')).toBe('—');
    expect(lookupWord('(∀x)')).toBe('∀x');
  });

  it('looks up words and short expressions, not whole passages', () => {
    expect(lookupable('saudade')).toBe(true);
    expect(lookupable('à toa')).toBe(true);
    expect(lookupable('era uma vez um rei que')).toBe(false);
    expect(lookupable('')).toBe(false);
  });
});
