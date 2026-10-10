import type { OutlineItem } from '../../lib/pdf';

/** The PDF chapter a page belongs to: the last outline entry starting on or before it. */
export function chapterAtPage(outline: OutlineItem[]): (page: number) => string | null {
  const starts: { page: number; title: string }[] = [];
  const walk = (items: OutlineItem[]) =>
    items.forEach((i) => {
      if (i.page !== null) starts.push({ page: i.page, title: i.title.trim() });
      walk(i.items);
    });
  walk(outline);
  // Stable sort keeps a parent before the child that starts on the same page; the child wins.
  starts.sort((a, b) => a.page - b.page);
  return (page) => {
    let title: string | null = null;
    for (const s of starts) {
      if (s.page > page) break;
      title = s.title;
    }
    return title;
  };
}

/** Runs of consecutive items with the same heading (items come in reading order). */
export function groupConsecutive<T>(items: T[], heading: (item: T) => string | null): { title: string | null; items: T[] }[] {
  const groups: { title: string | null; items: T[] }[] = [];
  for (const item of items) {
    const title = heading(item);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}
