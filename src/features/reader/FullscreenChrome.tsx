import { ChevronDown, ChevronUp, Minimize } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  fullscreen: boolean;
  onExit: () => void;
  /** The reader's toolbar. */
  toolbar: ReactNode;
}

/**
 * Shows the toolbar normally; in fullscreen it's tucked away for reading, with a small
 * floating control to bring it back or leave fullscreen.
 */
export default function FullscreenChrome({ fullscreen, onExit, toolbar }: Props) {
  const [showBar, setShowBar] = useState(false);
  useEffect(() => setShowBar(false), [fullscreen]);

  if (!fullscreen) return <>{toolbar}</>;
  return (
    <>
      {showBar && toolbar}
      <div
        style={{ top: showBar ? 56 : 8 }}
        className="fixed right-2 z-40 flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--panel)]/80 p-0.5 shadow-lg backdrop-blur"
      >
        <button
          className="rounded-full p-2 hover:bg-[var(--app-bg)]"
          title={showBar ? 'Esconder barra' : 'Mostrar barra'}
          onClick={() => setShowBar((v) => !v)}
        >
          {showBar ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <button className="rounded-full p-2 hover:bg-[var(--app-bg)]" title="Sair da tela cheia" onClick={onExit}>
          <Minimize className="size-4" />
        </button>
      </div>
    </>
  );
}
