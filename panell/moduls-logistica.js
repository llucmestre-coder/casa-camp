/* Casa Camp — mòduls de la feina física: enviaments (etiquetes i paquets), escorxador i kg reals, ruta de repartiment
   (panell/moduls.js els declara; aquí hi ha el contingut). Encaix: «entregat» (paquet o repartiment) marca la comanda com
   a entregada (`M.marcaEntregada`) i d'allà surt la resta (opinió, fitxa del client); els kg reals de l'escorxador
   van a la factura. Cada mòdul només escriu a `dadesModuls.<seu>`. */
(function (arrel, fabrica) {
  const K = typeof module === 'object' && module.exports ? require('./moduls-comu.js') : arrel.CassovallModulsComu;
  const exportat = fabrica(K);
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) arrel.CassovallModulsLogistica = exportat;
})(typeof window !== 'undefined' ? window : null, function (K) {
  'use strict';

  const { esc } = K;
  const $ = (el, s) => el.querySelector(s);
  const $$ = (el, s) => Array.from(el.querySelectorAll(s));
  const tel = (ctx) => ctx.D.contacte.telefons[0];
  const ahora = (ctx) => ctx.ara().toISOString();

  /* ===================================== ENVIAMENTS ===================================== */

  const ESTAT_ENV = { preparat: 'Preparat', recollit: 'Recollit', 'en-cami': 'En camí', entregat: 'Entregat', 'no-entregat': 'No s’ha pogut entregar' };
  const TEXT_ENV = {
    preparat: (nom) => `El paquet ${K.de(nom)} és preparat`,
    recollit: (nom) => `El transportista ha recollit el paquet ${K.de(nom)}`,
    'en-cami': (nom) => `El paquet ${K.de(nom)} és en camí`,
    entregat: (nom) => `El paquet ${K.de(nom)} ha arribat`,
    'no-entregat': (nom) => `No s’ha pogut entregar el paquet ${K.de(nom)}`,
  };

  // Afegeix un punt al recorregut del paquet (el valida magatzem.js: cap paquet no s'entrega sense haver sortit). Torna false si
  // no toca. 'entregat' entrega la comanda al mateix moment (i, si era l'última, la tanda).
  const posaPaquet = (ctx, comandaId, estat) => !!ctx.M.mouPaquet(comandaId, estat).ok;
  function eventPaquet(ctx, c, estat, vist) {
    const p = K.paquet(ctx, c.id);
    ctx.M.registraEsdeveniment({ tipus: 'paquet-estat', origen: 'transportista', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: c.client.nom, estat, seguiment: p ? p.seguiment : '' }, vist: !!vist });
  }

  // Les etiquetes d'una tanda: un paquet (amb número de seguiment de mostra) per cada comanda que va amb transportista
  // (només quan toca: la tanda en preparació o enviada, magatzem.js `fesEtiquetes`)
  function fesEtiquetes(ctx, tandaId) {
    const r = ctx.M.fesEtiquetes(tandaId);
    return r.ok ? r.n : 0;
  }
  const senseEtiqueta = (ctx, tandaId) => ctx.M.senseEtiqueta(tandaId);
  // Els paquets que el transportista pot entregar ara (en camí)
  const enCami = (ctx) => ctx.M.comandes().slice().reverse().filter((c) => (ctx.M.lliurament(c.id) || { seguents: [] }).seguents.includes('entregat'));

  const etiquetaHTML = (ctx, c, p) => `<div class="etiqueta">
      <p class="etiqueta-seguiment">${esc(p.seguiment)}</p>
      <p><strong>${esc(K.nomComplet(c))}</strong><br>${esc(c.client.adreca)}<br>${esc(c.client.cp)} ${esc(c.client.poblacio)}<br>${esc(c.client.telefon)}</p>
      <p class="etiqueta-peu">Casa Camp · ${esc(ctx.C.lots(c.lots))} · Refrigerat · Etiqueta de mostra</p>
      <p class="etiqueta-estat no-imprimeix">${esc(ESTAT_ENV[p.estat])}</p>
    </div>`;

  const enviaments = {
    esdeveniments: {
      'paquet-estat': {
        nom: 'Un paquet canvia de punt',
        origen: 'transportista',
        text: (ev) => (TEXT_ENV[ev.dades.estat] || (() => 'Un paquet ha canviat'))(ev.dades.nom),
        avis: (ev) => (ev.dades.estat === 'no-entregat' ? { titol: 'Paquet no entregat', cos: `El paquet ${K.de(ev.dades.nom)} no s’ha pogut entregar`, hash: ev.comandaId ? '#comanda=' + ev.comandaId : '#avui' } : null),
      },
      'paquets-recollits': {
        nom: 'El transportista recull els paquets',
        origen: 'transportista',
        text: (ev) => `El transportista ha recollit ${ev.dades.n} ${ev.dades.n === 1 ? 'paquet' : 'paquets'}`,
      },
    },
    simuladors: [
      {
        id: 'recull',
        text: 'El transportista recull els paquets',
        dispara(ctx) {
          // Només els paquets preparats d'una tanda que ja ha sortit (recorregut del paquet)
          const cs = ctx.M.comandes().filter((c) => (ctx.M.lliurament(c.id) || { seguents: [] }).seguents.includes('recollit'));
          if (!cs.length) return { ok: false, text: 'No hi ha cap paquet a punt de recollir. Fes les etiquetes i passa la tanda a «Enviada».' };
          for (const c of cs) {
            posaPaquet(ctx, c.id, 'recollit');
            posaPaquet(ctx, c.id, 'en-cami');
          }
          ctx.M.registraEsdeveniment({ tipus: 'paquets-recollits', origen: 'transportista', dades: { n: cs.length } });
          return { ok: true, text: `El transportista ha recollit ${cs.length} ${cs.length === 1 ? 'paquet' : 'paquets'}.` };
        },
      },
      {
        id: 'entrega',
        text: 'El transportista entrega un paquet',
        dispara(ctx) {
          const c = enCami(ctx)[0];
          if (!c) return { ok: false, text: 'Cap paquet en camí. Fes que el transportista en reculli abans.' };
          if (!posaPaquet(ctx, c.id, 'entregat')) return { ok: false, text: 'No s’ha pogut fer.' };
          eventPaquet(ctx, c, 'entregat', false);
          return { ok: true, text: `El paquet ${K.de(c.client.nom)} ha arribat.` };
        },
      },
      {
        id: 'no-entrega',
        text: 'Un paquet no s’ha pogut entregar',
        dispara(ctx) {
          const c = enCami(ctx)[0];
          if (!c) return { ok: false, text: 'Cap paquet en camí. Fes que el transportista en reculli abans.' };
          if (!posaPaquet(ctx, c.id, 'no-entregat')) return { ok: false, text: 'No s’ha pogut fer.' };
          eventPaquet(ctx, c, 'no-entregat', false);
          return { ok: true, text: `El paquet ${K.de(c.client.nom)} no s’ha pogut entregar.` };
        },
      },
    ],
    tasques(ctx) {
      const sortida = [];
      for (const t of ctx.M.tandes().slice().reverse()) {
        if (!ctx.M.potFer('etiquetes', { tandaId: t.id }).ok) continue;
        const n = senseEtiqueta(ctx, t.id).length;
        // El botó les fa i porta a la tanda, on s'imprimeixen: el text diu el mateix
        sortida.push({ id: 'etiquetes:' + t.id, prioritat: 'bloqueja', tandaId: t.id, pas: 'etiquetes', titol: n === 1 ? `Fes l’etiqueta de la tanda ${t.numero}` : `Fes les ${n} etiquetes de la tanda ${t.numero}`, detall: 'Una per cada paquet que va amb transportista. Després, imprimeix-les des de la tanda.', boto: { text: n === 1 ? 'Fes l’etiqueta' : 'Fes les etiquetes', accio: 'etiquetes', args: { tandaId: t.id } } });
      }
      for (const c of ctx.M.comandes()) {
        const l = ctx.M.lliurament(c.id);
        if (!l || l.via !== 'paquet' || l.estat !== 'no-entregat' || !l.seguents.length) continue;
        sortida.push({ id: 'paquet-no-entregat:' + c.id, prioritat: 'bloqueja', tandaId: c.tandaId || undefined, pas: 'lliurament', titol: `El paquet ${K.de(c.client.nom)} no s’ha pogut entregar`, detall: `${K.nomComplet(c)} · ${c.client.telefon} · ${c.client.poblacio}`, boto: { text: 'Què en fem?', accio: 'no-entregat', args: { comandaId: c.id } } });
      }
      return sortida;
    },
    accions: {
      etiquetes(ctx, a, ui) {
        if (!fesEtiquetes(ctx, a.tandaId)) return;
        if (ui && ui.navega) ui.navega('#tanda=' + a.tandaId);
      },
      'no-entregat'(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c || !(ctx.M.lliurament(c.id) || { seguents: [] }).seguents.includes('en-cami')) return;
        ui.dialeg('Paquet no entregat', `<p>El paquet ${K.de(esc(K.nomComplet(c)))} no s’ha pogut entregar a ${esc(K.adrecaText(c.client))}.</p><p><a class="boto boto-lleu" href="${esc(K.telHref(c))}">Truca al ${esc(c.client.telefon)}</a></p>`, [
          { text: 'Tornem a enviar-lo', primari: true, accio: () => enviaments.accions['torna-enviar'](ctx, a, ui) },
          { text: 'Tanca' },
        ]);
      },
      'torna-enviar'(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c || !posaPaquet(ctx, c.id, 'en-cami')) return;
        eventPaquet(ctx, c, 'en-cami', true);
        if (ui && ui.flaix) ui.flaix(`Fet. El paquet ${K.de(c.client.nom)} torna a ser en camí.`);
      },
    },
    seccions: [
      {
        on: 'tanda',
        id: 'enviaments',
        html(ctx, t) {
          // Només les que surten amb el transportista (el filtre únic): les retingudes i les retornades són a part
          const cs = ctx.M.comandesQueSurten(t.id).filter((c) => (ctx.M.lliurament(c.id) || {}).via === 'paquet');
          if (!cs.length) return '';
          const amb = cs.map((c) => ({ c, p: K.paquet(ctx, c.id) })).filter((x) => x.p);
          const falten = senseEtiqueta(ctx, t.id).length;
          // Si no quadra (alguna ja és a casa sense etiqueta), es diu per què
          const sense = cs.length - amb.length - falten;
          const potFer = ctx.M.potFer('etiquetes', { tandaId: t.id }).ok;
          const botons = [
            falten && potFer ? `<button type="button" class="boto" data-enviaments="etiquetes">Fes ${falten === 1 ? 'l’etiqueta' : `les ${falten} etiquetes`}</button>` : '',
            amb.length ? '<button type="button" class="boto boto-lleu" data-enviaments="imprimeix">Imprimeix les etiquetes</button>' : '',
          ].join('');
          return `<section class="targeta"><h3>Enviaments</h3>
            <p>${K.plural(cs.length, 'paquet', 'paquets')} amb transportista${amb.length ? ` · ${amb.length} amb etiqueta` : ''}${sense > 0 ? ` · ${K.plural(sense, 'ja és a casa # sense etiqueta', 'ja en són a casa # sense etiqueta')}` : ''}.</p>
            ${botons ? `<div class="accions no-imprimeix">${botons}</div>` : ''}
            ${amb.length ? `<div class="etiquetes">${amb.map((x) => etiquetaHTML(ctx, x.c, x.p)).join('')}</div>` : ''}</section>`;
        },
        despres(el, ctx, t) {
          const f = $(el, '[data-enviaments="etiquetes"]');
          if (f) f.addEventListener('click', () => { fesEtiquetes(ctx, t.id); });
          const i = $(el, '[data-enviaments="imprimeix"]');
          if (i) i.addEventListener('click', () => ctx.ui.imprimeix('enviaments'));
        },
      },
      {
        on: 'comanda',
        id: 'enviament',
        html(ctx, c) {
          if (c.lliurament !== 'transportista') return '';
          const p = K.paquet(ctx, c.id);
          if (!p) return '<section class="targeta"><h3>Paquet</h3><p>Encara no té etiqueta.</p></section>';
          return `<section class="targeta"><h3>Paquet</h3><dl class="dades"><div><dt>Seguiment</dt><dd>${esc(p.seguiment)}</dd></div><div><dt>Estat</dt><dd>${esc(ESTAT_ENV[p.estat])}</dd></div></dl>
            <ul class="historial">${p.historial.map((h) => `<li>${esc(ctx.C.dataHora(h.data))} · ${esc(ESTAT_ENV[h.estat])}</li>`).join('')}</ul></section>`;
        },
      },
    ],
  };

  /* ===================================== ESCORXADOR ===================================== */

  const vedelles = (ctx, kg) => Math.max(1, Math.round(kg / ctx.D.escorxador.kgPerVedella));
  const textVedelles = (n) => (n === 1 ? 'una vedella' : `unes ${n} vedelles`);
  // Només els lots que surten amb la tanda (una retinguda o una retornada no es demana a l'escorxador)
  const demanda = (ctx, t) => {
    const lots = ctx.M.lotsQueSurten(t.id);
    const kg = lots * ctx.D.pesLot().kgReals;
    return { lots, kg, vedelles: vedelles(ctx, kg) };
  };
  const dadesEsc = (ctx) => ctx.M.modulDades('escorxador');
  const avisada = (ctx, tandaId) => (dadesEsc(ctx).avisades || {})[tandaId] || null;
  const decimal = (s) => Number(String(s).trim().replace(',', '.'));

  function desaKg(ctx, t, valors) {
    // Només mentre el recorregut els demana (la carn demanada i la tanda encara sense preparar)
    if (!ctx.M.potFer('kg-reals', { tandaId: t.id }).ok) return false;
    const prev = (dadesEsc(ctx).kgReals || {})[t.id] || null;
    // El formulari només porta les que surten: els kg que ja hi havia d'una comanda que ara no surt (retinguda) es guarden
    const nous = Object.assign({}, prev || {}, valors);
    if (prev && JSON.stringify(prev) === JSON.stringify(nous)) return true; // els mateixos kg: res de nou (no s'apunta dues vegades)
    ctx.M.modulActualitza('escorxador', (d) => {
      d.kgReals = d.kgReals || {};
      d.kgReals[t.id] = nous;
    });
    const k = K.kgTanda(ctx, t.id);
    ctx.M.registraEsdeveniment({ tipus: 'kg-apuntats', origen: 'escorxador', tandaId: t.id, dades: { tandaNumero: t.numero, kg: k ? k.total : 0 }, vist: true });
    return true;
  }

  function formKg(ctx, t, ui) {
    // Els kg reals no existeixen fins que la carn ha passat per l'escorxador: abans no es poden apuntar
    if (!avisada(ctx, t.id)) {
      const pot = ctx.M.potFer('carn-demanada', { tandaId: t.id }).ok;
      ui.dialeg('Encara no es poden apuntar', `<p>Primer cal demanar la carn de la tanda ${t.numero} a l’escorxador: els kg reals no hi són fins que no la tinguis.</p>`, [
        pot ? { text: 'Mira què cal demanar', primari: true, accio: () => dialegDemana(ctx, t, ui) || false } : { text: 'Tanca', primari: true },
        pot ? ui.cancela : null,
      ].filter(Boolean));
      return;
    }
    // Un cop la tanda es prepara, els kg ja són a les factures: no es canvien
    if (!ctx.M.potFer('kg-reals', { tandaId: t.id }).ok) {
      ui.dialeg('Ja no es poden canviar', `<p>La tanda ${t.numero} ja s’està preparant: els kg reals ja són els de les factures.</p>`, [{ text: 'Tanca', primari: true }]);
      return;
    }
    const cs = ctx.M.comandesQueSurten(t.id).filter((c) => c.places > 0);
    const actual = (dadesEsc(ctx).kgReals || {})[t.id] || {};
    const camps = cs.map((c, ci) => `<fieldset class="kg-comanda"><legend>${esc(K.nomComplet(c))} · ${esc(ctx.C.lots(c.lots))}</legend><div class="kg-lots">${Array.from({ length: c.lots }, (_, li) => {
      const v = actual[c.id] && actual[c.id][li];
      return `<label>Lot ${li + 1}<input type="text" inputmode="decimal" autocomplete="off" data-kg="${ci}:${li}" value="${v === undefined ? '' : esc(ctx.C.kg(v))}"> kg</label>`;
    }).join('')}</div></fieldset>`).join('');
    ui.dialeg(`Kg reals de la tanda ${t.numero}`, `<p class="fila-detall">Apunta els kg de cada lot, tal com els diu la bàscula (amb coma o amb punt).</p>${camps}<p class="error-pla" id="kg-err" role="alert" hidden></p>`, [
      {
        text: 'Desa',
        primari: true,
        accio: (dlg) => {
          const valors = {};
          let mal = false;
          cs.forEach((c, ci) => {
            valors[c.id] = Array.from({ length: c.lots }, (_, li) => {
              const x = decimal($(dlg, `[data-kg="${ci}:${li}"]`).value);
              if (!(x > 0.5 && x < 30)) mal = true;
              return Math.round(x * 10) / 10;
            });
          });
          if (mal) {
            const e = $(dlg, '#kg-err');
            e.textContent = 'Falta algun pes, o no és un número (entre 0,5 i 30 kg).';
            e.hidden = false;
            return false;
          }
          if (desaKg(ctx, t, valors)) ui.flaix(`Fet. Apuntats els kg reals de la tanda ${t.numero}.`);
        },
      },
      {
        text: 'Omple’ls de mostra',
        accio: (dlg) => {
          $$(dlg, '[data-kg]').forEach((i, n) => { i.value = ctx.C.kg(4.9 + ((n * 37) % 5) / 10); });
          return false;
        },
      },
      ui.cancela,
    ]);
  }

  function dialegDemana(ctx, t, ui) {
    const x = demanda(ctx, t);
    const oberta = !t.tancada ? '<p class="fila-detall">La tanda encara és oberta: les xifres poden canviar.</p>' : '';
    // «Ja ho he demanat» només quan és el pas que toca (la tanda tancada i la carn encara sense demanar)
    const pot = ctx.M.potFer('carn-demanada', { tandaId: t.id }).ok;
    ui.dialeg(`Tanda ${t.numero}: què cal demanar`, `<p><strong>${esc(ctx.C.lots(x.lots))}</strong> · uns <strong>${esc(ctx.C.kg(x.kg))} kg</strong> de carn · ${esc(textVedelles(x.vedelles))}.</p>${oberta}<p class="fila-detall">Són xifres de mostra: falta saber quants kg de lots surten d’una vedella.</p>`, pot ? [
      { text: 'Ja ho he demanat', primari: true, accio: () => escorxador.accions.demanat(ctx, { tandaId: t.id }, ui) },
      { text: 'Tanca' },
    ] : [{ text: 'Tanca', primari: true }]);
  }

  const escorxador = {
    esdeveniments: {
      'escorxador-avisat': {
        nom: 'S’avisa l’escorxador',
        origen: 'escorxador',
        text: (ev) => `S’ha demanat a l’escorxador la tanda ${ev.dades.tandaNumero}: ${ev.dades.lots} ${ev.dades.lots === 1 ? 'lot' : 'lots'}`,
      },
      'escorxador-llest': {
        nom: 'L’escorxador té la carn a punt',
        origen: 'escorxador',
        text: (ev) => `L’escorxador té la carn de la tanda ${ev.dades.tandaNumero} a punt`,
        avis: (ev) => ({ titol: 'Carn a punt', cos: `La tanda ${ev.dades.tandaNumero} és a punt a l’escorxador`, hash: '#tanda=' + (ev.tandaId || '') }),
        simulador: {
          text: 'L’escorxador té la carn a punt',
          dispara(ctx) {
            const t = ctx.M.tandes().find((x) => ctx.M.potFer('kg-reals', { tandaId: x.id }).ok && !K.kgTanda(ctx, x.id) && !ctx.M.esdeveniments({ tipus: 'escorxador-llest', tandaId: x.id }).length);
            if (!t) return { ok: false, text: 'Cap tanda espera la carn. Omple la tanda actual i demana-la a l’escorxador.' };
            ctx.M.registraEsdeveniment({ tipus: 'escorxador-llest', origen: 'escorxador', tandaId: t.id, dades: { tandaNumero: t.numero } });
            return { ok: true, text: `L’escorxador té la carn de la tanda ${t.numero} a punt.` };
          },
        },
      },
      'kg-apuntats': {
        nom: 'S’apunten els kg reals',
        origen: 'escorxador',
        text: (ev, ctx) => `Apuntats els kg reals de la tanda ${ev.dades.tandaNumero}: ${ctx.C.kg(ev.dades.kg)} kg`,
      },
    },
    tasques(ctx) {
      const sortida = [];
      for (const t of ctx.M.tandes().slice().reverse()) {
        if (!ctx.M.potFer('carn-demanada', { tandaId: t.id }).ok) continue;
        const x = demanda(ctx, t);
        sortida.push({ id: 'escorxador-demana:' + t.id, prioritat: 'bloqueja', tandaId: t.id, pas: 'carn-demanada', titol: `Tanda ${t.numero} ${t.tancadaPer === 'plena' ? 'plena' : 'tancada'}: demana-ho a l’escorxador`, detall: `${ctx.C.lots(x.lots)} · uns ${ctx.C.kg(x.kg)} kg · ${textVedelles(x.vedelles)}`, boto: { text: 'Mira què cal demanar', accio: 'demana', args: { tandaId: t.id } } });
      }
      // Un cop demanada la carn, s'espera que arribi: és a «En espera» (FONAMENT.md: esperar no és feina), amb el botó per
      // apuntar els kg quan la tingui. Quan l'escorxador avisa que la té, és feina i bloqueja.
      for (const t of ctx.M.tandes().slice().reverse()) {
        if (K.kgTanda(ctx, t.id) || !ctx.M.potFer('kg-reals', { tandaId: t.id }).ok) continue;
        const llesta = ctx.M.esdeveniments({ tipus: 'escorxador-llest', tandaId: t.id }).length > 0;
        const lots = ctx.C.lots(ctx.M.lotsQueSurten(t.id));
        sortida.push(llesta
          ? { id: 'escorxador-kg:' + t.id, prioritat: 'bloqueja', tandaId: t.id, pas: 'kg-reals', titol: `La carn de la tanda ${t.numero} és a punt: apunta els kg reals`, detall: `${lots} · els kg van a la factura`, feina: ['kg:' + t.id], boto: { text: 'Apunta els kg', accio: 'kg', args: { tandaId: t.id } } }
          : { id: 'escorxador-kg:' + t.id, prioritat: 'info', espera: true, tandaId: t.id, pas: 'kg-reals', titol: `La carn de la tanda ${t.numero} és a l’escorxador`, detall: `${lots} · quan arribi, apunta’n els kg reals (van a la factura)`, feina: ['kg:' + t.id], boto: { text: 'Ja ha arribat: apunta els kg', accio: 'kg', args: { tandaId: t.id } } });
      }
      return sortida;
    },
    accions: {
      demana(ctx, a, ui) {
        const t = ctx.M.tanda(a.tandaId);
        if (t) dialegDemana(ctx, t, ui);
      },
      demanat(ctx, a, ui) {
        const t = ctx.M.tanda(a.tandaId);
        // Una sola vegada i només quan toca (la tanda tancada): cap «Ja ho he demanat» se salta el recorregut
        if (!t || !ctx.M.potFer('carn-demanada', { tandaId: t.id }).ok) return;
        const x = demanda(ctx, t);
        ctx.M.modulActualitza('escorxador', (d) => {
          d.avisades = d.avisades || {};
          d.avisades[t.id] = ahora(ctx);
          // Quines comandes hi compten (les que surten): una retinguda que pagui després va a la tanda següent
          d.demanades = d.demanades || {};
          d.demanades[t.id] = ctx.M.comandesQueSurten(t.id).map((c) => c.id);
        });
        ctx.M.registraEsdeveniment({ tipus: 'escorxador-avisat', origen: 'escorxador', tandaId: t.id, dades: { tandaNumero: t.numero, lots: x.lots, kg: Math.round(x.kg * 10) / 10 }, vist: true });
        if (ui && ui.flaix) ui.flaix(`Fet. Queda apuntat que has demanat la tanda ${t.numero}.`);
      },
      kg(ctx, a, ui) {
        const t = ctx.M.tanda(a.tandaId);
        if (t) formKg(ctx, t, ui);
      },
    },
    seccions: [
      {
        on: 'tanda',
        id: 'escorxador',
        html(ctx, t) {
          const x = demanda(ctx, t);
          if (!x.lots && !avisada(ctx, t.id)) return '';
          const av = avisada(ctx, t.id);
          const kg = K.kgTanda(ctx, t.id);
          const dl = [
            ['Què cal demanar', `${esc(ctx.C.lots(x.lots))} · uns ${esc(ctx.C.kg(x.kg))} kg · ${esc(textVedelles(x.vedelles))} (de mostra)`],
            ['Demanat', av ? `el ${esc(K.dataLlarga(ctx, av))}` : 'Encara no'],
            ['Kg reals', kg ? `${esc(ctx.C.kg(kg.total))} kg en ${esc(ctx.C.lots(kg.lots))}` : 'Encara no apuntats'],
          ];
          return `<section class="targeta no-imprimeix"><h3>Escorxador</h3><dl class="dades">${dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
            <div class="accions"><button type="button" class="boto boto-lleu" data-escorxador="demana">${av ? 'Torna a mirar què cal demanar' : 'Mira què cal demanar'}</button>${av && ctx.M.potFer('kg-reals', { tandaId: t.id }).ok ? `<button type="button" class="boto boto-lleu" data-escorxador="kg">${kg ? 'Canvia els kg reals' : 'Apunta els kg reals'}</button>` : ''}</div></section>`;
        },
        despres(el, ctx, t) {
          $(el, '[data-escorxador="demana"]').addEventListener('click', () => dialegDemana(ctx, t, ctx.ui));
          const k = $(el, '[data-escorxador="kg"]');
          if (k) k.addEventListener('click', () => formKg(ctx, t, ctx.ui));
        },
      },
    ],
  };

  /* ===================================== RUTA DE REPARTIMENT ===================================== */

  const esParada = (c) => c.lliurament === 'repartiment-propi' || c.lliurament === 'recull';
  // Una parada en efectiu encara sense cobrar: es cobra en entregar-la
  const perCobrar = (c) => c.metodePagament === 'efectiu' && c.pagament === 'pendent' && !c.entregada;
  const mapaHref = (c) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(K.adrecaText(c.client));

  function entrega(ctx, c) {
    const r = ctx.M.marcaEntregada(c.id);
    if (r.ok && !r.jaEntregada) {
      ctx.M.registraEsdeveniment({ tipus: 'ruta-entregada', origen: 'panell', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c) }, vist: true });
    }
    return r;
  }

  const ruta = {
    esdeveniments: {
      'ruta-entregada': {
        nom: 'Es lliura una comanda de la ruta',
        origen: 'panell',
        text: (ev) => `${ev.dades.nom} ha rebut la comanda`,
      },
      'ruta-absent': {
        nom: 'Un client no hi serà',
        origen: 'client',
        text: (ev) => `${ev.dades.nom} avisa que no hi serà quan li portis la comanda`,
        avis: (ev) => ({ titol: 'No hi serà', cos: `${ev.dades.nom} no hi serà quan li portis la comanda`, hash: ev.comandaId ? '#comanda=' + ev.comandaId : '#avui' }),
        simulador: {
          text: 'Un client diu que no hi serà',
          dispara(ctx) {
            // Una entrega pròpia d'una tanda que ja es prepara o ja ha sortit (abans encara no hi ha res per entregar)
            const c = ctx.M.comandes().filter((x) => esParada(x) && !x.entregada && x.lliurament === 'repartiment-propi' && ['preparacio', 'enviada'].includes(x.estat)).pop();
            if (!c) return { ok: false, text: 'Cap entrega pròpia a punt de sortir. Passa a «En preparació» una tanda amb alguna comanda de Sort.' };
            ctx.M.registraEsdeveniment({ tipus: 'ruta-absent', origen: 'client', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c), poblacio: c.client.poblacio } });
            return { ok: true, text: `${c.client.nom} avisa que no hi serà.` };
          },
        },
      },
    },
    tasques(ctx) {
      const sortida = [];
      for (const t of ctx.M.tandes().slice().reverse()) {
        // Les parades que es poden entregar ara (recorregut: la tanda ja ha sortit)
        const pend = ctx.M.comandesQueSurten(t.id).filter((c) => esParada(c) && (ctx.M.lliurament(c.id) || { seguents: [] }).seguents.includes('entregada'));
        const porta = pend.filter((c) => c.lliurament === 'repartiment-propi');
        if (porta.length) {
          const pobles = Array.from(new Set(porta.map((c) => c.client.poblacio)));
          const efectiu = porta.filter(perCobrar).length;
          const cobra = efectiu && ctx.actiu('pagaments') ? ` · ${K.plural(efectiu, '# en efectiu: cobra-la en entregar', '# en efectiu: cobra-les en entregar')}` : '';
          sortida.push({ id: 'ruta-surt:' + t.id, prioritat: 'data', tandaId: t.id, pas: 'lliurament', titol: `Reparteix ${porta.length === 1 ? 'una comanda' : porta.length + ' comandes'} de la tanda ${t.numero}`, detall: pobles.join(' · ') + cobra, boto: { text: 'Obre la ruta', hash: '#tanda=' + t.id } });
        }
        // La que la ve a buscar a Sort: s'espera que vingui (no és cap repartiment)
        for (const c of pend.filter((x) => x.lliurament === 'recull')) {
          const cobra = perCobrar(c) && ctx.actiu('pagaments');
          sortida.push({ id: 'ruta-recull:' + c.id, prioritat: 'info', espera: true, tandaId: t.id, pas: 'lliurament', titol: `${c.client.nom} la ve a buscar a Sort`, detall: `${K.nomComplet(c)} · ${ctx.C.lots(c.lots)} · tanda ${t.numero}${cobra ? ' · en efectiu: cobra-la quan la hi donis' : ''}`, tel: { href: K.telHref(c), text: 'Truca al ' + c.client.telefon }, boto: { text: cobra ? 'Ja l’ha recollida i pagada' : 'Ja l’ha recollida', accio: 'entrega', args: { comandaId: c.id } } });
        }
      }
      for (const ev of ctx.M.esdeveniments({ tipus: 'ruta-absent', vist: false })) {
        const c = ctx.M.comanda(ev.comandaId);
        if (!c || c.entregada || ctx.M.lliurament(c.id).via !== 'ruta') continue;
        // Trucar per quedar-hi es pot fer ara (amb la tanda en preparació o ja en camí): no és cap pas del recorregut, va al
        // davant de la seva tanda
        sortida.push({ id: 'ruta-absent:' + ev.id, prioritat: 'data', tandaId: c.tandaId || undefined, titol: `${c.client.nom} no hi serà`, detall: `Truca-li per quedar-hi · ${c.client.poblacio}`, tel: { href: K.telHref(c), text: 'Truca al ' + c.client.telefon }, boto: { text: 'Ja ho hem parlat', accio: 'parlat', args: { id: ev.id } } });
      }
      return sortida;
    },
    accions: {
      parlat(ctx, a, ui) {
        ctx.M.marcaEsdevenimentVist(a.id);
        if (ui && ui.flaix) ui.flaix('Fet. Queda apuntat.');
      },
      entrega(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c) return;
        const cobrar = perCobrar(c) && ctx.accio('pagaments', 'cobrat');
        const r = entrega(ctx, c);
        // L'efectiu es cobra en entregar: el mateix botó (la ruta i el cobrament van lligats)
        if (r.ok && !r.jaEntregada && cobrar) cobrar(ctx, { comandaId: c.id }, { flaix() {} });
        if (r.ok && ui && ui.flaix) ui.flaix(cobrar ? `Fet. ${c.client.nom} ja té la comanda i l’has cobrada.` : `Fet. ${c.client.nom} ja té la comanda.`);
      },
    },
    seccions: [
      {
        on: 'tanda',
        id: 'ruta',
        html(ctx, t) {
          // Només les que surten (les retingudes i les retornades són a part, a la tanda, amb el motiu)
          const cs = ctx.M.comandesQueSurten(t.id).filter(esParada);
          if (!cs.length) return '';
          const grups = new Map();
          for (const c of cs) {
            const clau = c.lliurament === 'recull' ? 'La recullen a Sort' : c.client.poblacio;
            if (!grups.has(clau)) grups.set(clau, []);
            grups.get(clau).push(c);
          }
          const fila = (c) => {
            // «Entregada» només quan la tanda ja ha sortit (recorregut de la parada)
            const pot = (ctx.M.lliurament(c.id) || { seguents: [] }).seguents.includes('entregada');
            const cobra = perCobrar(c) && ctx.actiu('pagaments');
            const accions = c.entregada
              ? '<span class="fila-detall">Entregada</span>'
              : `<span class="accions"><a class="boto boto-lleu" href="${esc(K.telHref(c))}">Truca</a>${c.lliurament === 'repartiment-propi' ? `<a class="boto boto-lleu" href="${esc(mapaHref(c))}" target="_blank" rel="noopener">Mapa</a>` : ''}${pot ? `<button type="button" class="boto" data-ruta="entrega" data-id="${esc(c.id)}">${cobra ? 'Entregada i cobrada' : 'Entregada'}<span class="sr-nomes">: ${esc(K.nomComplet(c))}</span></button>` : ''}</span>`;
            return `<li class="fila fila-ruta"><span class="fila-text"><span class="fila-nom"><strong>${esc(K.nomComplet(c))}</strong> · ${esc(ctx.C.lots(c.lots))}</span><span class="fila-detall">${esc(c.lliurament === 'recull' ? c.client.telefon : K.adrecaText(c.client))}${c.client.notes ? ' · ' + esc(c.client.notes) : ''}</span></span>${accions}</li>`;
          };
          const blocs = Array.from(grups.entries()).map(([nom, llista]) => `<h4>${esc(nom)} · ${K.plural(llista.length, 'entrega', 'entregues')}</h4><ul class="fileres">${llista.map(fila).join('')}</ul>`).join('');
          return `<section class="targeta"><h3>Ruta de repartiment</h3>${blocs}<div class="accions no-imprimeix"><button type="button" class="boto boto-lleu" data-ruta="imprimeix">Imprimeix la ruta</button></div></section>`;
        },
        despres(el, ctx) {
          $$(el, '[data-ruta="entrega"]').forEach((b) => b.addEventListener('click', () => ruta.accions.entrega(ctx, { comandaId: b.dataset.id }, ctx.ui)));
          $(el, '[data-ruta="imprimeix"]').addEventListener('click', () => ctx.ui.imprimeix('ruta'));
        },
      },
    ],
  };

  return { enviaments, escorxador, ruta };
});
