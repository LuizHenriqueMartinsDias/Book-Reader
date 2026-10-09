import { useEffect } from 'react';
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  action?: { label: string; run: () => void };
  show: (message: string, action?: ToastState['action']) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message, action) => set({ message, action }),
  hide: () => set({ message: null, action: undefined }),
}));

/** Brief confirmation at the bottom of the screen, with an optional action. */
export default function Toast() {
  const { message, action, hide } = useToast();
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, 4500);
    return () => clearTimeout(t);
  }, [message, hide]);
  if (!message) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-2xl">
      <span>{message}</span>
      {action && (
        <button
          className="font-semibold text-amber-400"
          onClick={() => {
            action.run();
            hide();
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
