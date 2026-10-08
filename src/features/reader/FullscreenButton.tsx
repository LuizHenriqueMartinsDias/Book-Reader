import { Maximize } from 'lucide-react';

/** Toolbar button entering fullscreen; hidden where the browser can't (e.g. iPhone Safari). */
export default function FullscreenButton({ className, supported, onClick }: { className: string; supported: boolean; onClick: () => void }) {
  if (!supported) return null;
  return (
    <button className={className} title="Tela cheia" onClick={onClick}>
      <Maximize className="size-5" />
    </button>
  );
}
