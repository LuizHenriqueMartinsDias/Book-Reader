import { useEffect, useState } from 'react';
import CatalogPage from './features/catalog/CatalogPage';
import { runAutoBackup } from './features/library/BackupPanel';
import LibraryPage from './features/library/LibraryPage';
import SharedImport, { receiveOpenedFiles } from './features/library/SharedImport';
import NotebookEditor from './features/notes/editor/NotebookEditor';
import NotesHome from './features/notes/NotesHome';
import SendQuoteDialog from './features/notes/SendQuoteDialog';
import ReaderPage, { type StartAt } from './features/reader/ReaderPage';
import SplitView from './features/split/SplitView';
import Toast from './features/Toast';
import { useUi } from './store/ui';

type Route =
  | { name: 'library' }
  | { name: 'catalog'; path: string; params: URLSearchParams }
  | { name: 'notes' }
  | { name: 'shared' }
  | { name: 'notebook'; notebookId: string }
  | { name: 'reader'; bookId: string; startAt: StartAt; notebookId: string | null };

/**
 * #/ · #/explorar[/…] (see features/catalog/routes.ts) · #/cadernos · #/caderno/<id> ·
 * #/read/<book>[?p=<page>|cfi=<cfi>][&caderno=<notebook>] (the notebook opens side by side) ·
 * #/compartilhado (books shared from other apps).
 */
function parseRoute(): Route {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const read = path.match(/^\/read\/([^/]+)/);
  if (read) {
    const p = Number(params.get('p'));
    return {
      name: 'reader',
      bookId: decodeURIComponent(read[1]),
      startAt: { page: p > 0 ? p : undefined, cfi: params.get('cfi') ?? undefined },
      notebookId: params.get('caderno'),
    };
  }
  const notebook = path.match(/^\/caderno\/([^/]+)/);
  if (notebook) return { name: 'notebook', notebookId: decodeURIComponent(notebook[1]) };
  if (path.startsWith('/cadernos')) return { name: 'notes' };
  if (path.startsWith('/compartilhado')) return { name: 'shared' };
  if (path.startsWith('/explorar')) return { name: 'catalog', path, params };
  return { name: 'library' };
}

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
    runAutoBackup();
    receiveOpenedFiles();
  }, []);

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
  }, [theme]);

  return (
    <>
      <Screen route={route} />
      <SendQuoteDialog />
      <Toast />
    </>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'reader':
      return route.notebookId ? (
        <SplitView key={`${route.bookId}|${route.notebookId}`} bookId={route.bookId} notebookId={route.notebookId} startAt={route.startAt} />
      ) : (
        <ReaderPage key={location.hash} bookId={route.bookId} startAt={route.startAt} />
      );
    case 'notebook':
      return <NotebookEditor key={route.notebookId} notebookId={route.notebookId} />;
    case 'notes':
      return <NotesHome />;
    case 'shared':
      return <SharedImport />;
    case 'catalog':
      return <CatalogPage path={route.path} params={route.params} />;
    default:
      return <LibraryPage />;
  }
}
