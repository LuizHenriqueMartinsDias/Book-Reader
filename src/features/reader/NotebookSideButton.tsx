import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { navigate } from '../../App';
import NotebookPicker from '../notes/NotebookPicker';
import { useSplit } from '../split/splitStore';
import { useReader } from './readerStore';

/** Opens a notebook next to the book (hidden when one already is). */
export default function NotebookSideButton({ className }: { className: string }) {
  const [picking, setPicking] = useState(false);
  const split = useSplit((s) => s.notebookId);
  if (split) return null;
  return (
    <>
      <button className={className} title="Abrir caderno ao lado" onClick={() => setPicking(true)}>
        <NotebookPen className="size-5" />
      </button>
      {picking && (
        <NotebookPicker
          title="Abrir caderno ao lado"
          onClose={() => setPicking(false)}
          onPick={(id) => navigate(`#/read/${useReader.getState().bookId}?caderno=${id}`)}
        />
      )}
    </>
  );
}
