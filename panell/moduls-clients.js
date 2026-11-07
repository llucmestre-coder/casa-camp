/* Casa Camp — mòduls de la relació amb el comprador: comandes per telèfon, clients que repeteixen i opinió en arribar el
   paquet (panell/moduls.js els declara; aquí hi ha el contingut). Encaix: la comanda per telèfon entra a la tanda amb la
   mateixa assignació que la web (`M.crearComanda`); «entregat» (`M.alEntregar`) demana l'opinió en aquell mateix moment;
   la fitxa del client llegeix les comandes (una persona = un telèfon o un correu) i, si l'opinió és encesa, les seves
   respostes. Cap dada es desa dues vegades: els clients són derivats de les comandes. */
(function (arrel, fabrica) {
  const K = typeof module === 'object' && module.exports ? require('./moduls-comu.js') : arrel.CassovallModulsComu;
  const exportat = fabrica(K);
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) arrel.CassovallModulsClients = exportat;
})(typeof window !== 'undefined' ? window : null, function (K) {
  'use strict';

  const { esc } = K;
  const $ = (el, s) => el.querySelector(s);
  const $$ = (el, s) => Array.from(el.querySelectorAll(s));
  const tel = (ctx) => ctx.D.contacte.telefons[0];
  const signatura = (ctx) => `Casa Camp\n${tel(ctx)}`;
  const ahora = (ctx) => ctx.ara().toISOString();
  const enllac = (clau) => '#clients=' + encodeURIComponent(clau);

  /* ===================================== COMANDES PER TELÈFON ===================================== */

  // Compradors de mostra per al simulador (telèfons de format vàlid però inventats; correus `.invalid`)
  const TELEFONATS = [
    { nom: 'Jofre', cognoms: 'Trucat', telefon: '600000201', email: 'jofre@exemple.invalid', adreca: 'Carrer de Prova, 5', cp: '25560', poblacio: 'Sort', metodePagament: 'efectiu' },
    { nom: 'Berta', cognoms: 'Telefonada', telefon: '600000202', email: 'berta@exemple.invalid', adreca: 'Carrer Demo, 8', cp: '08001', poblacio: 'Barcelona', metodePagament: 'enllac' },
    { nom: 'Oleguer', cognoms: 'Trucada', telefon: '600000203', email: '', adreca: '', cp: '', poblacio: '', metodePagament: 'pendent', recull: true },
  ];
  const LOTS_TELEFONATS = [2, 1, 3];

  const ERRORS_TELEFON = {
    nom: 'Posa el nom.',
    telefon: 'Posa un telèfon vàlid (9 xifres).',
    email: 'El correu no és vàlid.',
    adreca: 'Posa l’adreça, el codi postal i la població, o tria «La recull».',
    cp: 'Posa l’adreça, el codi postal i la població, o tria «La recull».',
    poblacio: 'Posa l’adreça, el codi postal i la població, o tria «La recull».',
  };

  // On aniria una comanda d'aquests lots (el mateix càlcul que la web)
  function previsio(ctx, lots) {
    const p = ctx.M.previsioAssignacio(lots, 'lot');
    if (!p.ok) return `Posa un número de lots entre 1 i ${ctx.M.maxLotsPerComanda('lot')}.`;
    const pr = p.primera;
    if (p.motiu === 'hi-cap') return `Hi cap a la tanda ${p.tandaNumero} (hi ${pr.placesLliures === 1 ? 'queda 1 lot' : 'queden ' + pr.placesLliures + ' lots'}).`;
    if (p.motiu === 'tanda-nova') return `No hi cap a la tanda ${pr.numero} (hi ${pr.placesLliures === 1 ? 'queda 1 lot' : 'queden ' + pr.placesLliures + ' lots'}). Anirà a la tanda ${p.tandaNumero}, que s’obrirà ara.`;
    return `No hi cap a la tanda ${pr.numero} (hi ${pr.placesLliures === 1 ? 'queda 1 lot' : 'queden ' + pr.placesLliures + ' lots'}). Anirà a la tanda ${p.tandaNumero}, oberta fins al ${ctx.C.dataCurta(p.dataLimit)}.`;
  }

  // Crea la comanda i, si toca, el correu amb l'enllaç de pagament (del mòdul de pagaments)
  function altaTelefon(ctx, entrada) {
    const r = ctx.M.crearComanda(Object.assign({ origen: 'telefon' }, entrada));
    if (!r.ok) return r;
    const c = r.comanda;
    if (c.metodePagament === 'enllac' && c.client.email && ctx.actiu('pagaments')) ctx.M.registraCorreu({ plantilla: 'enllac-pagament', comandaId: c.id, motiu: 'enllac-pagament' });
    return r;
  }

  const EFECTIU_EN_MA = 'En efectiu només si la recull a Sort o si li portes tu: amb la caixa no hi ha qui el cobri. Tria l’enllaç de pagament.';

  function formAlta(ctx, ui) {
    const lotsMax = ctx.M.maxLotsPerComanda('lot');
    const camp = (id, etiqueta, extra) => `<div class="camp-pla"><label for="${id}">${etiqueta}</label><input id="${id}" ${extra || ''}></div>`;
    const cos = `<div class="form-telefon">
      ${camp('tf-nom', 'Nom i cognoms', 'type="text" autocomplete="off"')}
      ${camp('tf-telefon', 'Telèfon', 'type="tel" inputmode="tel" autocomplete="off"')}
      ${camp('tf-lots', 'Lots', `type="number" inputmode="numeric" min="1" max="${lotsMax}" value="1"`)}
      <p class="fila-detall" id="tf-prev" aria-live="polite"></p>
      <fieldset class="opcions"><legend>Entrega</legend>
        <label><input type="radio" name="tf-entrega" value="casa" checked> A l’adreça</label>
        <label><input type="radio" name="tf-entrega" value="recull"> La recull a Sort</label>
      </fieldset>
      <div id="tf-adreca">${camp('tf-adr', 'Adreça', 'type="text" autocomplete="off"')}${camp('tf-cp', 'Codi postal', 'type="text" inputmode="numeric" autocomplete="off"')}${camp('tf-pob', 'Població', 'type="text" autocomplete="off"')}</div>
      <div class="camp-pla"><label for="tf-pagament">Pagament</label><select id="tf-pagament"><option value="pendent">Encara no ho sé</option><option value="efectiu">En efectiu</option><option value="enllac">Enllaç de pagament</option></select></div>
      ${camp('tf-email', 'Correu (si en té)', 'type="email" inputmode="email" autocomplete="off"')}
      <p class="error-pla" id="tf-err" role="alert" hidden></p></div>`;
    const d = ui.dialeg('Comanda per telèfon', cos, [
      {
        text: 'Apunta-la',
        primari: true,
        accio: (dlg) => {
          const nomSencer = $(dlg, '#tf-nom').value.trim().split(/\s+/);
          const recull = $(dlg, 'input[name="tf-entrega"]:checked').value === 'recull';
          const r = altaTelefon(ctx, {
            lots: Number($(dlg, '#tf-lots').value),
            recull,
            metodePagament: $(dlg, '#tf-pagament').value,
            client: { nom: nomSencer[0] || '', cognoms: nomSencer.slice(1).join(' '), telefon: $(dlg, '#tf-telefon').value, email: $(dlg, '#tf-email').value, adreca: $(dlg, '#tf-adr').value, cp: $(dlg, '#tf-cp').value, poblacio: $(dlg, '#tf-pob').value },
          });
          if (!r.ok) {
            const e = $(dlg, '#tf-err');
            const primer = r.errors && Object.keys(r.errors)[0];
            e.textContent = primer ? ERRORS_TELEFON[primer] : r.error === 'efectiu_nomes_en_ma' ? EFECTIU_EN_MA : r.error === 'no_enviem' ? 'Fora de Catalunya no s’hi envia.' : r.error === 'enviament_incomplet' ? 'Posa a la població un dels pobles amb entrega a casa, o tria «La recull a Sort».' : r.error === 'massa_lots' || r.error === 'lots_invalids' ? `Posa un número de lots entre 1 i ${lotsMax}.` : 'No s’ha pogut apuntar la comanda.';
            e.hidden = false;
            return false;
          }
          const a = r.assignacio;
          ui.flaix(a.motiu === 'hi-cap' ? `Fet. Ha anat a la tanda ${a.tandaNumero}.` : `Fet. A la tanda ${a.primera.numero} no hi cabia: ha anat a la tanda ${a.tandaNumero}.`);
        },
      },
      ui.cancela,
    ]);
    const lots = $(d, '#tf-lots');
    const pinta = () => { $(d, '#tf-prev').textContent = previsio(ctx, Number(lots.value)); };
    lots.addEventListener('input', pinta);
    pinta();
    $$(d, 'input[name="tf-entrega"]').forEach((i) => i.addEventListener('change', () => { $(d, '#tf-adreca').hidden = $(d, 'input[name="tf-entrega"]:checked').value === 'recull'; }));
    // L'efectiu es cobra en entregar, en mà: si el porta el transportista (codi postal de fora de la zona), no es pot triar
    const pag = $(d, '#tf-pagament');
    const efectiu = $(d, '#tf-pagament option[value="efectiu"]');
    const potEfectiu = () => {
      if ($(d, 'input[name="tf-entrega"]:checked').value === 'recull') return true;
      const cp = $(d, '#tf-cp').value.trim();
      if (!/^\d{5}$/.test(cp)) return true;
      const cost = ctx.D.costEnviament(cp, { mode: 'casa' });
      return !!cost.valid && cost.zona === 'rodalies';
    };
    const revisa = () => {
      const pot = potEfectiu();
      efectiu.disabled = !pot;
      efectiu.textContent = pot ? 'En efectiu' : 'En efectiu (només si la recull o li portes tu)';
      if (!pot && pag.value === 'efectiu') pag.value = 'pendent';
    };
    $(d, '#tf-cp').addEventListener('input', revisa);
    $$(d, 'input[name="tf-entrega"]').forEach((i) => i.addEventListener('change', revisa));
  }

  const comandesTelefon = {
    simuladors: [
      {
        id: 'truca',
        text: 'Truca un client i fa una comanda',
        dispara(ctx) {
          const n = ctx.M.comandes().filter((c) => c.origen === 'telefon').length;
          const x = TELEFONATS[n % TELEFONATS.length];
          const lots = LOTS_TELEFONATS[n % LOTS_TELEFONATS.length];
          const r = altaTelefon(ctx, { lots, recull: !!x.recull, metodePagament: x.metodePagament, simulat: true, client: { nom: x.nom, cognoms: x.cognoms, telefon: x.telefon, email: x.email, adreca: x.adreca, cp: x.cp, poblacio: x.poblacio } });
          if (!r.ok) return { ok: false, text: 'No s’ha pogut apuntar la comanda.' };
          const a = r.assignacio;
          return { ok: true, text: `${x.nom} ha trucat: ${ctx.C.lots(lots)}, tanda ${a.tandaNumero}${a.motiu === 'hi-cap' ? '' : ' (no hi cabia a la ' + a.primera.numero + ')'}.` };
        },
      },
    ],
    seccions: [
      {
        on: 'comandes',
        id: 'alta-telefon',
        html: () => '<section class="targeta"><h3>Per telèfon</h3><p>T’ha trucat algú per fer una comanda?</p><div class="accions"><button type="button" class="boto" data-telefon="alta">Apunta una comanda per telèfon</button></div></section>',
        despres: (el, ctx) => $(el, '[data-telefon="alta"]').addEventListener('click', () => formAlta(ctx, ctx.ui)),
      },
    ],
    formAlta,
    previsio,
  };

  /* ===================================== OPINIONS ===================================== */

  const respostesDe = (ctx) => ctx.M.modulDades('opinions').respostes || {};
  const textNota = (n) => `${n} de 5`;
  const TEXTS_MOSTRA = { 5: 'Tot perfecte, la carn molt bona.', 4: 'Molt bé. Va arribar ben fred.', 2: 'Va arribar tard i no prou fred.' };

  const opinions = {
    // El comprador té la comanda: se li demana l'opinió en aquell mateix moment
    alEntregar(c, ctx) {
      if (!c.client.email || c.lliurament === 'recull' || c.pagament === 'retornat') return; // retornada: ja no és clienta d'aquesta comanda
      if (ctx.M.correus({ comandaId: c.id, plantilla: 'opinio-demanada' }).length) return;
      ctx.M.registraCorreu({ plantilla: 'opinio-demanada', comandaId: c.id, motiu: 'entrega' });
    },
    correus: [
      {
        plantilla: 'opinio-demanada',
        text: (m, ctx) => {
          const c = m.dades.comanda;
          return {
            assumpte: 'Com t’ha arribat la comanda?',
            cos: [`Hola, ${c.client.nom}:`, '', 'La teva comanda ja és a casa. Ens ajudes dient-nos com t’ha arribat?', '', '[ENLLAÇ PER RESPONDRE]', '', 'Gràcies.', '', signatura(ctx)].join('\n'),
          };
        },
      },
    ],
    esdeveniments: {
      'opinio-rebuda': {
        nom: 'Un comprador respon',
        origen: 'client',
        text: (ev) => `${ev.dades.nom} ha respost: ${textNota(ev.dades.nota)}`,
        simulador: {
          text: 'Un comprador respon l’opinió',
          dispara(ctx) {
            const resp = respostesDe(ctx);
            const m = ctx.M.correus({ plantilla: 'opinio-demanada' }).reverse().find((x) => !resp[x.comandaId]);
            if (!m) return { ok: false, text: 'Cap comprador espera. Entrega una comanda abans.' };
            const c = ctx.M.comanda(m.comandaId);
            const nota = [5, 4, 5, 2, 5, 4][Object.keys(resp).length % 6];
            ctx.M.modulActualitza('opinions', (d) => {
              d.respostes = d.respostes || {};
              d.respostes[c.id] = { data: ahora(ctx), nota, text: TEXTS_MOSTRA[nota] };
            });
            ctx.M.registraEsdeveniment({ tipus: 'opinio-rebuda', origen: 'client', comandaId: c.id, tandaId: c.tandaId || undefined, dades: { nom: K.nomComplet(c), nota, text: TEXTS_MOSTRA[nota] } });
            return { ok: true, text: `${c.client.nom} ha respost: ${textNota(nota)}.` };
          },
        },
      },
    },
    tasques(ctx) {
      const sortida = [];
      const nous = ctx.M.esdeveniments({ tipus: 'opinio-rebuda', vist: false });
      const bones = nous.filter((ev) => ev.dades.nota >= 3);
      for (const ev of nous.filter((x) => x.dades.nota < 3)) {
        sortida.push({ id: 'opinio-mala:' + ev.id, prioritat: 'data', tandaId: (ctx.M.comanda(ev.comandaId) || {}).tandaId || undefined, pas: 'opinio', titol: `${ev.dades.nom} ha puntuat ${textNota(ev.dades.nota)}: mira què diu`, detall: ev.dades.text || undefined, boto: { text: 'Veure-la', hash: '#opinions' } });
      }
      if (bones.length) sortida.push({ id: 'opinions-noves', prioritat: 'info', titol: bones.length === 1 ? 'Hi ha 1 opinió nova' : `Hi ha ${bones.length} opinions noves`, boto: { text: 'Veure-les', hash: '#opinions' } });
      return sortida;
    },
    seccions: [
      {
        on: 'comanda',
        id: 'opinio',
        html(ctx, c) {
          const o = K.opinio(ctx, c.id);
          if (!o) return '';
          const cos = o.resposta
            ? `<p><strong>${esc(textNota(o.resposta.nota))}</strong>${o.resposta.text ? ` · «${esc(o.resposta.text)}»` : ''}</p><p class="fila-detall">${esc(ctx.C.dataHora(o.resposta.data))}</p>`
            : `<p>Demanada el ${esc(ctx.C.dataHora(o.demanada.data))}. Encara no ha respost.</p>`;
          return `<section class="targeta"><h3>Opinió</h3>${cos}</section>`;
        },
      },
    ],
    vista: {
      id: 'opinions',
      nom: 'Opinions',
      render(ctx) {
        const resp = respostesDe(ctx);
        const respostes = Object.keys(resp)
          .map((id) => ({ c: ctx.M.comanda(id), r: resp[id] }))
          .filter((x) => x.c)
          .sort((a, b) => (a.r.data < b.r.data ? 1 : -1));
        const demanades = ctx.M.correus({ plantilla: 'opinio-demanada' });
        const esperant = demanades.filter((m) => !resp[m.comandaId]).map((m) => ({ m, c: ctx.M.comanda(m.comandaId) })).filter((x) => x.c);
        const mitjana = respostes.length ? Math.round((K.suma(respostes.map((x) => x.r.nota)) / respostes.length) * 10) / 10 : null;
        const clients = ctx.actiu('clients');
        const nom = (c) => (clients ? `<a href="${enllac(ctx.M.clauClient(c.client))}">${esc(K.nomComplet(c))}</a>` : esc(K.nomComplet(c)));
        const html = `<h2>Opinions</h2>
          <section class="targeta"><p>${respostes.length ? `Nota mitjana: <strong>${esc(ctx.C.kg(mitjana))} de 5</strong> · ${K.plural(respostes.length, 'resposta', 'respostes')}` : 'Encara no ha respost ningú.'}${esperant.length ? ` · ${esperant.length} esperant resposta` : ''}</p></section>
          ${respostes.length ? `<ul class="fileres">${respostes.map(({ c, r }) => `<li class="fila"><span class="fila-text"><span class="fila-nom"><strong>${nom(c)}</strong> · ${esc(textNota(r.nota))}</span>${r.text ? `<span>«${esc(r.text)}»</span>` : ''}<span class="fila-detall">${esc(ctx.C.dataHora(r.data))} · <a href="#comanda=${encodeURIComponent(c.id)}">Comanda ${esc(c.id)}</a></span></span></li>`).join('')}</ul>` : ''}
          ${esperant.length ? `<h3>Esperant resposta</h3><ul class="fileres">${esperant.map(({ m, c }) => `<li class="fila"><span class="fila-text"><span class="fila-nom"><strong>${nom(c)}</strong></span><span class="fila-detall">Demanada el ${esc(ctx.C.dataHora(m.data))}</span></span></li>`).join('')}</ul>` : ''}`;
        // Mirar-les és haver-les vistes: les tasques informatives marxen soles
        return { html, despres: () => ctx.M.marcaEsdevenimentsVists({ tipus: 'opinio-rebuda' }) };
      },
    },
  };

  /* ===================================== CLIENTS ===================================== */

  // Qui s'ha d'avisar que s'ha obert una tanda: tots els compradors amb correu que encara no hi han comprat, no s'han avisat i no han refusat els avisos
  function aAvisar(ctx, t) {
    const jaAvisats = ((ctx.M.modulDades('clients').avisos || {})[t.id] || {}).claus || [];
    const han = new Set(ctx.M.comandesDeTanda(t.id).map((c) => ctx.M.clauClient(c.client)));
    // P45 (art. 21.2 LSSI): qui ha marcat «No vull rebre aquests avisos» en una comanda no rep cap avís
    return K.clients(ctx).filter((x) => x.client.email && !han.has(x.clau) && !jaAvisats.includes(x.clau) && !x.comandes.some((c) => c.avisosTanda === false));
  }

  function avisa(ctx, t) {
    const llista = aAvisar(ctx, t);
    for (const x of llista) {
      const ultima = x.comandes[x.comandes.length - 1];
      ctx.M.registraCorreu({ plantilla: 'avis-tanda-nova', comandaId: ultima.id, tandaId: t.id, motiu: 'avis-tanda' });
    }
    ctx.M.modulActualitza('clients', (d) => {
      d.avisos = d.avisos || {};
      d.avisos[t.id] = { data: ahora(ctx), claus: ((d.avisos[t.id] || {}).claus || []).concat(llista.map((x) => x.clau)) };
    });
    return llista.length;
  }

  function vistaClient(ctx, clau) {
    const x = K.clients(ctx).find((y) => y.clau === clau);
    const enrere = '<a class="enrere" href="#clients">Clients</a>';
    if (!x) return { html: `${enrere}<h2>Client</h2><p class="buit">No hem trobat aquest client.</p>` };
    const k = x.client;
    const tels = String(k.telefon).replace(/[^\d+]/g, '');
    const wa = 'https://wa.me/' + (tels.startsWith('+') ? tels.slice(1) : '34' + tels);
    const dl = (parelles) => `<dl class="dades">${parelles.filter((p) => p[1] !== '').map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
    const ultima = x.comandes[x.comandes.length - 1];
    const fila = (c) => {
      const o = K.opinio(ctx, c.id);
      const op = o ? (o.resposta ? ` · opinió: ${textNota(o.resposta.nota)}` : ' · opinió demanada') : '';
      return `<li class="fila"><a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}"><span class="fila-nom"><strong>${esc(ctx.C.producte(c.producte, c.lots))}</strong> · ${esc(ctx.C.dataCurta(c.creada.slice(0, 10)))}</span><span class="fila-detall">${esc(K.tandaText(c))} · ${esc(ctx.ESTATS[c.estat])}${esc(op)}</span></a></li>`;
    };
    const html = `${enrere}
      <h2>${esc(x.nom)}${x.n >= 2 ? ' <span class="distintiu">Habitual</span>' : ''}</h2>
      <div class="accions"><a class="boto" href="tel:${esc(tels)}">Truca</a>${k.email ? `<a class="boto boto-lleu" href="mailto:${esc(k.email)}">Correu</a>` : ''}<a class="boto boto-lleu" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a></div>
      <section class="targeta"><h3>Dades</h3>${dl([['Telèfon', esc(k.telefon)], ['Correu', esc(k.email)], ['Adreça', esc(ultima.lliurament === 'recull' ? 'La recull a Sort' : K.adrecaText(k))], ['Comandes', String(x.n)], ['Lots en total', String(x.lots)], ['Client des del', esc(ctx.C.dataCurta(x.primera.slice(0, 10)))]])}</section>
      <section><h3>Comandes</h3><ul class="fileres">${x.comandes.slice().reverse().map(fila).join('')}</ul></section>`;
    return {
      html,
      despres: () => {
        // Mirar la fitxa és haver vist que torna a comprar
        const ids = ctx.M.esdeveniments({ tipus: 'client-repeteix', vist: false }).filter((ev) => ev.dades.clau === clau).map((ev) => ev.id);
        if (ids.length) ctx.M.marcaEsdevenimentsVists(ids);
      },
    };
  }

  const clients = {
    esdeveniments: {
      'client-repeteix': {
        nom: 'Un client torna a comprar',
        origen: 'client',
        text: (ev) => `${ev.dades.nom} torna a comprar (${K.ordinal(ev.dades.n)} comanda)`,
        simulador: {
          text: 'Un client habitual torna a comprar',
          dispara(ctx) {
            // El comprador de mostra de sempre: si encara no ha comprat mai, primer fa la primera comanda
            const base = { nom: 'Eulàlia', cognoms: 'Simulada', email: 'eulalia@exemple.invalid', telefon: '600000101', adreca: 'Carrer Inventat, 21', cp: '08001', poblacio: 'Barcelona' };
            const clau = ctx.M.clauClient(base);
            let prev = ctx.M.comandes().filter((c) => ctx.M.clauClient(c.client) === clau).length;
            if (!prev) {
              const primera = ctx.M.crearComanda({ lots: 1, client: base, origen: 'web', simulat: true });
              if (!primera.ok) return { ok: false, text: 'No s’ha pogut entrar la comanda.' };
              ctx.M.marcaVista(primera.comanda.id);
              prev = 1;
            }
            const r = ctx.M.crearComanda({ lots: 2, client: base, origen: 'web', simulat: true });
            if (!r.ok) return { ok: false, text: 'No s’ha pogut entrar la comanda.' };
            ctx.M.registraEsdeveniment({ tipus: 'client-repeteix', origen: 'client', comandaId: r.comanda.id, tandaId: r.comanda.tandaId || undefined, dades: { nom: K.nomComplet(r.comanda), clau, n: prev + 1 } });
            return { ok: true, text: `${base.nom} torna a comprar: ${K.ordinal(prev + 1)} comanda.` };
          },
        },
      },
    },
    simuladors: [
      {
        id: 'tanda',
        text: 'S’obre una tanda nova',
        dispara(ctx) {
          const r = ctx.M.obrirTanda();
          return r.ok ? { ok: true, text: `S’ha obert la tanda ${r.tanda.numero}.` } : { ok: false, text: 'No s’ha pogut obrir la tanda.' };
        },
      },
    ],
    correus: [
      {
        plantilla: 'avis-tanda-nova',
        text: (m, ctx) => {
          const c = m.dades.comanda;
          const t = m.dades.tanda;
          return {
            assumpte: 'Hem obert una tanda nova',
            cos: [`Hola, ${c.client.nom}:`, '', `Hem obert la tanda ${t.numero}. Pots fer la comanda fins al ${ctx.C.dataCurta(t.dataLimit)}.`, '', 'Et tornem a escriure perquè ja has comprat a Casa Camp. Si no vols rebre aquests avisos, [ENLLAÇ DE BAIXA].', '', signatura(ctx)].join('\n'),
          };
        },
      },
    ],
    tasques(ctx) {
      const sortida = [];
      for (const t of ctx.M.tandes().slice().reverse()) {
        if (t.tancada || ((ctx.M.modulDades('clients').avisos || {})[t.id])) continue;
        const llista = aAvisar(ctx, t);
        if (!llista.length) continue;
        sortida.push({ id: 'clients-avisa:' + t.id, prioritat: 'data', tandaId: t.id, pas: 'oberta', titol: `Avisa ${llista.length === 1 ? 'un comprador' : 'els ' + llista.length + ' compradors'}: la tanda ${t.numero} és oberta`, detall: llista.map((x) => x.nom).join(' · '), boto: { text: 'Envia l’avís', accio: 'avisa', args: { tandaId: t.id } } });
      }
      return sortida;
    },
    accions: {
      avisa(ctx, a, ui) {
        const t = ctx.M.tanda(a.tandaId);
        if (!t) return;
        const n = avisa(ctx, t);
        if (ui && ui.flaix) ui.flaix(`Fet. Hem enviat l’avís a ${n === 1 ? 'un client' : n + ' clients'}.`);
      },
    },
    seccions: [
      {
        on: 'comanda',
        id: 'client',
        html(ctx, c) {
          const x = K.clients(ctx).find((y) => y.clau === ctx.M.clauClient(c.client));
          if (!x) return '';
          const lloc = x.comandes.findIndex((o) => o.id === c.id) + 1;
          return `<section class="targeta"><h3>Client</h3><p>${x.n === 1 ? 'És la seva primera comanda.' : `Aquesta és la ${K.ordinal(lloc)} comanda ${K.de(String(x.n))}.`}</p><div class="accions"><a class="boto boto-lleu" href="${enllac(x.clau)}">Veure la fitxa del client</a></div></section>`;
        },
      },
    ],
    vista: {
      id: 'clients',
      nom: 'Clients',
      render(ctx, param) {
        const tots = K.clients(ctx);
        if (param && param !== 'habituals') return vistaClient(ctx, param);
        const nomesHabituals = param === 'habituals';
        const llista = nomesHabituals ? tots.filter((x) => x.n >= 2) : tots;
        const fila = (x) => `<li class="fila"><a class="fila-text" href="${enllac(x.clau)}"><span class="fila-nom"><strong>${esc(x.nom)}</strong>${x.n >= 2 ? ' <span class="distintiu">Habitual</span>' : ''}</span><span class="fila-detall">${K.plural(x.n, 'comanda', 'comandes')} · ${esc(ctx.C.lots(x.lots))} · l’última el ${esc(ctx.C.dataCurta(x.ultimaData.slice(0, 10)))}</span></a></li>`;
        const html = `<h2>Clients</h2>
          <div class="filtre-parell" role="group" aria-label="Quins clients"><a class="boto boto-lleu" href="#clients" aria-pressed="${!nomesHabituals}">Tots (${tots.length})</a><a class="boto boto-lleu" href="#clients=habituals" aria-pressed="${nomesHabituals}">Habituals (${tots.filter((x) => x.n >= 2).length})</a></div>
          ${llista.length ? `<ul class="fileres">${llista.map(fila).join('')}</ul>` : '<p class="buit">Encara no hi ha cap client que repeteixi.</p>'}`;
        return { html };
      },
    },
  };

  return { comandesTelefon, opinions, clients };
});
