/* Casa Camp — ajudes comunes de la home i del panell: dates, plurals, imports, text dels productes i enllaços.
   No té estat. Es carrega després de dades.js i magatzem.js; crea `window.CasaCamp`. */
(function () {
  'use strict';

  const MESOS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];
  const D = window.CassovallDades;
  const M = window.CassovallMagatzem;

  const z2 = (n) => String(n).padStart(2, '0');

  // «2026-12-12» → «12 de desembre»; «2026-04-01» → «1 d'abril»
  function dataCurta(iso) {
    const [, m, d] = String(iso).split('-').map(Number);
    if (!m || !d) return '';
    const mes = MESOS[m - 1];
    return d + ' ' + (/^[aeiou]/.test(mes) ? "d'" : 'de ') + mes;
  }

  // «3 de desembre, 18.42», a partir d'un ISO complet
  function dataHora(isoComplet) {
    const t = new Date(isoComplet);
    if (isNaN(t)) return '';
    return dataCurta(t.getFullYear() + '-' + z2(t.getMonth() + 1) + '-' + z2(t.getDate())) + ', ' + z2(t.getHours()) + '.' + z2(t.getMinutes());
  }

  // «1 lot» / «2 lots»
  const lots = (n) => n + (n === 1 ? ' lot' : ' lots');
  const queden = (n) => (n === 1 ? 'hi queda 1 lot' : 'hi queden ' + n + ' lots');

  // Text d'un producte tal com es diu en una frase
  function producte(id, quantitat) {
    if (id === 'mitja-canal') return quantitat > 1 ? quantitat + ' mitges canals' : 'mitja canal';
    if (id === 'canal') return quantitat > 1 ? quantitat + ' canals senceres' : 'una canal sencera';
    return lots(quantitat);
  }

  // Dies entre que es tanca la tanda i l'entrega: xifra de mostra fins que el pastor la doni (dades.diesEntrega)
  const diesEntrega = () => (D.diesEntrega.mostra ? D.diesEntrega.etiquetaMostra : String(D.diesEntrega.dies));

  // `?presentacio` es desa a localStorage; si el navegador no en té, es perd en canviar de pàgina. Per això els
  // enllaços entre pàgines el tornen a posar quan el mode és actiu.
  function ambPresentacio(ruta) {
    if (!M.presentacio()) return ruta;
    const [base, hash] = ruta.split('#');
    return base + (base.includes('?') ? '&' : '?') + 'presentacio' + (hash ? '#' + hash : '');
  }
  const desaDades = () => M.estatEmmagatzematge().persistent;

  // Escapa text per posar-lo dins d'HTML
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Etiquetes d'import de mostra (`000 €`, `00 €`) o reals, segons dades.js
  const importLots = (id, n) => D.preuProducte(id, n).etiqueta;
  function importEnviament(c) {
    if (!c.tandaId && c.importEnviament === null) return null;
    if (c.lliurament === 'repartiment-propi') return 'gratis';
    const r = D.enviament.resta;
    return r.mostra ? r.etiquetaMostra : D.formatEuros(c.importEnviament);
  }
  function importTotal(c) {
    const l = D.preuProducte(c.producte, c.lots);
    const enviamentMostra = c.lliurament === 'transportista' && D.enviament.resta.mostra;
    if (l.mostra || enviamentMostra) return (D.productes[c.producte] && D.productes[c.producte].etiquetaMostra) || D.lot.etiquetaMostra;
    return D.formatEuros(l.import + (c.importEnviament || 0));
  }

  const kg = (n) => (Math.round(n * 10) / 10).toString().replace('.', ',');

  window.CasaCamp = { MESOS, dataCurta, dataHora, lots, queden, producte, diesEntrega, ambPresentacio, desaDades, esc, importLots, importEnviament, importTotal, kg, z2 };
})();
