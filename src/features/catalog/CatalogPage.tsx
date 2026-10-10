import BookView from './BookView';
import HomeView from './HomeView';
import { ListView, SearchView } from './ListViews';
import { parseCatalogView } from './routes';
import { useCatalogSettings } from './settings';

/** Free books to browse and download, store style: home, search, lists and each book's page. */
export default function CatalogPage({ path, params }: { path: string; params: URLSearchParams }) {
  const language = useCatalogSettings((s) => s.language);
  const view = parseCatalogView(path, params, language);
  switch (view.kind) {
    case 'book':
      return <BookView key={view.key} itemKey={view.key} />;
    case 'search':
      return <SearchView key={`${view.query}|${view.source}`} query={view.query} source={view.source} />;
    case 'list':
      return <ListView key={location.hash} list={view.list} />;
    default:
      return <HomeView />;
  }
}
