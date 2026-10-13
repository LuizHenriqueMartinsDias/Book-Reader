/**
 * Meanings of a word or symbol from the Portuguese Wiktionary (pt.wiktionary.org), which also
 * has symbols (∀, §) and words of other languages explained in Portuguese. Read from the entry's
 * HTML: a level-1 heading per language, then a heading per part of speech with its senses in a list.
 */

export interface DictEntry {
  /** "Português", "Inglês"… */
  language: string;
  /** Part of speech, as the entry names it: "Substantivo", "Forma verbal", "Símbolo"… */
  kind: string;
  senses: string[];
}

export interface DictResult {
  word: string;
  entries: DictEntry[];
  /** The entry on the Wiktionary site, to read it whole. */
  url: string;
  /** For an inflected form ("correram"), the entry of the word it comes from ("correr"). */
  base?: DictResult;
}

const API = 'https://pt.wiktionary.org/w/api.php';
const SITE = 'https://pt.wiktionary.org/wiki/';
/** Headings with lists that aren't meanings. */
const NOT_SENSES = /^(tradu|etimologia|pron[uú]ncia|sin[oô]nimo|ant[oô]nimo|ver também|refer[eê]ncia|anagrama|verbetes|express|fontes|no wikcion|vizinhan|termos|descendent|formas alternativas|hom[oó]fon|par[oô]nim|hiper[oô]nim|hip[oô]nim|cognat|conjuga|declina|liga[cç]|nota|cita[cç]|exemplo)/i;
/** Selections longer than this aren't looked up in the dictionary (only explained by the AI). */
export const MAX_LOOKUP = 60;

const PUNCT = `\\s"'“”‘’«»()\\[\\]{}.,;:!?…—–-`;
const EDGES = new RegExp(`^[${PUNCT}]+|[${PUNCT}]+$`, 'gu');

/** The selection as a dictionary word: punctuation around it and line-break hyphens taken out. */
export function lookupWord(selected: string) {
  const text = selected
    .replace(/­/g, '')
    .replace(/(\p{L})-\s+(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
  // A symbol on its own ("—", "…") stays as it is.
  return text.replace(EDGES, '') || text;
}

/** Whether the dictionary is worth asking: a word, an expression or a symbol, not a passage. */
export const lookupable = (word: string) => !!word && word.length <= MAX_LOOKUP && word.split(' ').length <= 4;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Text of an element without its stylesheets, examples, sub-lists and footnote marks. */
function textOf(el: Element, drop = 'style') {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(drop).forEach((n) => n.remove());
  return clean(copy.textContent ?? '');
}

/** The meanings in an entry's HTML (the API's `parse.text`), Portuguese first. */
export function parseEntry(html: string): { entries: DictEntry[]; base?: string } {
  const root = new DOMParser().parseFromString(html, 'text/html').querySelector('.mw-parser-output');
  const entries: DictEntry[] = [];
  let base: string | undefined;
  let language = '';
  let kind = '';
  for (const node of root?.children ?? []) {
    const heading = node.matches('.mw-heading') ? node.querySelector('h1, h2, h3, h4') : node.matches('h1, h2, h3, h4') ? node : null;
    if (heading) {
      // The language heading's text carries its stylesheet; its id is just the name.
      if (heading.tagName === 'H1') {
        language = heading.id.replace(/_/g, ' ');
        kind = '';
      } else kind = textOf(heading);
      continue;
    }
    if (node.tagName !== 'OL' || !language || !kind || NOT_SENSES.test(kind)) continue;
    const senses: string[] = [];
    for (const li of node.children) {
      if (li.tagName !== 'LI') continue;
      const text = textOf(li, 'style, dl, ul, ol, sup, .mw-editsection');
      if (text) senses.push(text);
    }
    if (!senses.length) continue;
    const same = entries.find((e) => e.language === language && e.kind === kind);
    if (same) same.senses.push(...senses);
    else entries.push({ language, kind, senses });
    // "Forma verbal: … do verbo correr", "plural de melancolia": the last link is the base word.
    if (!base && /^(forma|flex)/i.test(kind)) {
      const links = node.querySelector('li')?.querySelectorAll('a[title]');
      const last = links?.[links.length - 1]?.getAttribute('title');
      if (last && !last.includes(':')) base = last;
    }
  }
  entries.sort((a, b) => Number(b.language === 'Português') - Number(a.language === 'Português'));
  // Only when the word is just a form of another ("manga" is a fruit too, not only "mangar").
  const onlyForms = entries.filter((e) => e.language === entries[0]?.language).every((e) => /^(forma|flex)/i.test(e.kind));
  return { entries, base: onlyForms ? base : undefined };
}

async function fetchEntry(page: string, signal?: AbortSignal): Promise<{ title: string; html: string } | null> {
  const params = new URLSearchParams({ action: 'parse', page, prop: 'text', format: 'json', formatversion: '2', redirects: '1', origin: '*' });
  const res = await fetch(`${API}?${params}`, { signal });
  if (!res.ok) throw new Error(`Wikcionário: ${res.status}`);
  const data = (await res.json()) as { parse?: { title: string; text: string }; error?: { code: string } };
  if (data.error?.code === 'missingtitle' || data.error?.code === 'invalidtitle') return null;
  if (!data.parse) throw new Error(data.error?.code ?? 'Wikcionário: resposta inesperada');
  return { title: data.parse.title, html: data.parse.text };
}

async function find(word: string, signal?: AbortSignal): Promise<(DictResult & { baseWord?: string }) | null> {
  // As written, then in lower case ("Saudade" at the start of a sentence is "saudade").
  for (const page of new Set([word, word.toLowerCase()])) {
    const found = await fetchEntry(page, signal);
    if (!found) continue;
    const { entries, base } = parseEntry(found.html);
    if (entries.length) return { word: found.title, entries, url: SITE + encodeURIComponent(found.title.replace(/ /g, '_')), baseWord: base };
  }
  return null;
}

const cache = new Map<string, Promise<DictResult | null>>();

/** The meanings of `word`, or null when the Wiktionary has no entry for it. */
export function lookUp(word: string, signal?: AbortSignal): Promise<DictResult | null> {
  const known = cache.get(word);
  if (known) return known;
  const pending = (async () => {
    const found = await find(word, signal);
    if (!found) return null;
    const { baseWord, ...result } = found;
    if (baseWord && baseWord !== result.word) {
      const base = await find(baseWord, signal).catch(() => null);
      if (base) result.base = { word: base.word, entries: base.entries, url: base.url };
    }
    return result;
  })();
  cache.set(word, pending);
  // A failure (offline, cancelled) can be tried again.
  pending.catch(() => cache.delete(word));
  return pending;
}
