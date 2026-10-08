import { useEffect, useState } from 'react';
import CatalogPage from './features/catalog/CatalogPage';
import LibraryPage from './features/library/LibraryPage';
import ReaderPage from './features/reader/ReaderPage';
import { useUi } from './store/ui';

const parseRoute = () => {
  const m = location.hash.match(/^#\/read\/([^/?]+)/);
  if (m) return { name: 'reader' as const, bookId: decodeURIComponent(m[1]) };
  return location.hash.startsWith('#/explorar') ? { name: 'catalog' as const } : { name: 'library' as const };
};

export const navigate = (hash: string) => {
  location.hash = hash;
};

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  if (route.name === 'reader') return <ReaderPage key={route.bookId} bookId={route.bookId} />;
  return route.name === 'catalog' ? <CatalogPage /> : <LibraryPage />;
}
