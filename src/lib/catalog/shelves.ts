import type { BrowseFilter, Language, Source } from './types';

/** The store front: genres, home shelves and featured authors. */

export interface Category {
  id: string;
  label: string;
  /** Words in a book's subjects that put it in this genre. */
  matches: string[];
  /** Gutenberg subject words, and Archive subjects (free text in any language, any of which may match). */
  subject: { gutenberg: string; archive: string[] };
}

export const CATEGORIES: Category[] = [
  { id: 'romances', label: 'Romances', matches: ['novel', 'fiction', 'romance', 'ficção'], subject: { gutenberg: 'fiction', archive: ['romance', 'romances', 'novel', 'novels', 'novela'] } },
  { id: 'contos', label: 'Contos', matches: ['short stories', 'contos', 'cuentos', 'nouvelles'], subject: { gutenberg: 'short stories', archive: ['contos', 'conto', 'short stories', 'cuentos', 'nouvelles'] } },
  { id: 'poesia', label: 'Poesia', matches: ['poetry', 'poesia', 'poems', 'poemas', 'poésie'], subject: { gutenberg: 'poetry', archive: ['poesia', 'poesias', 'poemas', 'poetry', 'poems', 'poésie'] } },
  { id: 'teatro', label: 'Teatro', matches: ['drama', 'plays', 'teatro', 'théâtre'], subject: { gutenberg: 'drama', archive: ['teatro', 'drama', 'plays', 'théâtre'] } },
  { id: 'aventura', label: 'Aventura', matches: ['adventure', 'aventura'], subject: { gutenberg: 'adventure', archive: ['aventura', 'aventuras', 'adventure', 'adventure stories'] } },
  { id: 'misterio', label: 'Mistério e policial', matches: ['mystery', 'detective', 'policial', 'mistério'], subject: { gutenberg: 'mystery', archive: ['mistério', 'policial', 'mystery', 'detective and mystery stories'] } },
  { id: 'ficcao-cientifica', label: 'Ficção científica', matches: ['science fiction', 'science-fiction', 'ficção científica'], subject: { gutenberg: 'science fiction', archive: ['ficção científica', 'science fiction', 'ciencia ficción'] } },
  { id: 'infantil', label: 'Infantil e juvenil', matches: ['children', 'juvenile', 'infantil'], subject: { gutenberg: 'juvenile', archive: ['literatura infantil', 'infantil', 'juvenile fiction', "children's literature"] } },
  { id: 'humor', label: 'Humor', matches: ['humor', 'humour'], subject: { gutenberg: 'humor', archive: ['humor', 'humour'] } },
  { id: 'filosofia', label: 'Filosofia', matches: ['philosophy', 'filosofia', 'philosophie'], subject: { gutenberg: 'philosophy', archive: ['filosofia', 'philosophy', 'philosophie', 'filosofía'] } },
  { id: 'historia', label: 'História', matches: ['history', 'história', 'historia', 'histoire'], subject: { gutenberg: 'history', archive: ['história', 'historia', 'history', 'histoire'] } },
  { id: 'biografias', label: 'Biografias', matches: ['biography', 'biografia', 'autobiography'], subject: { gutenberg: 'biography', archive: ['biografia', 'biografias', 'biography', 'autobiography'] } },
  { id: 'religiao', label: 'Religião', matches: ['religion', 'religião', 'bible', 'bíblia'], subject: { gutenberg: 'religion', archive: ['religião', 'religion', 'religión', 'bíblia', 'bible'] } },
];

/**
 * The genre of a book from its subjects, for "more like this": the first subject that names one,
 * by its most specific word ("Science fiction" is science fiction, not just fiction).
 */
export function categoryOf(subjects: string[]): Category | null {
  for (const subject of subjects) {
    const s = subject.toLocaleLowerCase();
    let best: { category: Category; length: number } | null = null;
    for (const category of CATEGORIES)
      for (const word of category.matches)
        if (new RegExp(`(^|[^\\p{L}])${word}`, 'u').test(s) && word.length > (best?.length ?? 0)) best = { category, length: word.length };
    if (best) return best.category;
  }
  return null;
}

export interface Shelf {
  id: string;
  title: string;
  subtitle?: string;
  /** Where its preview on the home screen comes from; "Ver tudo" lists every catalog that supports the filter. */
  source: Source;
  filter: BrowseFilter;
}

/** Classic authors of each language, for the author chips and a shelf of their books. */
const AUTHORS: Record<Exclude<Language, 'all'>, string[]> = {
  por: ['Machado de Assis', 'José de Alencar', 'Eça de Queirós', 'Luís de Camões', 'Aluísio Azevedo', 'Lima Barreto', 'Castro Alves', 'Camilo Castelo Branco', 'Olavo Bilac', 'Júlio Dinis'],
  eng: ['Jane Austen', 'Charles Dickens', 'Mark Twain', 'Arthur Conan Doyle', 'Edgar Allan Poe', 'William Shakespeare', 'Mary Shelley', 'Oscar Wilde'],
  spa: ['Miguel de Cervantes', 'Benito Pérez Galdós', 'Gustavo Adolfo Bécquer', 'Rubén Darío', 'Leopoldo Alas', 'Emilia Pardo Bazán'],
  fre: ['Victor Hugo', 'Jules Verne', 'Alexandre Dumas', 'Honoré de Balzac', 'Émile Zola', 'Gustave Flaubert', 'Guy de Maupassant'],
};

export const featuredAuthors = (language: Language) => (language === 'all' ? [...AUTHORS.eng.slice(0, 4), ...AUTHORS.por.slice(0, 4)] : AUTHORS[language]);

const LANGUAGE_NAMES: Record<Exclude<Language, 'all'>, string> = { por: 'em língua portuguesa', eng: 'em inglês', spa: 'em espanhol', fre: 'em francês' };

const categoryShelf = (id: string, title: string): Shelf => {
  const category = CATEGORIES.find((c) => c.id === id)!;
  return { id: `categoria:${id}`, title, source: 'gutenberg', filter: { subject: category.subject } };
};

export function homeShelves(language: Language): Shelf[] {
  return [
    { id: 'populares', title: 'Mais baixados', subtitle: 'Project Gutenberg', source: 'gutenberg', filter: {} },
    {
      id: 'classicos',
      title: language === 'all' ? 'Grandes autores' : `Clássicos ${LANGUAGE_NAMES[language]}`,
      subtitle: 'Internet Archive',
      source: 'archive',
      filter: { authors: featuredAuthors(language) },
    },
    categoryShelf('romances', 'Romances'),
    categoryShelf('poesia', 'Poesia'),
    categoryShelf('contos', 'Contos'),
    categoryShelf('teatro', 'Teatro'),
    categoryShelf('aventura', 'Aventura'),
    categoryShelf('filosofia', 'Filosofia'),
  ];
}
