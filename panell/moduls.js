/* Casa Camp — registre de mòduls del panell (PLA.md §«Panell connectat i instal·lable»).
   Un mòdul és una peça que el pastor pot encendre i apagar (`M.modulActiu`). Cada un declara aquí:
   el nom, la vista o la secció on viu, les tasques que dóna a «Avui», els correus que envia, els esdeveniments que
   entenen i les dades que necessita. Afegir-ne un és afegir-hi una entrada (`registra`); apagar-ne un el treu de
   les vistes, de les tasques, de «Ha passat», dels avisos, del simulador i dels correus, sense esborrar res.
   Sense DOM ni estat propi: a Node (`require`) per a les proves i al navegador (`window.CassovallModuls`).
   Guia pas a pas: PLA-eines/panell-connectat/FONAMENT.md. */
(function (arrel, fabrica) {
  const exportat = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) {
    arrel.CassovallModulsBase = exportat;
    if (arrel.CassovallMagatzem && arrel.CasaCamp) {
      arrel.CassovallModuls = exportat.crearRegistre({ M: arrel.CassovallMagatzem, D: arrel.CassovallDades, C: arrel.CasaCamp });
    }
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const ESTATS = { oberta: 'Oberta', completa: 'Tancada', preparacio: 'En preparació', enviada: 'Enviada', entregada: 'Entregada', 'per-acordar': 'Per acordar' };

  // Ordre de la llista de feina: primer el que bloqueja diners o entregues, després el que té data, al final l'informatiu.
  const PRIORITATS = { bloqueja: 1, data: 2, info: 3 };

  const ID = /^[a-z][a-z0-9-]*$/;

  /* ---------- Compradors fictius per al simulador ---------- */
  // Telèfons de format vàlid però inventats (el full de compra exigeix un número que comenci per 6–9); correus `.invalid`.
  const COMPRADORS_SIMULATS = [
    { nom: 'Eulàlia', cognoms: 'Simulada', email: 'eulalia@exemple.invalid', telefon: '600000101', adreca: 'Carrer Inventat, 21', cp: '08001', poblacio: 'Barcelona' },
    { nom: 'Ramon', cognoms: 'Fictici', email: 'ramon@exemple.invalid', telefon: '600000102', adreca: 'Plaça de Mostra, 4', cp: '17001', poblacio: 'Girona' },
    { nom: 'Montse', cognoms: 'Exemple', email: 'montse@exemple.invalid', telefon: '600000103', adreca: 'Carrer de Prova, 9', cp: '25560', poblacio: 'Sort' },
    { nom: 'Arnau', cognoms: 'Demo', email: 'arnau@exemple.invalid', telefon: '600000104', adreca: 'Avinguda Simulada, 33', cp: '25001', poblacio: 'Lleida' },
    { nom: 'Gemma', cognoms: 'Mostra', email: 'gemma@exemple.invalid', telefon: '600000105', adreca: 'Camí Fictici, 2', cp: '43001', poblacio: 'Tarragona' },
    { nom: 'Pol', cognoms: 'Prova', email: 'pol@exemple.invalid', telefon: '600000106', adreca: 'Carrer Demo, 15', cp: '08201', poblacio: 'Sabadell' },
  ];
  const LOTS_SIMULATS = [2, 1, 3, 1, 2, 4];

  /* ---------- Helpers de dates ---------- */

  const avuiISO = (ara) => {
    const d = ara ? ara() : new Date();
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  };
  const dies = (aISO, deISO) => {
    const t = (s) => Date.UTC(...s.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
    return Math.round((t(aISO) - t(deISO)) / 86400000);
  };

  /* ---------- El nucli: el que ja feia el panell abans dels mòduls (no s'apaga) ---------- */

  const NUCLI = {
    id: 'nucli',
    nom: 'Tandes i comandes',
    descripcio: 'El que el panell ja fa sol: tandes, comandes i correus als compradors.',
    nucli: true,
    esdeveniments: {
      'comanda-nova': {
        nom: 'Entra una comanda per la web',
        origen: 'web',
        text: (ev, ctx) => `${ev.dades.nom} ha fet una comanda: ${ctx.C.producte(ev.dades.producte, ev.dades.lots)} (${ev.dades.tandaNumero ? 'tanda ' + ev.dades.tandaNumero : 'a part'})`,
        avis: (ev, ctx) => ({ titol: 'Comanda nova', cos: `${ev.dades.nom} · ${ctx.C.producte(ev.dades.producte, ev.dades.lots)}`, hash: ev.comandaId ? '#comanda=' + ev.comandaId : '#avui' }),
        simulador: {
          text: 'Entra una comanda per la web',
          dispara(ctx) {
            const n = ctx.M.esdeveniments({ tipus: 'comanda-nova' }).length;
            const lots = LOTS_SIMULATS[n % LOTS_SIMULATS.length];
            const client = COMPRADORS_SIMULATS[n % COMPRADORS_SIMULATS.length];
            const r = ctx.M.crearComanda({ lots, client, origen: 'web', simulat: true });
            return r.ok ? { ok: true, text: `Comanda de ${client.nom}: ${ctx.C.lots(lots)}.` } : { ok: false, text: 'No s’ha pogut entrar la comanda.' };
          },
        },
      },
      'tanda-plena': {
        nom: 'S’omple una tanda',
        origen: 'web',
        text: (ev) => `La tanda ${ev.dades.numero} s’ha omplert: ${ev.dades.lots} de ${ev.dades.places} lots`,
        avis: (ev) => ({ titol: `Tanda ${ev.dades.numero} plena`, cos: `${ev.dades.lots} de ${ev.dades.places} lots. Ja és tancada.`, hash: '#tanda=' + (ev.tandaId || '') }),
        simulador: {
          text: 'Omple la tanda actual',
          dispara(ctx) {
            const t = ctx.M.tandaActual();
            if (!t || !t.ocupacio.lliures) return { ok: false, text: 'No hi ha cap tanda oberta.' };
            const n = ctx.M.esdeveniments({ tipus: 'comanda-nova' }).length;
            const client = COMPRADORS_SIMULATS[n % COMPRADORS_SIMULATS.length];
            const lots = t.ocupacio.lliures;
            const r = ctx.M.crearComanda({ lots, client, origen: 'web', simulat: true });
            return r.ok ? { ok: true, text: `La tanda ${t.numero} s’ha omplert amb ${ctx.C.lots(lots)} de ${client.nom}.` } : { ok: false, text: 'No s’ha pogut omplir la tanda.' };
          },
        },
      },
      'tanda-estat': {
        nom: 'Una tanda canvia d’estat',
        origen: 'panell',
        text: (ev) => `La tanda ${ev.dades.numero} passa a «${ESTATS[ev.dades.a] || ev.dades.a}»`,
      },
    },
    accions: {
      'passa-tanda': (ctx, a, ui) => ui.canviaEstat(ctx.M.tanda(a.tandaId), a.estat),
      'veu-esdeveniment': (ctx, a) => ctx.M.marcaEsdevenimentVist(a.id),
    },
    tasques(ctx) {
      const { M, C } = ctx;
      const avui = ctx.avui();
      const sortida = [];
      for (const t of M.tandes().slice().reverse()) {
        if (t.estat === 'entregada') continue;
        const cs = M.comandesDeTanda(t.id).length;
        const resum = cs ? `${C.lots(t.ocupacio.lots)} · ${cs} ${cs === 1 ? 'comprador' : 'compradors'}` : 'Cap comprador';
        const passa = (estat, text) => ({ text, accio: 'passa-tanda', args: { tandaId: t.id, estat } });
        if (t.vencuda) {
          sortida.push({ id: 'tanda-vencuda:' + t.id, prioritat: 'bloqueja', titol: `La tanda ${t.numero} ha passat la data límit`, detall: `${resum}. Tanca-la perquè els compradors ho sàpiguen.`, boto: passa('completa', 'Tanca-la') });
        } else if (t.estat === 'completa') {
          sortida.push({ id: 'tanda-prepara:' + t.id, prioritat: 'bloqueja', titol: `Tanda ${t.numero} tancada: comença a preparar-la`, detall: resum, boto: passa('preparacio', 'Passa a «En preparació»') });
        } else if (t.estat === 'preparacio') {
          sortida.push({ id: 'tanda-envia:' + t.id, prioritat: 'bloqueja', titol: `Tanda ${t.numero} en preparació: marca-la com a enviada quan surti`, detall: resum, boto: passa('enviada', 'Passa a «Enviada»') });
        } else if (t.estat === 'enviada') {
          sortida.push({ id: 'tanda-entrega:' + t.id, prioritat: 'data', titol: `Tanda ${t.numero} en camí: marca-la com a entregada quan arribi`, detall: resum, boto: passa('entregada', 'Passa a «Entregada»') });
        } else if (t.estat === 'oberta') {
          const d = dies(t.dataLimit, avui);
          if (d >= 0 && d <= 3) {
            const quan = d === 0 ? 'avui' : d === 1 ? 'demà' : `d’aquí a ${d} dies`;
            sortida.push({ id: 'tanda-data:' + t.id, prioritat: 'data', titol: `La tanda ${t.numero} es tanca ${quan}`, detall: `${t.ocupacio.lots} de ${t.ocupacio.places} lots reservats`, boto: { text: 'Veure la tanda', hash: '#tanda=' + t.id } });
          }
        }
      }
      for (const c of M.comandes({ nova: true })) {
        const nom = (c.client.nom + ' ' + c.client.cognoms).trim();
        sortida.push({ id: 'comanda-nova:' + c.id, prioritat: 'info', titol: `Comanda nova de ${nom}`, detall: `${C.producte(c.producte, c.lots)} · ${c.tandaNumero ? 'tanda ' + c.tandaNumero : 'a part'}`, boto: { text: 'Veure-la', hash: '#comanda=' + c.id } });
      }
      return sortida;
    },
  };

  /* ---------- Els deu mòduls de la fitxa (declarats: la segona fase els omple) ---------- */
  // `vista`: pestanya pròpia; `seccions`: trossos dins d'una altra vista (`on`: 'tanda', 'comanda', 'comandes',
  // 'avui', 'configuracio'). Cap de les dues surt fins que té `render` / `html`. Tot és «pendent del pastor».

  const base = (d) => Object.assign({ pendent: true, vista: null, seccions: [], dades: [], esdeveniments: {}, correus: [], accions: {}, tasques: () => [] }, d);

  const MODULS = [
    base({
      id: 'pagaments',
      nom: 'Pagaments',
      descripcio: 'Què has cobrat a cada tanda, les devolucions i els cobraments que fallen.',
      vista: { id: 'pagaments', nom: 'Pagaments' },
      dades: ['comanda.metodePagament', 'comanda.pagament', 'dadesModuls.pagaments'],
      esdeveniments: { 'pagament-fallit': { nom: 'Un cobrament falla', origen: 'pagament' } },
      correus: [{ plantilla: 'devolucio' }],
    }),
    base({
      id: 'enviaments',
      nom: 'Enviaments',
      descripcio: 'Etiquetes, número de seguiment i en quin punt és cada paquet.',
      seccions: [{ on: 'tanda', id: 'enviaments' }, { on: 'comanda', id: 'enviament' }],
      dades: ['comanda.lliurament', 'comanda.client.adreca', 'dadesModuls.enviaments'],
      esdeveniments: { 'paquet-estat': { nom: 'Un paquet canvia de punt', origen: 'transportista' } },
    }),
    base({
      id: 'avisos',
      nom: 'Avisos al mòbil',
      descripcio: 'Una notificació quan entra una comanda o s’omple una tanda.',
      seccions: [{ on: 'configuracio', id: 'avisos', html: (ctx) => (ctx.avisos ? ctx.avisos.html(ctx) : ''), despres: (el, ctx) => ctx.avisos && ctx.avisos.despres(el, ctx) }],
      dades: ['esdeveniments (comanda-nova, tanda-plena)'],
    }),
    base({
      id: 'comandes-telefon',
      nom: 'Comandes per telèfon',
      descripcio: 'Apuntar en pocs tocs una comanda que t’han fet per telèfon.',
      seccions: [{ on: 'comandes', id: 'alta-telefon' }],
      dades: ['comanda (origen telefon)', 'tanda (mateixa assignació que la web)'],
    }),
    base({
      id: 'escorxador',
      nom: 'Escorxador i kg reals',
      descripcio: 'Què has de demanar a l’escorxador quan una tanda és plena i els kg reals de cada lot.',
      seccions: [{ on: 'tanda', id: 'escorxador' }],
      dades: ['tanda.ocupacio', 'dadesModuls.escorxador (kg reals)'],
      esdeveniments: { 'escorxador-avisat': { nom: 'S’avisa l’escorxador', origen: 'escorxador' } },
    }),
    base({
      id: 'factures',
      nom: 'Factures',
      descripcio: 'Una factura per a cada comanda, amb número correlatiu.',
      vista: { id: 'factures', nom: 'Factures' },
      seccions: [{ on: 'comanda', id: 'factura' }],
      dades: ['comanda.importLots', 'comanda.importEnviament', 'dadesModuls.factures (numeració)'],
      esdeveniments: { 'factura-emesa': { nom: 'S’emet una factura', origen: 'factures' } },
    }),
    base({
      id: 'gestoria',
      nom: 'Números per a la gestoria',
      descripcio: 'El resum de cada tanda i un Excel (CSV) per passar a la gestoria.',
      vista: { id: 'gestoria', nom: 'Gestoria' },
      dades: ['pagaments', 'factures', 'enviaments'],
    }),
    base({
      id: 'ruta',
      nom: 'Ruta de repartiment',
      descripcio: 'Les entregues que fas tu, agrupades per poble. Només si les repartiu vosaltres.',
      seccions: [{ on: 'tanda', id: 'ruta' }],
      dades: ['comanda.lliurament = repartiment-propi', 'comanda.client.poblacio'],
    }),
    base({
      id: 'clients',
      nom: 'Clients que repeteixen',
      descripcio: 'Una fitxa per a cada persona amb totes les seves comandes.',
      vista: { id: 'clients', nom: 'Clients' },
      dades: ['comanda.client (telèfon o correu)'],
    }),
    base({
      id: 'opinions',
      nom: 'Opinió en arribar el paquet',
      descripcio: 'Una pregunta al comprador quan li arriba el paquet.',
      vista: { id: 'opinions', nom: 'Opinions' },
      dades: ['dadesModuls.opinions'],
      esdeveniments: { 'opinio-rebuda': { nom: 'Un comprador respon', origen: 'client' } },
      correus: [{ plantilla: 'opinio-demanada' }],
    }),
  ];

  /* ---------- El registre ---------- */

  const copiaDef = (d) => Object.assign({}, d, { seccions: (d.seccions || []).slice(), esdeveniments: Object.assign({}, d.esdeveniments), correus: (d.correus || []).slice(), accions: Object.assign({}, d.accions) });

  // opcions: { M, D, C, ara? }. `ara` només per a les proves.
  function crearRegistre(opcions) {
    const { M, D, C, ara } = opcions;
    const moduls = new Map();
    // Els que cal passar a les funcions dels mòduls. La interfície (`ui`, `avisos`) la posa panell.js.
    const ctx = { M, D, C, ESTATS, avui: () => avuiISO(ara), ui: null, avisos: null };

    function registra(def) {
      if (!def || typeof def.id !== 'string' || !ID.test(def.id)) throw new Error('modul_invalid: cal un id (minúscules, xifres i guions)');
      if (typeof def.nom !== 'string' || !def.nom) throw new Error('modul_invalid: cal un nom (' + def.id + ')');
      if (moduls.has(def.id)) throw new Error('modul_duplicat: ' + def.id);
      const m = copiaDef(base(def));
      if (def.nucli) Object.assign(m, { nucli: true, pendent: false });
      moduls.set(m.id, m);
      return m;
    }
    function desregistra(id) {
      return moduls.delete(id);
    }

    const actiu = (id) => {
      const m = moduls.get(id);
      return !!m && (m.nucli || M.modulActiu(id));
    };
    const actius = () => Array.from(moduls.values()).filter((m) => actiu(m.id));
    // Els que el pastor pot encendre i apagar, en l'ordre del registre
    const llista = () => Array.from(moduls.values()).filter((m) => !m.nucli);
    const provaDe = (fn, modul, valorSiFalla) => {
      try {
        return fn();
      } catch (e) {
        if (typeof console !== 'undefined') console.error('Mòdul «' + modul + '»: ' + (e && e.message));
        return valorSiFalla;
      }
    };

    /* Vistes i seccions */
    const vistes = () => actius().filter((m) => m.vista && typeof m.vista.render === 'function').map((m) => ({ id: m.vista.id, nom: m.vista.nom || m.nom, modul: m.id }));
    const vista = (id) => {
      const m = actius().find((x) => x.vista && x.vista.id === id && typeof x.vista.render === 'function');
      return m ? { modul: m.id, nom: m.vista.nom || m.nom, render: m.vista.render } : null;
    };
    const seccions = (on) =>
      actius().flatMap((m) => m.seccions.filter((s) => s.on === on && typeof s.html === 'function').map((s) => Object.assign({ modul: m.id }, s)));

    /* Tasques d'«Avui»: es calculen cada vegada, no es desen */
    const tascaValida = (t) =>
      !!t && typeof t.id === 'string' && typeof t.titol === 'string' && t.prioritat in PRIORITATS && !!t.boto && typeof t.boto.text === 'string' && (typeof t.boto.hash === 'string' || typeof t.boto.accio === 'string');
    function tasques() {
      const totes = [];
      for (const m of actius()) {
        const fetes = provaDe(() => m.tasques(ctx), m.id, []) || [];
        for (const t of fetes) if (tascaValida(t)) totes.push(Object.assign({}, t, { modul: m.id }));
      }
      // Estable: dins de cada prioritat es manté l'ordre del registre i el que dóna cada mòdul
      return totes.map((t, i) => ({ t, i })).sort((a, b) => PRIORITATS[a.t.prioritat] - PRIORITATS[b.t.prioritat] || a.i - b.i).map((p) => p.t);
    }
    const accio = (modulId, nom) => {
      const m = moduls.get(modulId);
      return m && actiu(modulId) && typeof m.accions[nom] === 'function' ? m.accions[nom] : null;
    };
    // Executa el botó d'una tasca. Navegar és `ui.navega(hash)`; la resta, l'acció del mòdul.
    function executa(tasca, ui) {
      if (typeof tasca.boto.hash === 'string') return ui.navega(tasca.boto.hash);
      const fn = accio(tasca.modul, tasca.boto.accio);
      return fn ? fn(ctx, tasca.boto.args || {}, ui) : undefined;
    }

    /* Esdeveniments */
    const tipusEsdeveniment = (tipus) => {
      for (const m of moduls.values()) {
        const d = m.esdeveniments[tipus];
        if (d && (d.text || d.nom || d.avis)) return { modul: m.id, def: d };
      }
      return null;
    };
    // Només es veuen els esdeveniments d'un mòdul encès (o del nucli)
    const esdevenimentVisible = (ev) => {
      const t = tipusEsdeveniment(ev.tipus);
      return !!t && actiu(t.modul);
    };
    const textEsdeveniment = (ev) => {
      const t = tipusEsdeveniment(ev.tipus);
      if (!t) return '';
      return (t.def.text && provaDe(() => t.def.text(ev, ctx), t.modul, '')) || t.def.nom || ev.tipus;
    };
    // Notificació del sistema per a un esdeveniment, o null si no n'ha de fer
    const avisEsdeveniment = (ev) => {
      const t = tipusEsdeveniment(ev.tipus);
      return t && actiu(t.modul) && typeof t.def.avis === 'function' ? provaDe(() => t.def.avis(ev, ctx), t.modul, null) : null;
    };
    const simulacions = () =>
      actius().flatMap((m) => Object.keys(m.esdeveniments).filter((k) => m.esdeveniments[k].simulador).map((k) => ({ id: m.id + ':' + k, modul: m.id, tipus: k, text: m.esdeveniments[k].simulador.text, dispara: m.esdeveniments[k].simulador.dispara })));

    /* Correus: cada mòdul diu quines plantilles són seves */
    const modulDePlantilla = (plantilla) => {
      for (const m of moduls.values()) {
        const c = m.correus.find((x) => x.plantilla === plantilla);
        if (c) return { modul: m.id, def: c };
      }
      return null;
    };
    // Els correus del nucli (i els de plantilla desconeguda) sempre es veuen; els d'un mòdul apagat, no
    const correuVisible = (correu) => {
      const p = modulDePlantilla(correu.plantilla);
      return !p || actiu(p.modul);
    };
    const textCorreu = (correu) => {
      const p = modulDePlantilla(correu.plantilla);
      return p && typeof p.def.text === 'function' ? provaDe(() => p.def.text(correu, ctx), p.modul, null) : null;
    };

    const api = { ctx, ESTATS, PRIORITATS, registra, desregistra, modul: (id) => moduls.get(id) || null, actiu, actius, llista, vistes, vista, seccions, tasques, accio, executa, tipusEsdeveniment, esdevenimentVisible, textEsdeveniment, avisEsdeveniment, simulacions, correuVisible, textCorreu, modulDePlantilla };
    registra(NUCLI);
    MODULS.forEach(registra);
    return api;
  }

  return { crearRegistre, ESTATS, PRIORITATS, NUCLI, MODULS, COMPRADORS_SIMULATS };
});
