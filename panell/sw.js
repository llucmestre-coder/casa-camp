/* Casa Camp — service worker del panell (abast: /panell/). Fa dues coses:
   1. Desa el panell perquè s'obri sense connexió: primer la xarxa i, si falla, el que hi ha desat.
   2. Obre el panell (a la comanda o tanda que toqui) quan es toca una notificació.
   Les notificacions les mostra la pàgina amb `registration.showNotification` (maqueta, sense servidor). A la versió
   real serien Web Push, i aquí hi aniria el gestor `push`.
   PENDENT: les icones són provisionals (logo actual); en canviar-les, pujar VERSIO perquè es tornin a desar. */
'use strict';

const VERSIO = 'casa-camp-panell-v1';
const FITXERS = [
  './', './index.html', './moduls.js', './pwa.js', './manifest.webmanifest',
  './icones/icona-192.png', './icones/icona-512.png', './icones/icona-maskable-512.png',
  '../css/styles.css', '../css/panell.css',
  '../js/dades.js', '../js/magatzem.js', '../js/comu.js', '../js/panell.js',
  '../assets/logo.png', '../assets/favicon.ico', '../assets/favicon-32.png', '../assets/apple-touch-icon.png',
  '../assets/fonts/schibsted-grotesk-latin.woff2', '../assets/fonts/schibsted-grotesk-latin-ext.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIO).then((cau) =>
      // Un fitxer que falli no ha d'impedir instal·lar els altres
      Promise.all(FITXERS.map((f) => cau.add(f).catch(() => null))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n.startsWith('casa-camp-panell-') && n !== VERSIO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(r)
      .then((resposta) => {
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(VERSIO).then((cau) => cau.put(r, copia)).catch(() => null);
        }
        return resposta;
      })
      .catch(() =>
        // La mateixa pàgina amb altre `?…` (p. ex. `?presentacio`) és el mateix fitxer
        caches.match(r, { ignoreSearch: true }).then((desat) => desat || (r.mode === 'navigate' ? caches.match('./index.html') : undefined) || Response.error()),
      ),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.hash) || '';
  const desti = new URL('./?presentacio' + hash, self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((finestres) => {
      const oberta = finestres.find((f) => f.url.startsWith(self.registration.scope));
      if (oberta) {
        return oberta.focus().then(() => {
          if ('navigate' in oberta && hash) return oberta.navigate(desti).catch(() => null);
          return null;
        });
      }
      return self.clients.openWindow(desti);
    }),
  );
});
