/* Casa Camp — home: la franja de la tanda, el bloc de la tanda de la secció del lot, les peces, els preus i la barra
   fixa del mòbil. Tot ho llegeix de js/dades.js i js/magatzem.js (res no s'escriu a mà). Textos: PLA-COPY.md §1.
   El full de compra és a js/compra.js. */
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
      el('c-pes-' + id).textContent = D.pesCanal(id);
    });
    mida();
    el('l-llista').innerHTML = D.peces.map((p) => `<li><span>${C.esc(p.nom)}</span><span>${kgPeça(p.grams)}</span></li>`).join('');
  }

  // Selector de quantitat de la caixa de compra: el botó obre el full amb aquests lots (data-lots, js/compra.js). El
  // màxim és el mateix que el del full; si no caben a la tanda d'ara, ho diu el full abans de pagar.
  let lots = 1;
  const maxLots = () => M.maxLotsPerComanda('lot') || M.placesPerTanda();
  function quantitat(canvi) {
    lots = Math.min(Math.max(1, lots + canvi), maxLots());
    el('l-num').textContent = C.lots(lots);
    el('l-menys').disabled = lots <= 1;
    el('l-mes').disabled = lots >= maxLots();
    el('l-demana').dataset.lots = lots;
  }
  el('l-menys').addEventListener('click', () => quantitat(-1));
  el('l-mes').addEventListener('click', () => quantitat(1));

  // Selector de mida de la fitxa de les canals: canvia el preu i el botó, que obre el full amb aquell producte
  const TEXT_BOTO = { 'mitja-canal': 'Demana mitja canal', canal: 'Demana una canal sencera' };
  function mida() {
    const id = document.querySelector('input[name="c-mida"]:checked').value;
    el('c-preu').textContent = D.preuProducte(id, 1).etiqueta;
    el('c-preu-kg').textContent = D.preuPerKgCanal(id);
    el('c-demana').textContent = TEXT_BOTO[id];
    el('c-demana').dataset.obreFull = id;
  }
  $$('input[name="c-mida"]').forEach((r) => r.addEventListener('change', mida));

  function barra(id, percent) {
    const b = el(id).firstElementChild;
    b.style.width = percent + '%';
  }

  function pinta() {
    const t = M.tandaActual();
    if (!t) return;
    const o = t.ocupacio;
    const places = o.places;
    const queden = o.lliures;
    const oberta = 'Tanda oberta fins al ' + C.dataCurta(t.dataLimit);

    // Franja sota el hero (en Lluc, 02/11/2026: «Propera tanda: {data}» es llegia com el dia que arriba la carn)
    el('fr-data').textContent = oberta;
    el('fr-queden').textContent = queden === 1 ? 'hi queda 1 lot' : `hi queden ${queden} lots`;
    barra('fr-barra', o.percent);

    // La tanda dins de la caixa de compra del lot, com a informació de compra
    el('t-titol').textContent = oberta;
    el('t-queden').textContent = `${queden === 1 ? 'Hi queda 1 lot' : `Hi queden ${queden} lots`} de ${places}. Si s'omple abans, es tanca abans.`;
    const pb = el('t-barra');
    pb.setAttribute('aria-valuemax', places);
    pb.setAttribute('aria-valuenow', o.lots);
    pb.setAttribute('aria-label', `Lots reservats a la tanda: ${o.lots} de ${places}`);
    barra('t-barra', o.percent);
    el('t-entrega').textContent = `Uns ${C.diesEntrega()} dies després que es tanqui la tanda.`;
    quantitat(0);

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

  // La barra del mòbil surt quan el hero ja no és a la pantalla
  const bm = el('demana-mobil');
  const hero = document.querySelector('.hero');
  if (bm && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((entrades) => {
      bm.classList.toggle('visible', !entrades[0].isIntersecting);
    }).observe(hero);
  }
})();
