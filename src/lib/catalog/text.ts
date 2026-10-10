const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Catalog descriptions come as HTML or plain text; keep the text and its paragraphs. */
export function plainText(html: string | string[] | undefined): string {
  const s = Array.isArray(html) ? html.join('\n\n') : (html ?? '');
  return s
    .replace(/<\s*(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Subjects as short labels: "Brazilian fiction -- 19th century" → "Brazilian fiction",
 * "Category: Novels" → "Novels"; Archive items often pack several into one "a; b; c" string.
 */
export function subjectLabels(subjects: (string | undefined)[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of subjects.flatMap((s) => (s ?? '').split(';'))) {
    const label = raw.replace(/^Category:\s*/i, '').replace(/^(PT|FR|DE|ES)\s+/, '').replace(/\s*--.*$/, '').replace(/[.,\s]+$/, '').trim();
    if (label.length < 2 || label.length > 40) continue;
    const id = label.toLocaleLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(label);
    if (out.length === max) break;
  }
  return out;
}

/** Comparable form of a title or name: lowercase, no accents or punctuation. */
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
