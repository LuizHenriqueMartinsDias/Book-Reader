import { useEffect, useRef } from 'react';
import { penButtonClicks } from '../../lib/penButton';

const TYPES = ['pointerdown', 'pointermove', 'pointerover', 'pointerup', 'pointercancel'] as const;

/** Calls `onClick` when the pen's button is clicked with the pen in the air (see `penButtonClicks`). */
export function usePenButtonClick(onClick: () => void) {
  const latest = useRef(onClick);
  latest.current = onClick;
  useEffect(() => {
    const feed = penButtonClicks();
    const on = (e: PointerEvent) => {
      if (feed({ type: e.type, pointerType: e.pointerType, buttons: e.buttons, pressure: e.pressure, time: e.timeStamp })) latest.current();
    };
    for (const t of TYPES) window.addEventListener(t, on, { capture: true, passive: true });
    return () => {
      for (const t of TYPES) window.removeEventListener(t, on, { capture: true });
    };
  }, []);
}
