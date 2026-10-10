import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../App';
import NotebookEditor from '../notes/editor/NotebookEditor';
import ReaderPage, { type StartAt } from '../reader/ReaderPage';
import { useUi } from '../../store/ui';
import { useSplit, type Pane } from './splitStore';

const MIN = 0.25;
const RATIO_KEY = 'book-reader-split';

/** Book and notebook side by side (top/bottom when the screen is in portrait), with a draggable divider. */
export default function SplitView({ bookId, notebookId, startAt }: { bookId: string; notebookId: string; startAt: StartAt }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => Number(localStorage.getItem(RATIO_KEY)) || 0.5);
  const [portrait, setPortrait] = useState(() => matchMedia('(orientation: portrait)').matches);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    useSplit.setState({ active: 'reader', notebookId });
    useUi.getState().set({ lastSplit: { bookId, notebookId } });
    return () => useSplit.setState({ active: null, notebookId: null });
  }, [bookId, notebookId]);

  useEffect(() => {
    const mq = matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RATIO_KEY, String(ratio));
    } catch {
      // not essential
    }
  }, [ratio]);

  const activate = (pane: Pane) => () => {
    if (useSplit.getState().active !== pane) useSplit.setState({ active: pane });
  };

  const onDividerMove = (e: React.PointerEvent) => {
    if (drag.current !== e.pointerId) return;
    const r = hostRef.current!.getBoundingClientRect();
    const f = portrait ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
    setRatio(Math.min(1 - MIN, Math.max(MIN, f)));
  };

  const first = `${ratio * 100}%`;
  return (
    <div ref={hostRef} className={`flex h-full ${portrait ? 'flex-col' : 'flex-row'}`}>
      <div className="relative min-h-0 min-w-0 overflow-hidden" style={{ flexBasis: first, flexShrink: 0 }} onPointerDownCapture={activate('reader')}>
        <ReaderPage bookId={bookId} startAt={startAt} />
      </div>
      <div
        role="separator"
        aria-orientation={portrait ? 'horizontal' : 'vertical'}
        className={`group z-10 flex shrink-0 touch-none items-center justify-center bg-[var(--border)] ${portrait ? 'h-2.5 cursor-row-resize' : 'w-2.5 cursor-col-resize'}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = e.pointerId;
        }}
        onPointerMove={onDividerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className={`rounded-full bg-[var(--muted)] opacity-60 group-hover:opacity-100 ${portrait ? 'h-1 w-10' : 'h-10 w-1'}`} />
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden" onPointerDownCapture={activate('notes')}>
        <NotebookEditor notebookId={notebookId} onClose={() => navigate(`#/read/${bookId}`)} />
      </div>
    </div>
  );
}
