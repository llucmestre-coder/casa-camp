/* Casa Camp — ajudes comunes dels mòduls del panell (panell/moduls-*.js): textos, imports, CSV i el que un mòdul llegeix
   d'un altre. Tot el que un mòdul llegeix d'un altre passa per aquí i mira si l'altre és encès: un mòdul apagat no es
   veu des de cap altre lloc. Sense DOM ni estat propi: a Node (`require`) per a les proves i al navegador
   (`window.CassovallModulsComu`). Guia: PLA-eines/panell-connectat/FONAMENT.md. */
(function (arrel, fabrica) {
  const exportat = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) arrel.CassovallModulsComu = exportat;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nomComplet = (c) => (c.client.nom + ' ' + (c.client.cognoms || '')).trim();
  const tandaText = (c) => (c.tandaNumero ? 'tanda ' + c.tandaNumero : 'a part');
  const suma = (llista) => llista.reduce((s, x) => s + x, 0);
  // LA funció de plurals de tot el panell: tot text amb una xifra hi passa. `plural(3, 'lot', 'lots')` → «3 lots»; amb
  // `#` és la frase sencera, per als verbs que també concorden: `plural(1, 'en falta #', 'en falten #')` → «en falta 1».
  const plural = (n, un, molts) => (String(un).includes('#') ? (n === 1 ? un : molts).replace('#', String(n)) : n + ' ' + (n === 1 ? un : molts));
  // El panell escriu amb l'apòstrof tipogràfic (’): les dates de js/comu.js (comú amb la web) porten el recte
  const apostrof = (s) => String(s).replace(/'/g, '’');
  const tipografia = (C) => (C ? Object.assign({}, C, { dataCurta: (x) => apostrof(C.dataCurta(x)), dataHora: (x) => apostrof(C.dataHora(x)), fraseTandaSeguent: (x) => apostrof(C.fraseTandaSeguent(x)) }) : C);
  const telefonDe = (c) => c.client.telefon;
  const telHref = (c) => 'tel:' + String(c.client.telefon).replace(/[^\d+]/g, '');
  const adrecaText = (k) => [k.adreca, [k.cp, k.poblacio].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  // Imports: mentre els preus siguin de mostra (`000 €`), qualsevol suma es veu amb l'etiqueta de mostra.
  const diners = (ctx, valor) => (ctx.D.lot.preuMostra ? ctx.D.lot.etiquetaMostra : ctx.D.formatEuros(valor));
  const totalNum = (c) => (c.importLots || 0) + (c.importEnviament || 0);
  const enviamentText = (ctx, c) => {
    if (c.lliurament === 'recull') return 'Recollida a la granja';
    const t = ctx.C.importEnviament(c);
    return t === null ? 'Per acordar' : t;
  };
  // «octubre de 2026», «abril de 2027»; «d’octubre de 2026» si va darrere de «dades»
  const mesText = (clau, ctx) => {
    const [a, m] = clau.split('-').map(Number);
    return ctx.C.MESOS[m - 1] + ' de ' + a;
  };
  const deMes = (clau, ctx) => de(mesText(clau, ctx));
  const dataLlarga = (ctx, iso) => ctx.C.dataCurta(String(iso).slice(0, 10));

  // «de» davant d'un nom: «d’Eulàlia», «d’Hug», «d’Isabel», «de Marta». Apostrofa davant de vocal o de h (sempre muda), però
  // no davant d'una i o una u (també darrere de h) que va davant de vocal i hi fa de consonant: «de Iolanda», «de Ian»,
  // «de Huelva». La i o la u accentuades són vocals: «d’Úrsula».
  // Davant d'una xifra, el que compta és com es llegeix: «d’1» (un), «d’11» (onze), «d’1.000.000» (un milió), «d’11.000»
  // (onze mil); però «de 8» (vuit, amb v), «de 80», «de 1.500» (mil cinc-cents) i «de 100» (cent).
  const xifraAmbVocal = (text) => {
    const m = /^(\d{1,3}(?:[.\s ]\d{3})+|\d+)/.exec(text);
    if (!m) return false;
    const grups = [];
    let x = m[1].replace(/[.\s ]/g, '').replace(/^0+(?=\d)/, '');
    while (x.length > 3) {
      grups.unshift(x.slice(-3));
      x = x.slice(0, -3);
    }
    grups.unshift(x);
    const primer = Number(grups[0]);
    // «mil» (1.000–1.999) no porta «un»; un milió, onze mil, onze milions, sí
    if (grups.length === 2 && primer === 1) return false;
    return primer === 1 || primer === 11;
  };
  const de = (nom) => {
    const n = String(nom === undefined || nom === null ? '' : nom).trim();
    if (/^\d/.test(n)) return (xifraAmbVocal(n) ? 'd’' : 'de ') + n;
    if (/^h?[iu][aeoàèéòó]/i.test(n)) return 'de ' + n;
    return (/^[aeiouàèéíïòóúüh]/i.test(n) ? 'd’' : 'de ') + n;
  };

  const csvCel = (v) => {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // protecció contra fórmules en obrir-lo a Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csvText = (cap, files) => '﻿' + [cap].concat(files).map((f) => f.map(csvCel).join(';')).join('\r\n') + '\r\n';

  /* ---------- El que un mòdul llegeix d'un altre (només si l'altre és encès) ---------- */

  const dadesDe = (ctx, modul) => (ctx.actiu(modul) ? ctx.M.modulDades(modul) : {});

  // Escorxador → factura: els kg reals de cada lot d'una comanda, o null
  function kgReals(ctx, c) {
    const d = dadesDe(ctx, 'escorxador');
    const v = d.kgReals && c.tandaId && d.kgReals[c.tandaId] && d.kgReals[c.tandaId][c.id];
    return v && v.length ? { lots: v, total: Math.round(suma(v) * 10) / 10 } : null;
  }
  // Escorxador: la carn de la tanda ja s'ha demanat? (sense això no hi pot haver kg reals per apuntar)
  const carnDemanada = (ctx, tandaId) => !!(dadesDe(ctx, 'escorxador').avisades || {})[tandaId];
  // Els kg reals d'una tanda sencera, o null si encara no s'han apuntat
  function kgTanda(ctx, tandaId) {
    const d = dadesDe(ctx, 'escorxador');
    const v = d.kgReals && d.kgReals[tandaId];
    if (!v) return null;
    const lots = Object.keys(v).reduce((s, k) => s + v[k].length, 0);
    return { comandes: Object.keys(v).length, lots, total: Math.round(suma(Object.keys(v).map((k) => suma(v[k]))) * 10) / 10 };
  }
  const numeroFactura = (f) => 'F-' + String(f.data).slice(0, 4) + '-' + String(f.n).padStart(4, '0');
  function factura(ctx, comandaId) {
    const e = dadesDe(ctx, 'factures').emeses;
    const f = e && e[comandaId];
    return f ? { n: f.n, data: f.data, numero: numeroFactura(f) } : null;
  }
  // Una comanda es pot facturar si està cobrada (pagament → factura) i, si l'escorxador és encès, ja es coneixen els seus kg.
  // Ho diu el recorregut (`M.potFacturar`): un sol lloc per a la tasca, el botó i l'acció.
  const facturable = (ctx, c) => ctx.actiu('factures') && ctx.M.potFacturar(c.id).ok;
  function paquet(ctx, comandaId) {
    const p = dadesDe(ctx, 'enviaments').paquets;
    const x = p && p[comandaId];
    return x ? { seguiment: x.seguiment, historial: x.historial, estat: x.historial[x.historial.length - 1].estat } : null;
  }
  function opinio(ctx, comandaId) {
    if (!ctx.actiu('opinions')) return null;
    const r = (ctx.M.modulDades('opinions').respostes || {})[comandaId] || null;
    const demanada = ctx.M.correus({ comandaId, plantilla: 'opinio-demanada' })[0] || null;
    return demanada || r ? { demanada, resposta: r } : null;
  }

  /* ---------- Clients: una persona = un telèfon (o un correu) ---------- */

  function clients(ctx) {
    const mapa = new Map();
    // De la més antiga a la més nova (a igual hora, pel número de comanda)
    const num = (c) => Number(String(c.id).replace(/\D/g, '')) || 0;
    for (const c of ctx.M.comandes().sort((a, b) => (a.creada < b.creada ? -1 : a.creada > b.creada ? 1 : num(a) - num(b)))) {
      const clau = ctx.M.clauClient(c.client);
      if (!mapa.has(clau)) mapa.set(clau, { clau, comandes: [] });
      mapa.get(clau).comandes.push(c);
    }
    return Array.from(mapa.values())
      .map((x) => {
        const ultima = x.comandes[x.comandes.length - 1];
        return Object.assign(x, { client: ultima.client, nom: nomComplet(ultima), n: x.comandes.length, lots: suma(x.comandes.map((c) => c.lots)), primera: x.comandes[0].creada, ultimaData: ultima.creada });
      })
      .sort((a, b) => (a.ultimaData < b.ultimaData ? 1 : a.ultimaData > b.ultimaData ? -1 : 0));
  }
  const habituals = (ctx) => clients(ctx).filter((x) => x.n >= 2);
  const ordinal = (n) => n + 'a';

  // Com està i com es paga una comanda (el cobrament és de la comanda; el mòdul de pagaments només hi actua)
  const ESTAT_PAG = { pagat: 'Cobrat', pendent: 'Per cobrar', fallit: 'Cobrament fallit', retornat: 'Retornat', recurrent: 'Cobrat' };
  const FORMA_PAG = { targeta: 'Targeta', 'apple-pay': 'Apple Pay', 'google-pay': 'Google Pay', pendent: 'Per decidir', efectiu: 'En efectiu', enllac: 'Enllaç de pagament' };
  const esPassarela = (c) => ['targeta', 'apple-pay', 'google-pay'].includes(c.metodePagament);

  return { de, apostrof, tipografia, ESTAT_PAG, FORMA_PAG, esPassarela, esc, nomComplet, tandaText, suma, plural, telefonDe, telHref, adrecaText, diners, totalNum, enviamentText, mesText, deMes, dataLlarga, csvCel, csvText, kgReals, kgTanda, carnDemanada, numeroFactura, factura, facturable, paquet, opinio, clients, habituals, ordinal };
});
