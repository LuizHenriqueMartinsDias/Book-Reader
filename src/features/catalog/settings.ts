import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Language } from '../../lib/catalog/types';

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'all', label: 'Todos os idiomas' },
  { id: 'por', label: 'Português' },
  { id: 'eng', label: 'Inglês' },
  { id: 'spa', label: 'Espanhol' },
  { id: 'fre', label: 'Francês' },
];

const MAX_RECENT = 8;

interface CatalogSettings {
  language: Language;
  /** Internet Archive: only public domain / openly licensed works. */
  openOnly: boolean;
  recentSearches: string[];
  setLanguage: (language: Language) => void;
  setOpenOnly: (openOnly: boolean) => void;
  addRecent: (query: string) => void;
  clearRecent: () => void;
}

export const useCatalogSettings = create<CatalogSettings>()(
  persist(
    (set) => ({
      language: 'por',
      openOnly: true,
      recentSearches: [],
      setLanguage: (language) => set({ language }),
      setOpenOnly: (openOnly) => set({ openOnly }),
      addRecent: (query) =>
        set((s) => ({ recentSearches: [query, ...s.recentSearches.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, MAX_RECENT) })),
      clearRecent: () => set({ recentSearches: [] }),
    }),
    { name: 'book-reader-catalog' },
  ),
);
