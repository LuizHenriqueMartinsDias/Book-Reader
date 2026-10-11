import { useEffect, useState } from 'react';

/** The current time, every second while `on` and the page is visible. */
export function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!on) return;
    const t = setInterval(() => document.visibilityState === 'visible' && setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
