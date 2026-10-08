import { useCallback, useEffect, useState } from 'react';

/** Browser fullscreen (hides the status and navigation bars on Android). */
export function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  const supported = document.fullscreenEnabled ?? false;

  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leaving the reader leaves fullscreen too.
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );

  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }, []);

  return { active, supported, toggle };
}
