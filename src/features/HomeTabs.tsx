import { BookOpen, NotebookPen } from 'lucide-react';

/** Switches between the bookshelf and the notebooks. */
export default function HomeTabs({ active }: { active: 'books' | 'notes' }) {
  const tab = (id: 'books' | 'notes', href: string, Icon: typeof BookOpen, label: string) => (
    <a
      href={href}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${active === id ? 'bg-[var(--panel)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--app-fg)]'}`}
    >
      <Icon className="size-4" /> {label}
    </a>
  );
  return (
    <nav className="mr-auto flex rounded-lg bg-[var(--app-bg)] p-0.5">
      {tab('books', '#/', BookOpen, 'Livros')}
      {tab('notes', '#/cadernos', NotebookPen, 'Cadernos')}
    </nav>
  );
}
