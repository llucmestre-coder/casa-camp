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
    el('preu-mitja-canal').textContent = D.preuProducte('mitja-canal', 1).etiqueta;
    el('preu-canal').textContent = D.preuProducte('canal', 1).etiqueta;
    el('l-llista').innerHTML = D.peces.map((p) => `<li><span>${C.esc(p.nom)}</span><span>${kgPeça(p.grams)}</span></li>`).join('');
  }

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
    const ant = M.tandaAnterior();
    const anterior = ant && ant.tancada ? `La tanda ${ant.numero} ja és tancada.` : '';

    // Franja sota el hero
    el('fr-data').textContent = 'Propera tanda: ' + C.dataCurta(t.dataLimit);
    el('fr-queden').textContent = queden === 1 ? 'Hi queda 1 lot' : `Hi queden ${queden} lots`;
    el('fr-anterior').textContent = anterior;
    barra('fr-barra', o.percent);

    // Bloc de la tanda de la secció del lot
    el('t-titol').textContent = 'Propera tanda: ' + C.dataCurta(t.dataLimit);
    el('t-compte').innerHTML = `Lots reservats a la tanda ${t.numero}: <b>${o.lots} de ${places}</b>`;
    el('t-anterior').textContent = anterior;
    const pb = el('t-barra');
    pb.setAttribute('aria-valuemax', places);
    pb.setAttribute('aria-valuenow', o.lots);
    pb.setAttribute('aria-label', `Lots reservats a la tanda ${t.numero}: ${o.lots} de ${places}`);
    barra('t-barra', o.percent);
    el('t-com-text').textContent = `Enviem la carn per tandes. A cada tanda hi ajuntem les comandes de moltes cases, fins a ${places} lots. La tanda es tanca quan arriba als ${places} lots o, com a molt tard, el ${C.dataCurta(t.dataLimit)}. Llavors preparem la carn: uns ${C.diesEntrega()} dies després que es tanqui, la tens a casa. T'escrivim amb el dia exacte.`;

    // Barra fixa del mòbil
    el('dm-text').textContent = `Tanda ${t.numero}: ${queden === 1 ? 'hi queda 1 lot' : 'hi queden ' + queden + ' lots'}`;

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
