import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadFonts } from './lib/fonts';
import './index.css';

registerSW({
  immediate: true,
  // The browser only looks for a new version when the app is opened; an installed app on a
  // tablet mostly comes back from the background instead, so look then too.
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    });
  },
});
loadFonts();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
