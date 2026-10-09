import { create } from 'zustand';
import { navigate } from '../../App';
import type { QuoteSource } from '../../db/schema';
import { useSplit } from '../split/splitStore';
import { useToast } from '../Toast';
import NotebookPicker from './NotebookPicker';
import { sendQuote } from './quotes';

interface Pending {
  text: string;
  source: QuoteSource;
}

export const useQuoteSend = create<{ pending: Pending | null }>(() => ({ pending: null }));

async function deliver(notebookId: string, { text, source }: Pending) {
  try {
    const nb = await sendQuote(notebookId, text, source);
    const open = useSplit.getState().notebookId === notebookId;
    useToast
      .getState()
      .show(`Enviado para “${nb.title}”`, open ? undefined : { label: 'Abrir ao lado', run: () => navigate(`#/read/${source.bookId}?caderno=${notebookId}`) });
  } catch (e) {
    useToast.getState().show(`Não foi possível enviar: ${e instanceof Error ? e.message : e}`);
  }
}

/** Sends a quote: straight to the notebook open beside the book, otherwise after picking one. */
export function sendQuoteToNotebook(pending: Pending) {
  const open = useSplit.getState().notebookId;
  if (open) deliver(open, pending);
  else useQuoteSend.setState({ pending });
}

export default function SendQuoteDialog() {
  const pending = useQuoteSend((s) => s.pending);
  if (!pending) return null;
  const close = () => useQuoteSend.setState({ pending: null });
  return (
    <NotebookPicker
      title="Enviar trecho para…"
      onClose={close}
      onPick={(id) => {
        close();
        deliver(id, pending);
      }}
    />
  );
}
