/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { saveSharedFiles } from './lib/sharedFiles';

declare const self: ServiceWorkerGlobalScope;

// Books shared from other apps (manifest `share_target`) arrive as a POST to ./compartilhar: park
// the files for the page and open it on the route that imports them. Registered before
// Workbox's routes, which only answer GETs.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== new URL('compartilhar', self.registration.scope).pathname) return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const files = form.getAll('books').filter((f): f is File => f instanceof File);
      await saveSharedFiles(files, self.registration.scope);
      return Response.redirect(new URL('./#/compartilhado', self.registration.scope).href, 303);
    })(),
  );
});

// What the generated service worker did before: update right away, work offline.
self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));
