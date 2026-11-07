/* Casa Camp — mòduls dels diners: pagaments, factures i números per a la gestoria (panell/moduls.js els declara; aquí hi
   ha el contingut). Encaix: pagament → factura → gestoria. El cobrament viu a la comanda (`comanda.pagament`); la factura,
   a `dadesModuls.factures`; la gestoria no desa res de les comandes, només quins períodes ja ha passat. */
(function (arrel, fabrica) {
  const K = typeof module === 'object' && module.exports ? require('./moduls-comu.js') : arrel.CassovallModulsComu;
  const exportat = fabrica(K);
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) arrel.CassovallModulsDiners = exportat;
})(typeof window !== 'undefined' ? window : null, function (K) {
  'use strict';

  const { esc } = K;
  const $ = (el, s) => el.querySelector(s);
  const $$ = (el, s) => Array.from(el.querySelectorAll(s));
  const tel = (ctx) => ctx.D.contacte.telefons[0];
  const signatura = (ctx) => `Casa Camp\n${tel(ctx)}`;
  const totalText = (ctx, c) => ctx.C.importTotal(c);
  const tandaAmbEstat = (ctx, c) => (c.tandaNumero ? `tanda ${c.tandaNumero}` : 'a part');

  /* ===================================== PAGAMENTS ===================================== */

  // El cobrament s'arregla: es marca cobrat i queda al registre (la persona que ho fa sempre és el pastor)
  function cobra(ctx, c, via) {
    const r = ctx.M.setPagament(c.id, 'pagat');
    if (!r.ok) return r;
    ctx.M.registraEsdeveniment({ tipus: 'pagament-rebut', origen: 'pagament', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c), via: via || 'panell' }, vist: via !== 'enllac' });
    return r;
  }

  function retorna(ctx, c) {
    const r = ctx.M.setPagament(c.id, 'retornat');
    if (!r.ok) return r;
    let correu = false;
    if (c.client.email) correu = ctx.M.registraCorreu({ plantilla: 'devolucio', comandaId: c.id, motiu: 'devolucio' }).ok;
    ctx.M.registraEsdeveniment({ tipus: 'pagament-retornat', origen: 'pagament', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c) }, vist: true });
    return Object.assign({}, r, { correu });
  }

  const pagaments = {
    esdeveniments: {
      'pagament-fallit': {
        nom: 'Un cobrament falla',
        origen: 'pagament',
        text: (ev) => `No s’ha pogut cobrar la comanda ${K.de(ev.dades.nom)}`,
        avis: (ev) => ({ titol: 'No s’ha pogut cobrar', cos: `${ev.dades.nom} · cal trucar`, hash: ev.comandaId ? '#comanda=' + ev.comandaId : '#avui' }),
      },
      'pagament-rebut': {
        nom: 'Es cobra una comanda',
        origen: 'pagament',
        text: (ev) => (ev.dades.via === 'enllac' ? `${ev.dades.nom} ha pagat l’enllaç` : `S’ha cobrat la comanda ${K.de(ev.dades.nom)}`),
      },
      'pagament-retornat': {
        nom: 'Es retornen els diners d’una comanda',
        origen: 'pagament',
        text: (ev) => `S’han retornat els diners de la comanda ${K.de(ev.dades.nom)}`,
      },
    },
    simuladors: [
      {
        id: 'falla',
        text: 'Falla un cobrament',
        dispara(ctx) {
          // Una comanda que encara no s'ha entregat ni facturat (el cobrament d'una comanda ja lliurada i facturada no falla)
          const c = ctx.M.comandes().find((x) => x.pagament === 'pagat' && x.origen !== 'telefon' && !x.entregada && !K.factura(ctx, x.id) && x.tandaId);
          if (!c) return { ok: false, text: 'No hi ha cap comanda cobrada a la qual fallar.' };
          const r = ctx.M.setPagament(c.id, 'fallit');
          if (!r.ok) return { ok: false, text: 'No s’ha pogut fer.' };
          ctx.M.registraEsdeveniment({ tipus: 'pagament-fallit', origen: 'pagament', comandaId: c.id, tandaId: c.tandaId, dades: { nom: K.nomComplet(c) } });
          return { ok: true, text: `Ha fallat el cobrament de la comanda ${K.de(c.client.nom)}.` };
        },
      },
      {
        id: 'enllac',
        text: 'Un client paga l’enllaç',
        dispara(ctx) {
          const c = ctx.M.comandes().filter((x) => x.pagament === 'pendent' && x.metodePagament === 'enllac').pop();
          if (!c) return { ok: false, text: 'Cap comprador té un enllaç per pagar. Apunta una comanda per telèfon i tria «Enllaç de pagament».' };
          const r = cobra(ctx, c, 'enllac');
          return r.ok ? { ok: true, text: `${c.client.nom} ha pagat l’enllaç.` } : { ok: false, text: 'No s’ha pogut fer.' };
        },
      },
    ],
    correus: [
      {
        plantilla: 'devolucio',
        text: (m, ctx) => {
          const c = m.dades.comanda;
          return {
            assumpte: `Hem retornat els diners de la comanda ${c.id}`,
            cos: [`Hola, ${c.client.nom}:`, '', `Hem fet la devolució del pagament de la comanda ${c.id} (${totalText(ctx, c)}).`, '', 'Si tens qualsevol dubte, truca’ns.', '', signatura(ctx)].join('\n'),
          };
        },
      },
      {
        plantilla: 'enllac-pagament',
        text: (m, ctx) => {
          const c = m.dades.comanda;
          return {
            assumpte: `Enllaç per pagar la comanda ${c.id}`,
            cos: [`Hola, ${c.client.nom}:`, '', `Aquí tens l’enllaç per pagar la comanda ${c.id} (${ctx.C.producte(c.producte, c.lots)}, ${totalText(ctx, c)}):`, '', '[ENLLAÇ DE PAGAMENT]', '', `Si tens qualsevol dubte, truca’ns al ${tel(ctx)}.`, '', signatura(ctx)].join('\n'),
          };
        },
      },
    ],
    // Només és feina el que el pastor pot fer ara (recorregut: pas «cobrament»). Decisió d'en Lluc (05/11/2026): una comanda
    // amb el cobrament fallit, o sense pagar, no surt fins que paga (`M.retinguda`): «Truca {nom} perquè pagui», amb el
    // telèfon, fins que es cobra o es mou a la tanda següent. Esperar que pagui l'enllaç mentre la tanda és oberta no és
    // feina (es veu a la fitxa i a Pagaments). L'efectiu es cobra en entregar, en mà: el botó de la ruta l'entrega i el
    // cobra alhora; només si s'ha entregat sense cobrar (p. ex. sense la ruta, amb la tanda) surt «Cobra en efectiu».
    tasques(ctx) {
      const sortida = [];
      for (const c of ctx.M.comandes()) {
        if (!ctx.M.potFer('cobrament', { comandaId: c.id }).ok) continue;
        const t = c.tandaId ? ctx.M.tanda(c.tandaId) : null;
        if (ctx.M.retinguda(c.id)) {
          if (c.pagament !== 'fallit' && t && !t.tancada) continue;
          const motiu = c.pagament === 'fallit' ? 'No s’ha pogut cobrar' : c.metodePagament === 'enllac' ? 'Encara no ha pagat l’enllaç' : 'Encara no ha pagat';
          const surt = t ? (['enviada', 'entregada'].includes(t.estat) ? `no ha sortit amb la tanda ${t.numero}` : `no sortirà amb la tanda ${t.numero} fins que pagui`) : 'no se li dona fins que pagui';
          sortida.push({ id: (c.pagament === 'fallit' ? 'pagament-fallit:' : 'pagament-pendent:') + c.id, prioritat: 'bloqueja', tandaId: c.tandaId || undefined, pas: 'cobrament', titol: `Truca ${c.client.nom} perquè pagui`, detall: `${K.nomComplet(c)} · ${motiu}: ${surt}`, tel: { href: K.telHref(c), text: 'Truca al ' + c.client.telefon }, boto: { text: 'Ja ha pagat', accio: 'cobrat', args: { comandaId: c.id } } });
        } else if (c.pagament === 'fallit' || (c.pagament === 'pendent' && c.metodePagament !== 'efectiu')) {
          // Ja ha sortit (o ja la té) i el cobrament falla o queda pendent: el paquet no es para, però s'ha de cobrar
          const on = c.entregada ? 'ja la té' : t ? `ja ha sortit amb la tanda ${t.numero}` : 'ja la té';
          const motiu = c.pagament === 'fallit' ? 'No s’ha pogut cobrar' : 'Encara no ha pagat';
          sortida.push({ id: (c.pagament === 'fallit' ? 'pagament-fallit:' : 'pagament-pendent:') + c.id, prioritat: 'bloqueja', tandaId: c.tandaId || undefined, pas: 'cobrament', titol: `Truca ${c.client.nom} perquè pagui`, detall: `${K.nomComplet(c)} · ${motiu}: ${on} · ${totalText(ctx, c)}`, tel: { href: K.telHref(c), text: 'Truca al ' + c.client.telefon }, boto: { text: 'Ja ha pagat', accio: 'cobrat', args: { comandaId: c.id } } });
        } else if (c.metodePagament === 'efectiu' && c.pagament === 'pendent' && c.entregada) {
          sortida.push({ id: 'pagament-pendent:' + c.id, prioritat: 'data', tandaId: c.tandaId || undefined, pas: 'cobrament', titol: `Cobra en efectiu la comanda ${K.de(c.client.nom)}: ${totalText(ctx, c)}`, detall: `${K.nomComplet(c)} · ja l’ha rebuda · ${K.tandaText(c)}`, boto: { text: 'Ja l’he cobrada', accio: 'cobrat', args: { comandaId: c.id } } });
        }
      }
      return sortida;
    },
    accions: {
      cobrat(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c) return;
        const r = cobra(ctx, c);
        if (r.ok && ui && ui.flaix) ui.flaix(r.moguda ? `Fet. La comanda ${K.de(c.client.nom)} és cobrada i va a la tanda ${r.moguda.a}.` : `Fet. La comanda ${K.de(c.client.nom)} és cobrada.`);
      },
      cobrament(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c || !ctx.M.potFer('cobrament', { comandaId: c.id }).ok) return;
        const cos = c.pagament === 'fallit'
          ? `No s’ha pogut cobrar la comanda ${K.de(esc(K.nomComplet(c)))}. Truca i demana que torni a pagar.`
          : `La comanda ${K.de(esc(K.nomComplet(c)))} encara no s’ha pagat. Truca i demana que la pagui${c.metodePagament === 'enllac' ? ' amb l’enllaç' : ''}.`;
        const mou = ctx.M.retinguda(c.id) && c.tandaId;
        ui.dialeg(c.pagament === 'fallit' ? 'Cobrament fallit' : 'Per cobrar', `<p>${cos} No surt fins que pagui.</p><p><a class="boto boto-lleu" href="${esc(K.telHref(c))}">Truca al ${esc(c.client.telefon)}</a></p>`, [
          { text: 'Ja ha pagat', primari: true, accio: () => pagaments.accions.cobrat(ctx, a, ui) },
          mou ? { text: 'Mou-la a la tanda següent', accio: () => pagaments.accions.mou(ctx, a, ui) } : null,
          { text: 'Tanca' },
        ].filter(Boolean));
      },
      mou(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c) return;
        const r = ctx.M.mouRetinguda(c.id);
        if (r.ok && ui && ui.flaix) ui.flaix(`Fet. La comanda ${K.de(c.client.nom)} va a la tanda ${r.a}.`);
      },
      retorna(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c) return;
        const f = K.factura(ctx, c.id);
        const avis = f ? `<p>Aquesta comanda ja té la factura ${esc(f.numero)}: pregunta a la gestoria què cal fer-hi.</p>` : '';
        // Què passa amb la comanda: si ja ha sortit, el paquet no es perd (la tanda l'espera); si no, deixa lloc a la tanda
        const t = c.tandaId ? ctx.M.tanda(c.tandaId) : null;
        const sortida = t && ['enviada', 'entregada'].includes(t.estat) && !ctx.M.retinguda(c.id);
        const que = c.entregada
          ? ''
          : sortida
            ? `<p class="fila-detall">La comanda ja ha sortit amb la tanda ${t.numero}: se segueix fins que arribi (la tanda l’espera), però no rebrà cap correu d’entrega ni d’opinió.</p>`
            : t
              ? `<p class="fila-detall">Ja no sortirà amb la tanda ${t.numero}, i el lloc queda lliure.</p>`
              : '<p class="fila-detall">Ja no s’entregarà.</p>';
        ui.dialeg('Retorna el pagament', `<p>Vols retornar els diners de la comanda ${K.de(esc(K.nomComplet(c)))} (${esc(totalText(ctx, c))})?${c.client.email ? ' Li enviarem un correu.' : ''}</p>${que}${avis}`, [
          { text: 'Sí, retorna’ls', primari: true, accio: () => pagaments.accions['retorna-fet'](ctx, a, ui) },
          ui.cancela,
        ]);
      },
      'retorna-fet'(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c) return;
        const r = retorna(ctx, c);
        if (r.ok && ui && ui.flaix) ui.flaix(r.correu ? 'Fet. Hem enviat el correu a ' + c.client.nom + '.' : 'Fet. Diners retornats.');
      },
    },
    seccions: [
      {
        on: 'comanda',
        id: 'pagament',
        html(ctx, c) {
          const boto = c.pagament === 'pagat' || c.pagament === 'recurrent'
            ? '<button type="button" class="boto boto-lleu" data-pagaments="retorna">Retorna el pagament</button>'
            : c.pagament === 'pendent' || c.pagament === 'fallit'
              ? '<button type="button" class="boto" data-pagaments="cobrat">Ja ha pagat</button>'
              : '';
          const retornat = c.historial.filter((h) => h.tipus === 'pagament' && h.estat === 'retornat').pop();
          const dl = [
            ['Estat', esc(K.ESTAT_PAG[c.pagament] || c.pagament)],
            ['Forma de pagament', esc(K.FORMA_PAG[c.metodePagament] || c.metodePagament)],
            ['Comissió (de mostra)', K.esPassarela(c) ? esc(ctx.D.pagament.comissioMostra) : 'Cap'],
            retornat ? ['Retornat', esc(ctx.C.dataHora(retornat.data))] : null,
          ].filter(Boolean);
          return `<section class="targeta"><h3>Cobrament</h3><dl class="dades">${dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>${boto ? `<div class="accions">${boto}</div>` : ''}</section>`;
        },
        despres(el, ctx, c) {
          const retorn = $(el, '[data-pagaments="retorna"]');
          const cob = $(el, '[data-pagaments="cobrat"]');
          if (retorn) retorn.addEventListener('click', () => pagaments.accions.retorna(ctx, { comandaId: c.id }, ctx.ui));
          if (cob) cob.addEventListener('click', () => pagaments.accions.cobrat(ctx, { comandaId: c.id }, ctx.ui));
        },
      },
    ],
    vista: {
      id: 'pagaments',
      nom: 'Pagaments',
      render(ctx, param) {
        const { M } = ctx;
        const tandes = M.tandes().slice().reverse();
        const triada = tandes.find((t) => t.id === param) || tandes.find((t) => t.id === (M.tandaActual() || {}).id) || tandes[0];
        const cs = triada ? M.comandesDeTanda(triada.id) : [];
        const per = (estat) => cs.filter((c) => (estat === 'pagat' ? c.pagament === 'pagat' || c.pagament === 'recurrent' : c.pagament === estat));
        const cobrades = per('pagat');
        const dl = [
          ['Cobrat', `${K.plural(cobrades.length, 'comanda', 'comandes')} · ${esc(K.diners(ctx, K.suma(cobrades.map(K.totalNum))))}`],
          ['Per cobrar', K.plural(per('pendent').length, 'comanda', 'comandes')],
          ['Cobraments fallits', K.plural(per('fallit').length, 'comanda', 'comandes')],
          ['Retornades', K.plural(per('retornat').length, 'comanda', 'comandes')],
          ['Comissions (de mostra)', `${cobrades.filter(K.esPassarela).length} × ${esc(ctx.D.pagament.comissioMostra)}`],
        ];
        const fila = (c) => {
          const boto = c.pagament === 'pagat' || c.pagament === 'recurrent'
            ? `<button type="button" class="boto boto-sec" data-pagaments="retorna" data-id="${esc(c.id)}">Retorna<span class="sr-nomes"> els diners ${K.de(esc(K.nomComplet(c)))}</span></button>`
            : c.pagament === 'pendent' || c.pagament === 'fallit'
              ? `<button type="button" class="boto boto-sec" data-pagaments="cobrat" data-id="${esc(c.id)}">Ja ha pagat<span class="sr-nomes">: ${esc(K.nomComplet(c))}</span></button>`
              : '';
          return `<li class="fila"><a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}"><span class="fila-nom"><strong>${esc(K.nomComplet(c))}</strong></span><span class="fila-detall">${esc(ctx.C.producte(c.producte, c.lots))} · ${esc(K.FORMA_PAG[c.metodePagament] || '')} · ${esc(K.ESTAT_PAG[c.pagament])} · ${esc(totalText(ctx, c))}</span></a>${boto}</li>`;
        };
        const html = `<h2>Pagaments</h2><p class="flaix" role="status" hidden></p>
          ${tandes.length ? `<div class="filtres"><div class="camp-pla"><label for="pg-tanda">Tanda</label><select id="pg-tanda">${tandes.map((t) => `<option value="${esc(t.id)}"${triada && t.id === triada.id ? ' selected' : ''}>Tanda ${t.numero} · ${esc(ctx.ESTATS[t.estat])}</option>`).join('')}</select></div></div>` : ''}
          <section class="targeta"><dl class="dades dades-resum">${dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl></section>
          ${cs.length ? `<ul class="fileres">${cs.map(fila).join('')}</ul>` : '<p class="buit">Aquesta tanda encara no té comandes.</p>'}`;
        return {
          html,
          despres(v) {
            const s = $(v, '#pg-tanda');
            if (s) s.addEventListener('change', () => ctx.ui.navega('#pagaments=' + encodeURIComponent(s.value)));
            $$(v, '[data-pagaments]').forEach((b) => b.addEventListener('click', () => pagaments.accions[b.dataset.pagaments](ctx, { comandaId: b.dataset.id }, ctx.ui)));
          },
        };
      },
    },
  };

  /* ===================================== FACTURES ===================================== */

  // El pas que cal fer abans, amb el seu botó (cap botó pot acabar en un carreró): apuntar els kg o mirar el cobrament.
  // Si el que falta encara no es pot fer (la carn no s'ha demanat), el botó porta a la tanda, on es veu.
  function pasPrevi(ctx, c) {
    const p = ctx.M.potFacturar(c.id);
    if (p.error === 'no_cobrada') return { text: 'Veure la comanda', hash: '#comanda=' + c.id };
    if (p.error === 'falten_kg') return ctx.M.potFer('kg-reals', { tandaId: c.tandaId }).ok ? { text: 'Apunta els kg', accio: 'apunta-kg', args: { tandaId: c.tandaId } } : { text: 'Veure la tanda', hash: '#tanda=' + c.tandaId };
    return null;
  }

  // Per què una comanda encara no es pot facturar (null = es pot): cobrament → factura, kg reals → factura (recorregut)
  function blocatFactura(ctx, c) {
    const p = ctx.M.potFacturar(c.id);
    if (p.ok || p.error === 'ja_facturada') return null;
    if (p.error === 'no_cobrada') return 'Encara no s’ha cobrat la comanda.';
    return p.carnDemanada ? `Primer apunta els kg reals de la tanda ${c.tandaNumero}.` : `Encara no hi ha els kg reals: la carn de la tanda ${c.tandaNumero} no s’ha demanat a l’escorxador.`;
  }

  // Emet les factures de les comandes (numeració correlativa, una sola vegada per comanda). Torna els ids que s'han emès.
  // Només les que el recorregut deixa facturar (cobrades i amb els kg reals): cap botó no se'l pot saltar.
  function emet(ctx, triades) {
    const ids = triades.filter((id) => ctx.M.potFacturar(id).ok);
    const nous = [];
    if (!ids.length) return nous;
    ctx.M.modulActualitza('factures', (d) => {
      d.emeses = d.emeses || {};
      d.ultima = d.ultima || 0;
      for (const id of ids) {
        if (d.emeses[id]) continue;
        d.ultima += 1;
        d.emeses[id] = { n: d.ultima, data: ctx.ara().toISOString() };
        nous.push(id);
      }
    });
    if (!nous.length) return nous;
    const f = nous.map((id) => K.factura(ctx, id));
    const c0 = ctx.M.comanda(nous[0]);
    if (nous.length === 1) ctx.M.registraEsdeveniment({ tipus: 'factura-emesa', origen: 'factures', comandaId: c0.id, tandaId: c0.tandaId || undefined, dades: { nom: K.nomComplet(c0), numero: f[0].numero }, vist: true });
    else ctx.M.registraEsdeveniment({ tipus: 'factura-emesa', origen: 'factures', tandaId: c0.tandaId || undefined, dades: { n: nous.length, tandaNumero: nous.every((id) => ctx.M.comanda(id).tandaNumero === c0.tandaNumero) ? c0.tandaNumero : null, desde: f[0].numero, fins: f[f.length - 1].numero }, vist: true });
    const demanades = ctx.M.esdeveniments({ tipus: 'factura-demanada', vist: false }).filter((ev) => nous.includes(ev.comandaId)).map((ev) => ev.id);
    if (demanades.length) ctx.M.marcaEsdevenimentsVists(demanades);
    return nous;
  }

  const lletraFactures = (n, tandaNumero) => (n === 1 ? `Emet la factura de la tanda ${tandaNumero}` : `Emet les ${n} factures de la tanda ${tandaNumero}`);

  function vistaFactura(ctx, c) {
    const f = K.factura(ctx, c.id);
    const k = c.client;
    const kg = K.kgReals(ctx, c);
    const p = ctx.D.productes[c.producte];
    const enrere = `<a class="enrere" href="#factures${c.tandaId ? '=' + encodeURIComponent(c.tandaId) : ''}">Factures</a>`;
    if (!f) return { html: `${enrere}<h2>Factura</h2><p class="buit">Aquesta comanda encara no té factura.</p>` };
    const dl = (parelles) => `<dl class="dades">${parelles.filter((x) => x[1] !== '').map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
    const html = `${enrere}
      <h2>Factura ${esc(f.numero)}</h2>
      <article class="factura" aria-label="Factura ${esc(f.numero)}">
        <p class="factura-marca">Factura de mostra · sense valor fiscal</p>
        <div class="factura-cap">
          <div><strong>Casa Camp</strong><br>NIF: [NIF DEL NEGOCI]<br>${esc(tel(ctx))}</div>
          ${dl([['Factura', esc(f.numero)], ['Data', esc(K.dataLlarga(ctx, f.data))], ['Comanda', esc(c.id)]])}
        </div>
        <div class="factura-client"><h3>Client</h3>${dl([['Nom', esc(K.nomComplet(c))], ['Adreça', esc(c.lliurament === 'recull' ? 'La recull a Sort' : K.adrecaText(k))], ['Correu', esc(k.email)]])}</div>
        <table class="taula factura-linies"><thead><tr><th scope="col">Concepte</th><th scope="col">Quantitat</th><th scope="col">Import</th></tr></thead><tbody>
          <tr><td data-label="Concepte">${esc(p ? p.nom : c.producte)}</td><td data-label="Quantitat">${esc(ctx.C.producte(c.producte, c.lots))}</td><td data-label="Import">${esc(ctx.C.importLots(c.producte, c.lots))}</td></tr>
          <tr><td data-label="Concepte">Enviament</td><td data-label="Quantitat"></td><td data-label="Import">${esc(K.enviamentText(ctx, c))}</td></tr>
        </tbody></table>
        ${kg ? `<p class="factura-nota">Pes real: <strong>${esc(ctx.C.kg(kg.total))} kg</strong> (${kg.lots.map((x, i) => `lot ${i + 1}: ${esc(ctx.C.kg(x))} kg`).join(' · ')}).</p>` : ''}
        <p class="factura-total"><span>Total</span> <strong>${esc(totalText(ctx, c))}</strong></p>
        <p class="factura-nota">Pagament: ${esc(K.FORMA_PAG[c.metodePagament] || '')} · ${esc((K.ESTAT_PAG[c.pagament] || '').toLowerCase())}. IVA: per confirmar amb la gestoria.</p>
      </article>
      <div class="accions no-imprimeix"><button type="button" class="boto" id="fa-imprimeix">Imprimeix la factura</button></div>`;
    return { html, despres: (v) => $(v, '#fa-imprimeix').addEventListener('click', () => window.print()) };
  }

  const factures = {
    esdeveniments: {
      'factura-emesa': {
        nom: 'S’emet una factura',
        origen: 'factures',
        text: (ev) => (ev.dades.n > 1 ? `S’han emès ${ev.dades.n} factures${ev.dades.tandaNumero ? ` de la tanda ${ev.dades.tandaNumero}` : ''} (${ev.dades.desde} a ${ev.dades.fins})` : ev.dades.n === 1 ? `S’ha emès la factura ${ev.dades.desde}${ev.dades.tandaNumero ? ` de la tanda ${ev.dades.tandaNumero}` : ''}` : `S’ha emès la factura ${ev.dades.numero} a ${ev.dades.nom}`),
      },
      'factura-demanada': {
        nom: 'Un comprador demana factura',
        origen: 'client',
        text: (ev) => `${ev.dades.nom} demana la factura de la comanda ${ev.dades.comandaId}`,
        simulador: {
          text: 'Un comprador demana factura',
          dispara(ctx) {
            const sense = ctx.M.comandes().filter((c) => !K.factura(ctx, c.id) && (c.pagament === 'pagat' || c.pagament === 'recurrent'));
            // Millor una que ja es pugui facturar; si no n'hi ha, la tasca explicarà què falta (p. ex. els kg reals)
            const lliures = sense.filter((x) => !blocatFactura(ctx, x));
            const c = lliures.find((x) => /factura/i.test(x.client.notes)) || lliures[0] || sense.find((x) => /factura/i.test(x.client.notes)) || sense[0];
            if (!c) return { ok: false, text: 'Totes les comandes cobrades ja tenen factura.' };
            if (ctx.M.esdeveniments({ tipus: 'factura-demanada' }).some((ev) => ev.comandaId === c.id)) return { ok: false, text: `${c.client.nom} ja ha demanat la factura.` };
            ctx.M.registraEsdeveniment({ tipus: 'factura-demanada', origen: 'client', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c), comandaId: c.id } });
            return { ok: true, text: `${c.client.nom} demana la factura.` };
          },
        },
      },
    },
    tasques(ctx) {
      const sortida = [];
      for (const t of ctx.M.tandes().slice().reverse()) {
        // Les de la tanda, quan ja és tancada i el recorregut deixa facturar (cobrades i amb els kg reals)
        if (!t.tancada) continue;
        const pend = ctx.M.comandesDeTanda(t.id).filter((c) => K.facturable(ctx, c));
        if (!pend.length) continue;
        sortida.push({ id: 'factures-tanda:' + t.id, prioritat: 'data', tandaId: t.id, pas: 'factura', titol: lletraFactures(pend.length, t.numero), detall: ctx.actiu('escorxador') ? 'Amb els kg reals de cada comanda.' : undefined, feina: pend.map((c) => 'factura:' + c.id), boto: { text: pend.length === 1 ? 'Emet-la' : 'Emet-les', accio: 'emet-tanda', args: { tandaId: t.id } } });
      }
      const vistes = new Set();
      for (const ev of ctx.M.esdeveniments({ tipus: 'factura-demanada' })) {
        const c = ctx.M.comanda(ev.comandaId);
        if (!c || vistes.has(c.id) || K.factura(ctx, c.id)) continue;
        vistes.add(c.id);
        // Només és feina quan ja es pot emetre; mentre falta el cobrament o els kg, es veu a la fitxa de la comanda
        if (!K.facturable(ctx, c)) continue;
        // Si una altra tasca ja l'emet (les de la tanda), aquesta no surt: hi afegeix «{nom} la demana» (una tasca per feina)
        sortida.push({ id: 'factura-demanada:' + c.id, prioritat: 'data', tandaId: c.tandaId || undefined, pas: 'factura', titol: `${c.client.nom} demana la factura`, detall: `Comanda ${c.id} · ${K.tandaText(c)}`, feina: ['factura:' + c.id], demanda: `${c.client.nom} la demana`, boto: { text: 'Emet-la', accio: 'emet-una', args: { comandaId: c.id } } });
      }
      return sortida;
    },
    accions: {
      // Primer els kg reals: el botó porta directe al formulari de l'escorxador
      'apunta-kg'(ctx, a, ui) {
        const fes = ctx.accio('escorxador', 'kg');
        if (fes) fes(ctx, a, ui);
      },
      'emet-tanda'(ctx, a, ui) {
        const ids = ctx.M.comandesDeTanda(a.tandaId).filter((c) => K.facturable(ctx, c)).map((c) => c.id);
        factures.accions['emet-comandes'](ctx, { ids }, ui);
      },
      // Les que es puguin d'aquesta llista (també des de la gestoria)
      'emet-comandes'(ctx, a, ui) {
        const nous = emet(ctx, a.ids || []);
        if (nous.length && ui && ui.flaix) ui.flaix(nous.length === 1 ? 'Fet. S’ha emès la factura.' : `Fet. S’han emès ${nous.length} factures.`);
        return nous;
      },
      'emet-una'(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        if (!c || K.factura(ctx, c.id)) return;
        const motiu = blocatFactura(ctx, c);
        if (motiu) {
          const pas = pasPrevi(ctx, c);
          if (ui && ui.dialeg) {
            ui.dialeg('Encara no es pot', `<p>${esc(motiu)}</p>`, [
              pas ? { text: pas.text, primari: true, accio: () => (pas.hash ? ui.navega(pas.hash) : factures.accions[pas.accio](ctx, pas.args, ui) || false) } : { text: 'Tanca', primari: true },
              pas ? { text: 'Tanca' } : null,
            ].filter(Boolean));
          }
          return;
        }
        const nous = emet(ctx, [c.id]);
        if (nous.length && ui && ui.flaix) ui.flaix(`Fet. Factura ${K.factura(ctx, c.id).numero} per a ${c.client.nom}.`);
      },
    },
    seccions: [
      {
        on: 'comanda',
        id: 'factura',
        html(ctx, c) {
          const f = K.factura(ctx, c.id);
          if (f) return `<section class="targeta"><h3>Factura</h3><p>${esc(f.numero)} · ${esc(K.dataLlarga(ctx, f.data))}</p><div class="accions"><a class="boto boto-lleu" href="#factures=${encodeURIComponent(c.id)}">Veure-la</a></div></section>`;
          const motiu = blocatFactura(ctx, c);
          const demanada = ctx.M.esdeveniments({ tipus: 'factura-demanada' }).some((ev) => ev.comandaId === c.id);
          // Si l'ha demanat i encara no es pot emetre, ho diu: no és feina d'«Avui» fins que els kg o el cobrament hi siguin
          const cobrada = c.pagament === 'pagat' || c.pagament === 'recurrent';
          const text = motiu ? (demanada ? `Ha demanat la factura. ${cobrada ? `S’emetrà quan hi hagi els kg reals de la tanda ${c.tandaNumero}.` : 'S’emetrà quan estigui cobrada la comanda.'}` : motiu) : demanada ? 'Ha demanat la factura.' : 'Encara no té factura.';
          return `<section class="targeta"><h3>Factura</h3><p>${esc(text)}</p>${motiu ? '' : '<div class="accions"><button type="button" class="boto" data-factures="emet">Emet la factura</button></div>'}</section>`;
        },
        despres(el, ctx, c) {
          const b = $(el, '[data-factures="emet"]');
          if (b) b.addEventListener('click', () => factures.accions['emet-una'](ctx, { comandaId: c.id }, ctx.ui));
        },
      },
    ],
    vista: {
      id: 'factures',
      nom: 'Factures',
      render(ctx, param) {
        const { M } = ctx;
        if (param && /^CC-/.test(param)) {
          const c = M.comanda(param);
          return c ? vistaFactura(ctx, c) : { html: '<a class="enrere" href="#factures">Factures</a><h2>Factura</h2><p class="buit">No hem trobat aquesta comanda.</p>' };
        }
        const tandes = M.tandes().slice().reverse();
        const triada = tandes.find((t) => t.id === param) || tandes.find((t) => t.id === (M.tandaActual() || {}).id) || tandes[0];
        const cs = triada ? M.comandesDeTanda(triada.id) : [];
        const emeses = cs.filter((c) => K.factura(ctx, c.id));
        const pend = cs.filter((c) => K.facturable(ctx, c) && !blocatFactura(ctx, c));
        const fila = (c) => {
          const f = K.factura(ctx, c.id);
          const motiu = f ? null : blocatFactura(ctx, c);
          const detall = f ? `${f.numero} · ${K.dataLlarga(ctx, f.data)} · ${totalText(ctx, c)}` : motiu || 'Sense factura';
          const boto = f
            ? `<a class="boto boto-sec" href="#factures=${encodeURIComponent(c.id)}">Veure-la<span class="sr-nomes"> ${K.de(esc(K.nomComplet(c)))}</span></a>`
            : motiu ? '' : `<button type="button" class="boto boto-sec" data-factures="emet" data-id="${esc(c.id)}">Emet-la<span class="sr-nomes"> a ${esc(K.nomComplet(c))}</span></button>`;
          return `<li class="fila"><a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}"><span class="fila-nom"><strong>${esc(K.nomComplet(c))}</strong></span><span class="fila-detall">${esc(detall)}</span></a>${boto}</li>`;
        };
        const html = `<h2>Factures</h2><p class="flaix" role="status" hidden></p>
          ${tandes.length ? `<div class="filtres"><div class="camp-pla"><label for="fa-tanda">Tanda</label><select id="fa-tanda">${tandes.map((t) => `<option value="${esc(t.id)}"${triada && t.id === triada.id ? ' selected' : ''}>Tanda ${t.numero} · ${esc(ctx.ESTATS[t.estat])}</option>`).join('')}</select></div></div>` : ''}
          <section class="targeta"><p>${emeses.length} ${K.de(K.plural(cs.length, 'comanda', 'comandes'))} amb factura.</p>${pend.length ? `<div class="accions"><button type="button" class="boto" data-factures="tanda">${pend.length === 1 ? 'Emet la factura pendent' : `Emet les ${pend.length} factures pendents`}</button></div>` : ''}</section>
          ${cs.length ? `<ul class="fileres">${cs.map(fila).join('')}</ul>` : '<p class="buit">Aquesta tanda encara no té comandes.</p>'}`;
        return {
          html,
          despres(v) {
            const s = $(v, '#fa-tanda');
            if (s) s.addEventListener('change', () => ctx.ui.navega('#factures=' + encodeURIComponent(s.value)));
            const b = $(v, '[data-factures="tanda"]');
            if (b) b.addEventListener('click', () => factures.accions['emet-tanda'](ctx, { tandaId: triada.id }, ctx.ui));
            $$(v, '[data-factures="emet"]').forEach((x) => x.addEventListener('click', () => factures.accions['emet-una'](ctx, { comandaId: x.dataset.id }, ctx.ui)));
          },
        };
      },
    },
  };

  /* ===================================== GESTORIA ===================================== */

  const esMes = (clau) => /^\d{4}-\d{2}$/.test(clau);
  const mesAnterior = (avuiISO) => {
    let [a, m] = avuiISO.split('-').map(Number);
    m -= 1;
    if (m < 1) {
      m = 12;
      a -= 1;
    }
    return a + '-' + String(m).padStart(2, '0');
  };

  const comandesDelPeriode = (ctx, clau) => (esMes(clau) ? ctx.M.comandes().filter((c) => c.creada.slice(0, 7) === clau) : ctx.M.comandesDeTanda(clau));
  const nomPeriode = (ctx, clau) => {
    if (esMes(clau)) return K.mesText(clau, ctx);
    const t = ctx.M.tanda(clau);
    return t ? 'la tanda ' + t.numero : clau;
  };

  function resum(ctx, cs) {
    const cobrades = cs.filter((c) => c.pagament === 'pagat' || c.pagament === 'recurrent');
    const factures = ctx.actiu('factures') ? cs.filter((c) => K.factura(ctx, c.id)) : [];
    return {
      comandes: cs.length,
      cobrades: cobrades.length,
      cobrat: K.suma(cobrades.map(K.totalNum)),
      enviament: K.suma(cobrades.map((c) => c.importEnviament || 0)),
      comissions: cobrades.filter(K.esPassarela).length,
      retornades: cs.filter((c) => c.pagament === 'retornat').length,
      pendents: cs.filter((c) => c.pagament === 'pendent' || c.pagament === 'fallit').length,
      factures: factures.length,
      senseFactura: ctx.actiu('factures') ? cobrades.filter((c) => !K.factura(ctx, c.id)).length : 0,
    };
  }

  // Les comandes cobrades del període que encara no tenen factura (amb Factures encès)
  const falten = (ctx, cs) => (ctx.actiu('factures') ? cs.filter((c) => (c.pagament === 'pagat' || c.pagament === 'recurrent') && !K.factura(ctx, c.id)) : []);

  function csvPeriode(ctx, clau) {
    const cs = comandesDelPeriode(ctx, clau).slice().reverse();
    const fac = ctx.actiu('factures');
    const kg = ctx.actiu('escorxador');
    const cap = ['Comanda', 'Data', 'Tanda', 'Client', 'Telèfon', 'Producte', 'Import dels lots', 'Enviament', 'Total', 'Forma de pagament', 'Estat del cobrament', 'Comissió (de mostra)'];
    if (kg) cap.push('Pes real (kg)');
    if (fac) cap.push('Factura');
    const files = cs.map((c) => {
      const fila = [c.id, c.creada.slice(0, 10), c.tandaNumero || '', K.nomComplet(c), c.client.telefon, ctx.C.producte(c.producte, c.lots), ctx.C.importLots(c.producte, c.lots), K.enviamentText(ctx, c), totalText(ctx, c), K.FORMA_PAG[c.metodePagament] || '', K.ESTAT_PAG[c.pagament] || '', K.esPassarela(c) ? ctx.D.pagament.comissioMostra : ''];
      if (kg) fila.push(K.kgReals(ctx, c) ? String(K.kgReals(ctx, c).total).replace('.', ',') : '');
      if (fac) fila.push(K.factura(ctx, c.id) ? K.factura(ctx, c.id).numero : '');
      return fila;
    });
    return { nom: `gestoria-${esMes(clau) ? clau : 'tanda-' + ((ctx.M.tanda(clau) || {}).numero || clau)}.csv`, text: K.csvText(cap, files) };
  }

  function passa(ctx, clau, ui) {
    const csv = csvPeriode(ctx, clau);
    if (ui && ui.descarrega) ui.descarrega(csv.nom, csv.text);
    ctx.M.modulActualitza('gestoria', (d) => {
      d.enviats = d.enviats || {};
      d.enviats[clau] = ctx.ara().toISOString();
    });
    ctx.M.registraEsdeveniment({ tipus: 'gestoria-passat', origen: 'gestoria', dades: { periode: clau, text: nomPeriode(ctx, clau) }, vist: true });
    const demandes = ctx.M.esdeveniments({ tipus: 'gestoria-demana', vist: false }).filter((ev) => ev.dades.periode === clau).map((ev) => ev.id);
    if (demandes.length) ctx.M.marcaEsdevenimentsVists(demandes);
    return csv;
  }
  const passat = (ctx, clau) => (ctx.M.modulDades('gestoria').enviats || {})[clau] || null;

  const gestoria = {
    esdeveniments: {
      'gestoria-demana': {
        nom: 'La gestoria demana les dades',
        origen: 'gestoria',
        text: (ev, ctx) => `La gestoria demana les dades ${K.deMes(ev.dades.periode, ctx)}`,
        simulador: {
          text: 'La gestoria demana les dades del mes',
          dispara(ctx) {
            const clau = mesAnterior(ctx.avui());
            if (passat(ctx, clau)) return { ok: false, text: `Ja has passat a la gestoria les dades ${K.deMes(clau, ctx)}.` };
            if (ctx.M.esdeveniments({ tipus: 'gestoria-demana', vist: false }).some((ev) => ev.dades.periode === clau)) return { ok: false, text: 'La gestoria ja les ha demanades.' };
            ctx.M.registraEsdeveniment({ tipus: 'gestoria-demana', origen: 'gestoria', dades: { periode: clau } });
            return { ok: true, text: `La gestoria demana les dades ${K.deMes(clau, ctx)}.` };
          },
        },
      },
      'gestoria-passat': {
        nom: 'Es passen les dades a la gestoria',
        origen: 'gestoria',
        text: (ev) => `S’han passat a la gestoria les dades ${K.de(ev.dades.text)}`,
      },
    },
    tasques(ctx) {
      const sortida = [];
      const vistos = new Set();
      for (const ev of ctx.M.esdeveniments({ tipus: 'gestoria-demana' })) {
        const clau = ev.dades.periode;
        if (vistos.has(clau) || passat(ctx, clau)) continue;
        vistos.add(clau);
        const cs = comandesDelPeriode(ctx, clau);
        const r = resum(ctx, cs);
        const factura = ctx.actiu('factures') ? ` · ${r.factures} ${r.factures === 1 ? 'factura' : 'factures'}` : '';
        // Només es passen dades completes. Si en falten, el que es pot fer ara és la feina d'una altra tasca (emetre les
        // factures d'una tanda, apuntar-ne els kg): la gestoria no en fa una de nova (una tasca per feina), sinó que hi
        // afegeix «la gestoria les espera» (`demanda`). Si el que falta no té tasca pròpia (factures sense tanda, o d'una tanda
        // que encara no és tancada), la tasca és de la gestoria i diu quantes se'n poden emetre ara i quantes més tard. Si
        // no es pot fer res ara (la tanda és oberta o la carn no ha arribat), no és feina d'avui (ho diu la vista).
        if (r.senseFactura) {
          const espera = `La gestoria les espera (dades ${K.deMes(clau, ctx)})`;
          const facturables = falten(ctx, cs).filter((c) => K.facturable(ctx, c));
          const deTanda = facturables.filter((c) => c.tandaId && (ctx.M.tanda(c.tandaId) || {}).tancada);
          const soles = facturables.filter((c) => !deTanda.includes(c));
          if (deTanda.length) sortida.push({ id: 'gestoria:' + clau + ':factures', prioritat: 'data', titol: `La gestoria vol les dades ${K.deMes(clau, ctx)}: abans, emet les factures de les tandes`, detall: `${K.plural(r.comandes, 'comanda', 'comandes')}${factura} · ${K.plural(r.senseFactura, 'en falta #', 'en falten #')}`, feina: deTanda.map((c) => 'factura:' + c.id), demanda: espera, boto: { text: 'Veure les factures', hash: '#factures' } });
          const tandesKg = Array.from(new Set(falten(ctx, cs).filter((c) => !K.facturable(ctx, c)).map((c) => c.tandaId).filter(Boolean))).map((id) => ctx.M.tanda(id)).filter((x) => x && ctx.actiu('escorxador') && ctx.M.potFer('kg-reals', { tandaId: x.id }).ok);
          for (const t of tandesKg) sortida.push({ id: 'gestoria:' + clau + ':kg:' + t.id, prioritat: 'data', tandaId: t.id, pas: 'kg-reals', titol: `La gestoria vol les dades ${K.deMes(clau, ctx)}: abans, apunta els kg reals de la tanda ${t.numero}`, detall: `${K.plural(r.comandes, 'comanda', 'comandes')}${factura} · ${K.plural(r.senseFactura, 'en falta #', 'en falten #')}`, feina: ['kg:' + t.id], demanda: espera, boto: { text: 'Apunta els kg', accio: 'kg', args: { tandaId: t.id } } });
          if (soles.length) {
            const altres = r.senseFactura - soles.length;
            const ara = soles.length === 1 ? 'emet la factura que ja es pot emetre' : `emet les ${soles.length} factures que ja es poden emetre`;
            const despres = altres ? ` · ${altres === 1 ? 'l’altra, quan es pugui fer' : `les altres ${altres}, quan es puguin fer`}` : '';
            sortida.push({ id: 'gestoria:' + clau, prioritat: 'data', titol: `La gestoria vol les dades ${K.deMes(clau, ctx)}: abans, ${ara}`, detall: `${K.plural(r.comandes, 'comanda', 'comandes')}${factura} · ${K.plural(r.senseFactura, 'en falta #', 'en falten #')}${despres}`, feina: soles.map((c) => 'factura:' + c.id), boto: { text: soles.length === 1 ? 'Emet-la' : 'Emet-les', accio: 'emet', args: { clau, ids: soles.map((c) => c.id) } } });
          }
          continue;
        }
        sortida.push({ id: 'gestoria:' + clau, prioritat: 'data', titol: `La gestoria vol les dades ${K.deMes(clau, ctx)}`, detall: `${K.plural(r.comandes, 'comanda', 'comandes')}${factura}`, boto: { text: 'Passa-les', accio: 'passa', args: { clau } } });
      }
      return sortida;
    },
    accions: {
      emet(ctx, a, ui) {
        const fes = ctx.accio('factures', 'emet-comandes');
        if (fes) fes(ctx, { ids: a.ids || falten(ctx, comandesDelPeriode(ctx, a.clau)).map((c) => c.id) }, ui);
      },
      kg(ctx, a, ui) {
        const fes = ctx.accio('escorxador', 'kg');
        if (fes) fes(ctx, { tandaId: a.tandaId }, ui);
      },
      passa(ctx, a, ui) {
        passa(ctx, a.clau, ui);
        if (ui && ui.flaix) ui.flaix(`Fet. Hem baixat l’Excel ${K.deMes(a.clau, ctx)} i queda apuntat que l’has passat.`);
      },
    },
    vista: {
      id: 'gestoria',
      nom: 'Gestoria',
      render(ctx, param) {
        const { M } = ctx;
        const tandes = M.tandes().slice().reverse();
        const mesos = Array.from(new Set(M.comandes().map((c) => c.creada.slice(0, 7)))).sort().reverse();
        const clau = param && (esMes(param) ? mesos.includes(param) : M.tanda(param)) ? param : tandes.length ? (M.tandaActual() || tandes[0]).id : mesos[0];
        const cs = clau ? comandesDelPeriode(ctx, clau) : [];
        const r = resum(ctx, cs);
        const enviat = clau ? passat(ctx, clau) : null;
        const dl = [
          ['Comandes', `${r.comandes} (${K.plural(r.cobrades, 'cobrada', 'cobrades')})`],
          ['Cobrat', esc(K.diners(ctx, r.cobrat))],
          ['Enviament', esc(K.diners(ctx, r.enviament))],
          ['Comissions (de mostra)', `${r.comissions} × ${esc(ctx.D.pagament.comissioMostra)}`],
          ['Per cobrar o fallides', String(r.pendents)],
          ['Retornades', String(r.retornades)],
          ctx.actiu('factures') ? ['Factures', `${K.plural(r.factures, 'emesa', 'emeses')}${r.senseFactura ? ` · ${K.plural(r.senseFactura, 'en falta #', 'en falten #')}` : ''}`] : null,
        ].filter(Boolean);
        const html = `<h2>Gestoria</h2><p class="flaix" role="status" hidden></p>
          <div class="filtres"><div class="camp-pla"><label for="ge-periode">Dades de</label><select id="ge-periode">
            <optgroup label="Per tanda">${tandes.map((t) => `<option value="${esc(t.id)}"${t.id === clau ? ' selected' : ''}>Tanda ${t.numero}</option>`).join('')}</optgroup>
            <optgroup label="Per mes">${mesos.map((m) => `<option value="${esc(m)}"${m === clau ? ' selected' : ''}>${esc(K.mesText(m, ctx))}</option>`).join('')}</optgroup>
          </select></div></div>
          <section class="targeta"><dl class="dades dades-resum">${dl.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
            ${enviat ? `<p class="fila-detall">Passades a la gestoria el ${esc(K.dataLlarga(ctx, enviat))}.</p>` : ''}
            <div class="accions"><button type="button" class="boto" data-gestoria="csv">Baixa-ho en Excel (CSV)</button><button type="button" class="boto boto-lleu" data-gestoria="passat">${enviat ? 'Torna-ho a apuntar' : 'Ja ho he passat a la gestoria'}</button></div>
          </section>`;
        return {
          html,
          despres(v) {
            const s = $(v, '#ge-periode');
            s.addEventListener('change', () => ctx.ui.navega('#gestoria=' + encodeURIComponent(s.value)));
            $(v, '[data-gestoria="csv"]').addEventListener('click', () => {
              const csv = csvPeriode(ctx, clau);
              if (ctx.ui.descarrega) ctx.ui.descarrega(csv.nom, csv.text);
            });
            $(v, '[data-gestoria="passat"]').addEventListener('click', () => {
              passa(ctx, clau, ctx.ui);
              ctx.ui.flaix('Apuntat: ho has passat a la gestoria.');
            });
          },
        };
      },
    },
    csvPeriode,
    resum,
  };

  return { pagaments, factures, gestoria };
});
