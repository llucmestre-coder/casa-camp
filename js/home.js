/* Casa Camp — home: la franja de la tanda, el bloc de la tanda de la secció del lot, les peces, els preus i la barra
   fixa del mòbil. Tot ho llegeix de js/dades.js i js/magatzem.js (res no s'escriu a mà). Textos: PLA-COPY.md §1.
   La pàgina de compra és compra.html (js/compra.js). */
(function () {
  'use strict';

  const D = window.CassovallDades;
  const M = window.CassovallMagatzem;
  const C = window.CasaCamp;
  const el = (id) => document.getElementById(id);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const kgPeça = (grams) => String(grams / 1000).replace('.', ',') + ' kg';

  // Les frases amb el nombre de lots o els dies d'entrega es compten a partir del text de l'HTML (que és el de reserva)
  $$('[data-places]').forEach((p) => {
    p.dataset.plantilla = p.textContent.replace(/\b26\b/g, '{places}');
  });
  $$('[data-dies]').forEach((p) => {
    p.dataset.plantilla = p.textContent.replace(/\b00 dies\b/g, '{dies} dies');
  });

  function pintaFix() {
    el('l-preu').textContent = D.preuLots(1).etiqueta;
    el('l-preu-kg').textContent = D.preuPerKg().etiqueta;
    ['mitja-canal', 'canal'].forEach((id) => {
      el('c-preu-kg-' + id).textContent = D.preuPerKgCanal(id);
    });
    el('l-llista').innerHTML = D.peces.map((p) => `<li><span>${C.esc(p.nom)}</span><span>${kgPeça(p.grams)}</span></li>`).join('');
  }

  // La fitxa ja no porta selector de quantitat (en Lluc, 13/11/2026): els lots es trien a la pàgina de compra
  // (compra.html, js/compra.js). L'enllaç es refà aquí perquè porti ?presentacio.
  el('l-demana').href = C.ambPresentacio('compra.html');

  // La barra de la tanda, en un tram per lot (js/moviment.js)
  function barra(id, o) {
    Moviment.tanda(el(id), { places: o.places, reservats: o.lots });
  }

  function pinta() {
    const t = M.tandaActual();
    if (!t) return;
    const o = t.ocupacio;
    const places = o.places;
    const queden = o.lliures;
    // En Lluc, 13/11/2026 (abans «Tanda oberta fins al {data}»). La data és l'últim dia per demanar, no el dia que surt
    // l'enviament: per això «demana fins al».
    const oberta = 'Proper enviament: demana fins al ' + C.dataCurta(t.dataLimit);

    // Franja sota el hero (en Lluc, 02/11/2026: «Propera tanda: {data}» es llegia com el dia que arriba la carn)
    el('fr-data').textContent = oberta;
    el('fr-queden').textContent = queden === 1 ? 'hi queda 1 lot' : `hi queden ${queden} lots`;
    barra('fr-barra', o);

    // La tanda dins de la caixa de compra del lot, com a informació de compra
    el('t-titol').textContent = oberta;
    el('t-queden').textContent = `${queden === 1 ? 'Hi queda 1 lot' : `Hi queden ${queden} lots`} de ${places}. Si s'omple abans, es tanca abans; si no, surt igualment.`;
    const pb = el('t-barra');
    pb.setAttribute('aria-valuemax', places);
    pb.setAttribute('aria-valuenow', o.lots);
    pb.setAttribute('aria-label', `Lots reservats a la tanda: ${o.lots} de ${places}`);
    barra('t-barra', o);
    el('t-entrega').textContent = `Uns ${C.diesEntrega()} dies després que es tanqui la tanda.`;

    // Barra fixa del mòbil
    // Sense número de tanda, com la franja (jutge, 02/11/2026: al comprador no li diu res)
    el('dm-text').textContent = queden === 1 ? 'Hi queda 1 lot' : `Hi queden ${queden} lots`;

    // Preguntes
    $$('[data-places]').forEach((p) => {
      p.textContent = p.dataset.plantilla.replace(/\{places\}/g, places);
    });
    $$('[data-dies]').forEach((p) => {
      p.textContent = p.dataset.plantilla.replace('{dies}', C.diesEntrega());
    });

    // Accés al panell: només amb el mode de presentació (la home pública no el ensenya)
    const panell = el('peu-panell');
    panell.hidden = !M.presentacio();
    panell.href = C.ambPresentacio('panell/');
  }

  pintaFix();
  pinta();
  M.subscriu(pinta);

  // L'enllaç «Com funcionen les tandes» de la fitxa del lot porta a la pregunta i l'obre (PLA-COPY.md §1.6)
  const pTandes = el('faq-tandes');
  if (pTandes) {
    $$('a[href="#faq-tandes"]').forEach((a) => a.addEventListener('click', () => { pTandes.open = true; }));
    if (location.hash === '#faq-tandes') pTandes.open = true;
  }

  // Els botons «Demana» de la capçalera, el hero i la barra del mòbil porten a la fitxa del lot (en Lluc, 07/11/2026).
  // Sense JS és un enllaç normal a #lot; amb JS el salt és suau (si no hi ha moviment reduït) i el focus va al títol.
  const lotTitol = el('lot-titol');
  if (lotTitol) {
    lotTitol.tabIndex = -1;
    $$('a.boto[href="#lot"]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const suau = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('lot').scrollIntoView({ behavior: suau ? 'smooth' : 'auto' });
      lotTitol.focus({ preventScroll: true });
      history.replaceState(null, '', '#lot');
    }));
  }

  // La capçalera és fixa: transparent sobre el hero i verd fosc quan el hero ja ha passat per sota seu.
  const capca = document.querySelector('.cap');
  const heroCap = document.querySelector('.hero');
  if (capca && heroCap) {
    let pendent = false;
    const mira = () => {
      pendent = false;
      capca.classList.toggle('solida', heroCap.getBoundingClientRect().bottom <= capca.offsetHeight);
    };
    addEventListener('scroll', () => { if (!pendent) { pendent = true; requestAnimationFrame(mira); } }, { passive: true });
    addEventListener('resize', mira, { passive: true });
    mira();
  }

  // La barra del mòbil surt quan el hero ja no és a la pantalla, i s'amaga mentre s'és a les fitxes de compra:
  // el seu botó porta al lot (en Lluc, 07/11/2026), i allà ja hi ha el botó de la fitxa.
  const bm = el('demana-mobil');
  const zones = ['.hero', '#lot', '#canals'].map((s) => document.querySelector(s)).filter(Boolean);
  if (bm && zones.length && 'IntersectionObserver' in window) {
    const dins = new Set();
    const obs = new IntersectionObserver((entrades) => {
      entrades.forEach((e) => (e.isIntersecting ? dins.add(e.target) : dins.delete(e.target)));
      bm.classList.toggle('visible', dins.size === 0);
    });
    zones.forEach((z) => obs.observe(z));
  }
})();
