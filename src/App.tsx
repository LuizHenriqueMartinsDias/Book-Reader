import { useEffect, useState } from 'react';
import LibraryPage from './features/library/LibraryPage';
import ReaderPage from './features/reader/ReaderPage';
import { useUi } from './store/ui';

const parseRoute = () => {
  const m = location.hash.match(/^#\/read\/([^/?]+)/);
  return m ? { name: 'reader' as const, bookId: decodeURIComponent(m[1]) } : { name: 'library' as const };
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

  return route.name === 'reader' ? <ReaderPage key={route.bookId} bookId={route.bookId} /> : <LibraryPage />;
}
