/* Casa Camp — part «web instal·lable» del panell: service worker, instal·lació i avisos del sistema.
   Crea `window.CassovallPWA`. No toca dades. El permís dels avisos només es demana quan es toca el botó
   (`demana()`), mai en carregar. Si el navegador no ho admet, tot torna «no» i no peta. */
(function () {
  'use strict';

  let registre = null; // Promise de la registració del service worker (o null si no n'hi ha)
  let promptInstalacio = null; // `beforeinstallprompt` (Chrome i Android): el diu el navegador quan es pot instal·lar

  const suportaSW = () => 'serviceWorker' in navigator;
  const suportaAvisos = () => suportaSW() && 'Notification' in window;

  // Obre el panell des de la pantalla d'inici (Android: display-mode; iPhone: navigator.standalone)
  const instalada = () => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    } catch (e) {
      return false;
    }
  };
  const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function registra() {
    if (registre || !suportaSW()) return registre;
    registre = navigator.serviceWorker.register('sw.js').catch(() => null);
    return registre;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalacio = e;
    window.dispatchEvent(new CustomEvent('pwa-canvi'));
  });
  window.addEventListener('appinstalled', () => {
    promptInstalacio = null;
    window.dispatchEvent(new CustomEvent('pwa-canvi'));
  });

  async function installa() {
    if (!promptInstalacio) return 'no-disponible';
    const p = promptInstalacio;
    promptInstalacio = null;
    p.prompt();
    const r = await p.userChoice.catch(() => ({ outcome: 'tancat' }));
    window.dispatchEvent(new CustomEvent('pwa-canvi'));
    return r.outcome;
  }

  // 'default' | 'granted' | 'denied' | 'no-suportat'
  const permis = () => (suportaAvisos() ? Notification.permission : 'no-suportat');

  async function demana() {
    if (!suportaAvisos()) return 'no-suportat';
    try {
      return await Notification.requestPermission();
    } catch (e) {
      return Notification.permission;
    }
  }

  // Notificació del sistema. `tag` evita que la mateixa surti dues vegades (p. ex. des de dues pestanyes).
  async function mostra(n) {
    if (permis() !== 'granted') return false;
    try {
      const reg = (await registra()) && (await navigator.serviceWorker.ready);
      if (!reg) return false;
      await reg.showNotification(n.titol, {
        body: n.cos || '',
        tag: n.tag || undefined,
        icon: 'icones/icona-192.png',
        badge: 'icones/icona-192.png',
        data: { hash: n.hash || '' },
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  window.CassovallPWA = {
    registra,
    suportaSW,
    suportaAvisos,
    instalada,
    esIOS,
    instalable: () => !!promptInstalacio,
    installa,
    permis,
    demana,
    mostra,
  };

  registra();
})();
