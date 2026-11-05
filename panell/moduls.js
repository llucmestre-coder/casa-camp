/* Casa Camp — registre de mòduls del panell (PLA.md §«Panell connectat i instal·lable»).
   Un mòdul és una peça que el pastor pot encendre i apagar (`M.modulActiu`). Cada un declara aquí:
   el nom, la vista o la secció on viu, les tasques que dóna a «Avui», els correus que envia, els esdeveniments que
   entenen i les dades que necessita. Afegir-ne un és afegir-hi una entrada (`registra`); apagar-ne un el treu de
   les vistes, de les tasques, de «Ha passat», dels avisos, del simulador i dels correus, sense esborrar res.
   Sense DOM ni estat propi: a Node (`require`) per a les proves i al navegador (`window.CassovallModuls`).
   Guia pas a pas: PLA-eines/panell-connectat/FONAMENT.md. */
(function (arrel, fabrica) {
  // El contingut de cada mòdul és als fitxers panell/moduls-*.js (a Node, es carreguen amb `require`)
  const node = typeof module === 'object' && module.exports;
  const contingut = node
    ? Object.assign({}, require('./moduls-diners.js'), require('./moduls-logistica.js'), require('./moduls-clients.js'))
    : Object.assign({}, arrel && arrel.CassovallModulsDiners, arrel && arrel.CassovallModulsLogistica, arrel && arrel.CassovallModulsClients);
  const exportat = fabrica(contingut, node ? require('./moduls-comu.js') : arrel && arrel.CassovallModulsComu);
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) {
    arrel.CassovallModulsBase = exportat;
    if (arrel.CassovallMagatzem && arrel.CasaCamp) {
      arrel.CassovallModuls = exportat.crearRegistre({ M: arrel.CassovallMagatzem, D: arrel.CassovallDades, C: arrel.CasaCamp });
    }
  }
})(typeof window !== 'undefined' ? window : null, function (CONT, COMU) {
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
  // «avui», «demà» o «d’aquí a N dies» si una tanda oberta es tanca en tres dies o menys; si no, null
  const quanEsTanca = (t, avuiISO) => {
    if (!t || t.estat !== 'oberta' || t.vencuda) return null;
    const d = dies(t.dataLimit, avuiISO);
    return d < 0 || d > 3 ? null : d === 0 ? 'avui' : d === 1 ? 'demà' : `d’aquí a ${d} dies`;
  };

  /* ---------- El nucli: el que ja feia el panell abans dels mòduls (no s'apaga) ---------- */

  // L'efectiu que encara s'ha de cobrar (es cobra en mà, en entregar)
  const efectiuPerCobrar = (c) => c.metodePagament === 'efectiu' && c.pagament === 'pendent' && !c.entregada;

  const NUCLI = {
    id: 'nucli',
    nom: 'Tandes i comandes',
    descripcio: 'El que el panell ja fa sol: tandes, comandes i correus als compradors.',
    nucli: true,
    esdeveniments: {
      'comanda-nova': {
        nom: 'Entra una comanda per la web',
        origen: 'web',
        text: (ev, ctx) => `${ev.dades.nom} ha fet una comanda${ev.origen === 'telefon' ? ' per telèfon' : ''}: ${ctx.C.producte(ev.dades.producte, ev.dades.lots)} (${ev.dades.tandaNumero ? 'tanda ' + ev.dades.tandaNumero : 'a part'})`,
        avis: (ev, ctx) => ({ titol: 'Comanda nova', cos: `${ev.dades.nom} · ${ctx.C.producte(ev.dades.producte, ev.dades.lots)}`, hash: ev.comandaId ? '#comanda=' + ev.comandaId : '#avui' }),
        simulador: {
          text: 'Entra una comanda per la web',
          dispara(ctx) {
            const n = ctx.M.esdeveniments({ tipus: 'comanda-nova' }).length;
            const lots = LOTS_SIMULATS[n % LOTS_SIMULATS.length];
            const client = COMPRADORS_SIMULATS[n % COMPRADORS_SIMULATS.length];
            const r = ctx.M.crearComanda({ lots, client, origen: 'web', simulat: true });
            return r.ok ? { ok: true, text: `Comanda ${COMU.de(client.nom)}: ${ctx.C.lots(lots)}.` } : { ok: false, text: 'No s’ha pogut entrar la comanda.' };
          },
        },
      },
      'tanda-plena': {
        nom: 'S’omple una tanda',
        origen: 'web',
        text: (ev) => `La tanda ${ev.dades.numero} s’ha omplert: ${ev.dades.lots} ${COMU.de(String(ev.dades.places))} lots`,
        avis: (ev) => ({ titol: `Tanda ${ev.dades.numero} plena`, cos: `${ev.dades.lots} ${COMU.de(String(ev.dades.places))} lots. Ja és tancada.`, hash: '#tanda=' + (ev.tandaId || '') }),
        simulador: {
          text: 'Omple la tanda actual',
          dispara(ctx) {
            const t = ctx.M.tandaActual();
            if (!t || !t.ocupacio.lliures) return { ok: false, text: 'No hi ha cap tanda oberta.' };
            const n = ctx.M.esdeveniments({ tipus: 'comanda-nova' }).length;
            const client = COMPRADORS_SIMULATS[n % COMPRADORS_SIMULATS.length];
            const lots = t.ocupacio.lliures;
            const r = ctx.M.crearComanda({ lots, client, origen: 'web', simulat: true });
            return r.ok ? { ok: true, text: `La tanda ${t.numero} s’ha omplert amb ${ctx.C.lots(lots)} ${COMU.de(client.nom)}.` } : { ok: false, text: 'No s’ha pogut omplir la tanda.' };
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
      'entrega-a-part'(ctx, a, ui) {
        const c = ctx.M.comanda(a.comandaId);
        // L'efectiu es cobra en entregar-la, amb el mateix botó (com a la ruta)
        const cobrar = c && efectiuPerCobrar(c) && ctx.accio('pagaments', 'cobrat');
        const r = c ? ctx.M.marcaEntregada(c.id) : null;
        if (r && r.ok && !r.jaEntregada && cobrar) cobrar(ctx, { comandaId: c.id }, { flaix() {} });
        if (r && r.ok && !r.jaEntregada && ui && ui.flaix) ui.flaix(cobrar ? `Fet. ${c.client.nom} ja té la comanda i l’has cobrada.` : `Fet. ${c.client.nom} ja té la comanda.`);
      },
    },
    // Les tasques de la tanda surten del recorregut (`M.pasTanda`): només el pas que toca ara i només si es pot fer. Els passos
    // dels mòduls (demanar la carn, els kg, les etiquetes) els dona el seu mòdul. «La tanda es tanca demà» no és feina (no
    // demana cap acció): surt a la targeta de la tanda d'«Avui» (`quanEsTanca`).
    tasques(ctx) {
      const { M, C } = ctx;
      const sortida = [];
      for (const t of M.tandes().slice().reverse()) {
        const p = M.pasTanda(t.id);
        if (!p || !p.estat || !M.potPassar(t.id, p.estat).ok) continue;
        // Només les que surten amb la tanda (el filtre únic de magatzem.js)
        const cs = M.comandesQueSurten(t.id).length;
        const resum = cs ? `${C.lots(M.lotsQueSurten(t.id))} · ${COMU.plural(cs, 'comprador', 'compradors')}` : 'Cap comprador';
        const passa = (estat, text) => ({ text, accio: 'passa-tanda', args: { tandaId: t.id, estat } });
        const base = { tandaId: t.id, pas: p.id };
        if (p.id === 'tancada' && t.vencuda) {
          sortida.push(Object.assign({ id: 'tanda-vencuda:' + t.id, prioritat: 'bloqueja', titol: `La tanda ${t.numero} ha passat la data límit`, detall: `${resum}. Tanca-la perquè els compradors ho sàpiguen.`, boto: passa('completa', 'Tanca-la') }, base));
        } else if (p.id === 'preparacio') {
          sortida.push(Object.assign({ id: 'tanda-prepara:' + t.id, prioritat: 'bloqueja', titol: `Tanda ${t.numero} tancada: comença a preparar-la`, detall: resum, boto: passa('preparacio', 'Passa a «En preparació»') }, base));
        } else if (p.id === 'enviada') {
          sortida.push(Object.assign({ id: 'tanda-envia:' + t.id, prioritat: 'bloqueja', titol: `Tanda ${t.numero} en preparació: marca-la com a enviada quan surti`, detall: resum, boto: passa('enviada', 'Passa a «Enviada»') }, base));
        } else if (p.id === 'entregada') {
          // Si queden entregues pròpies (sense la ruta, les porta ell), és feina d'avui. Si només s'espera que arribi (el
          // transportista, el comprador que la ve a buscar), va a «En espera», amb el botó per quan arribi.
          const propies = M.comandesQueSurten(t.id).filter((c) => !c.entregada && c.lliurament === 'repartiment-propi');
          if (propies.length) {
            const pobles = Array.from(new Set(propies.map((c) => c.client.poblacio))).join(' · ');
            sortida.push(Object.assign({ id: 'tanda-entrega:' + t.id, prioritat: 'data', titol: `Tanda ${t.numero} en camí: porta ${propies.length === 1 ? 'la comanda' : 'les ' + propies.length + ' comandes'} i marca-la com a entregada`, detall: `${resum} · ${pobles}`, boto: passa('entregada', 'Passa a «Entregada»') }, base));
          } else {
            sortida.push(Object.assign({ id: 'tanda-entrega:' + t.id, prioritat: 'info', espera: true, titol: `La tanda ${t.numero} és en camí`, detall: `${resum} · quan arribi, marca-la com a entregada`, boto: passa('entregada', 'Passa a «Entregada»') }, base));
          }
        }
      }
      // Les comandes sense tanda (canals, entrega per acordar): el correu al pastor diu «truca per quedar el dia». La tasca
      // porta el telèfon i, quan la té, es marca entregada (d'allà, l'opinió). Si encara no ha pagat, primer el cobrament.
      for (const c of M.comandes()) {
        if (c.tandaId || c.entregada) continue;
        const l = M.lliurament(c.id);
        if (!l || l.via !== 'a-part' || !l.seguents.includes('entregada')) continue;
        const cobra = efectiuPerCobrar(c) && ctx.actiu('pagaments');
        sortida.push({ id: 'entrega-a-part:' + c.id, prioritat: 'data', pas: 'lliurament', titol: `Truca ${c.client.nom} per quedar el dia d’entrega: ${C.producte(c.producte, c.lots)}`, detall: `${(c.client.nom + ' ' + (c.client.cognoms || '')).trim()} · ${c.client.poblacio || ''} · ${cobra ? 'en efectiu: cobra-la quan la hi donis' : 'quan la tingui, marca-la com a entregada'}`, tel: { href: 'tel:' + String(c.client.telefon).replace(/[^\d+]/g, ''), text: 'Truca al ' + c.client.telefon }, boto: { text: cobra ? 'Ja la té i l’ha pagada' : 'Ja la té', accio: 'entrega-a-part', args: { comandaId: c.id } } });
      }
      // Les comandes noves no fan tasca (no demanen cap acció): surten a «Ha passat» i amb la marca «Nova» a Comandes
      return sortida;
    },
  };

  /* ---------- Els deu mòduls de la fitxa (declarats: la segona fase els omple) ---------- */
  // `vista`: pestanya pròpia; `seccions`: trossos dins d'una altra vista (`on`: 'tanda', 'comanda', 'comandes',
  // 'avui', 'configuracio'). Cap de les dues surt fins que té `render` / `html`. Tot és «pendent del pastor».

  const base = (d) => Object.assign({ pendent: true, vista: null, seccions: [], dades: [], esdeveniments: {}, correus: [], accions: {}, simuladors: [], tasques: () => [] }, d);

  // Aquí només hi ha el que identifica cada mòdul (nom, descripció, on viuen les dades). El contingut (vistes, seccions,
  // tasques, esdeveniments, correus, simuladors) és a panell/moduls-*.js i s'hi enganxa pel mateix `id`.
  const meta = (id) => CONT[id] || CONT[id.replace(/-([a-z])/g, (_, l) => l.toUpperCase())] || {};
  const modul = (def) => {
    const c = meta(def.id);
    // `vista`: la identitat de la declaració + el `render` del contingut
    const vista = def.vista || c.vista ? Object.assign({}, def.vista, c.vista) : null;
    return base(Object.assign({}, def, c, { vista, seccions: c.seccions || def.seccions || [], esdeveniments: Object.assign({}, def.esdeveniments, c.esdeveniments), correus: c.correus || def.correus || [] }));
  };

  const MODULS = [
    modul({
      id: 'pagaments',
      nom: 'Pagaments',
      descripcio: 'Què has cobrat a cada tanda, les devolucions i els cobraments que fallen.',
      vista: { id: 'pagaments', nom: 'Pagaments' },
      dades: ['comanda.metodePagament', 'comanda.pagament', 'comanda.historial'],
    }),
    modul({
      id: 'enviaments',
      nom: 'Enviaments',
      descripcio: 'Etiquetes, número de seguiment i en quin punt és cada paquet.',
      seccions: [{ on: 'tanda', id: 'enviaments' }, { on: 'comanda', id: 'enviament' }],
      dades: ['comanda.lliurament', 'comanda.client.adreca', 'dadesModuls.enviaments (paquets i seguiment)'],
    }),
    base({
      id: 'avisos',
      nom: 'Avisos al mòbil',
      descripcio: 'Una notificació quan entra una comanda, s’omple una tanda o falla un cobrament.',
      seccions: [{ on: 'configuracio', id: 'avisos', html: (ctx) => (ctx.avisos ? ctx.avisos.html(ctx) : ''), despres: (el, ctx) => ctx.avisos && ctx.avisos.despres(el, ctx) }],
      dades: ['esdeveniments (els que tenen avís)'],
    }),
    modul({
      id: 'comandes-telefon',
      nom: 'Comandes per telèfon',
      descripcio: 'Apuntar en pocs tocs una comanda que t’han fet per telèfon.',
      seccions: [{ on: 'comandes', id: 'alta-telefon' }],
      dades: ['comanda (origen telefon)', 'tanda (mateixa assignació que la web)'],
    }),
    modul({
      id: 'escorxador',
      nom: 'Escorxador i kg reals',
      descripcio: 'Què has de demanar a l’escorxador quan una tanda és plena i els kg reals de cada lot.',
      seccions: [{ on: 'tanda', id: 'escorxador' }],
      dades: ['tanda.ocupacio', 'dadesModuls.escorxador (demanat i kg reals)'],
    }),
    modul({
      id: 'factures',
      nom: 'Factures',
      descripcio: 'Una factura per a cada comanda, amb número correlatiu.',
      vista: { id: 'factures', nom: 'Factures' },
      seccions: [{ on: 'comanda', id: 'factura' }],
      dades: ['comanda.importLots', 'comanda.importEnviament', 'dadesModuls.factures (numeració)'],
    }),
    modul({
      id: 'gestoria',
      nom: 'Números per a la gestoria',
      descripcio: 'El resum de cada tanda o de cada mes i un Excel (CSV) per passar a la gestoria.',
      vista: { id: 'gestoria', nom: 'Gestoria' },
      dades: ['comandes (cobrament, import)', 'dadesModuls.factures', 'dadesModuls.gestoria (períodes passats)'],
    }),
    modul({
      id: 'ruta',
      nom: 'Ruta de repartiment',
      descripcio: 'Les entregues que fas tu, agrupades per poble. Només si les repartiu vosaltres.',
      seccions: [{ on: 'tanda', id: 'ruta' }],
      dades: ['comanda.lliurament = repartiment-propi o recull', 'comanda.client.poblacio'],
    }),
    modul({
      id: 'clients',
      nom: 'Clients que repeteixen',
      descripcio: 'Una fitxa per a cada persona amb totes les seves comandes.',
      vista: { id: 'clients', nom: 'Clients' },
      dades: ['comanda.client (telèfon o correu)', 'dadesModuls.clients (avisos de tanda nova)'],
    }),
    modul({
      id: 'opinions',
      nom: 'Opinió en arribar el paquet',
      descripcio: 'Una pregunta al comprador quan li arriba el paquet.',
      vista: { id: 'opinions', nom: 'Opinions' },
      dades: ['comanda.entregada', 'correus (opinio-demanada)', 'dadesModuls.opinions (respostes)'],
    }),
  ];

  /* ---------- El registre ---------- */

  const copiaDef = (d) => Object.assign({}, d, { seccions: (d.seccions || []).slice(), esdeveniments: Object.assign({}, d.esdeveniments), correus: (d.correus || []).slice(), accions: Object.assign({}, d.accions), simuladors: (d.simuladors || []).slice() });

  // opcions: { M, D, C, ara? }. `ara` només per a les proves.
  function crearRegistre(opcions) {
    const { M, D, ara } = opcions;
    const C = COMU && COMU.tipografia ? COMU.tipografia(opcions.C) : opcions.C;
    const moduls = new Map();
    // Els que cal passar a les funcions dels mòduls. La interfície (`ui`, `avisos`) la posa panell.js. `actiu(id)`: si un
    // altre mòdul és encès (el que un mòdul llegeix d'un altre ho mira sempre); `ara()`: l'hora, que les proves fixen.
    const ctx = { M, D, C, ESTATS, avui: () => avuiISO(ara), ara: () => (ara ? ara() : new Date()), actiu: (id) => actiu(id), accio: (m, n) => accio(m, n), ui: null, avisos: null };

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
    // `render(ctx, param)`: `param` és el que va darrere del «=» de l'adreça (`#clients=t600000101`)
    const vista = (id) => {
      const m = actius().find((x) => x.vista && x.vista.id === id && typeof x.vista.render === 'function');
      return m ? { modul: m.id, nom: m.vista.nom || m.nom, render: m.vista.render } : null;
    };
    const seccions = (on) =>
      actius().flatMap((m) => m.seccions.filter((s) => s.on === on && typeof s.html === 'function').map((s) => Object.assign({ modul: m.id }, s)));

    /* Tasques d'«Avui»: es calculen cada vegada, no es desen */
    const tascaValida = (t) =>
      !!t && typeof t.id === 'string' && typeof t.titol === 'string' && t.prioritat in PRIORITATS && !!t.boto && typeof t.boto.text === 'string' && (typeof t.boto.hash === 'string' || typeof t.boto.accio === 'string');
    // «Per fer» (feina d'ara) i «En espera» (el pas depèn d'algú altre: la carn que ha d'arribar, la tanda en camí, el
    // comprador que la ve a buscar). Una tasca d'espera porta `espera: true` i el botó per quan passi.
    const tasques = () => totesTasques().filter((t) => !t.espera);
    const esperes = () => totesTasques().filter((t) => t.espera);
    function totesTasques() {
      const totes = [];
      for (const m of actius()) {
        const fetes = provaDe(() => m.tasques(ctx), m.id, []) || [];
        for (const t of fetes) if (tascaValida(t)) totes.push(Object.assign({}, t, { modul: m.id }));
      }
      // Una tasca per feina. Cada tasca pot dir quina feina fa (`feina`: claus com 'factura:CC-1006' o 'kg:t13'). Una tasca
      // que només demana una feina que ja fa una altra (`demanda`: «Sílvia la demana», «la gestoria les espera») no surt:
      // s'afegeix al detall de la que la fa.
      const fan = new Map();
      for (const t of totes) if (!t.demanda) for (const k of t.feina || []) if (!fan.has(k)) fan.set(k, t);
      const netes = [];
      for (const t of totes) {
        const qui = t.demanda && (t.feina || []).length && t.feina.every((k) => fan.has(k)) ? Array.from(new Set(t.feina.map((k) => fan.get(k)))) : null;
        if (!qui) {
          netes.push(t);
          continue;
        }
        for (const x of qui) if (!(x.detall || '').includes(t.demanda)) x.detall = (x.detall ? x.detall + ' · ' : '') + t.demanda;
      }
      // Dins d'una tanda, un pas del recorregut no queda mai per sota d'un de posterior: agafa la urgència més alta dels que
      // té al darrere (si preparar la tanda bloqueja, el que toca abans també). Entre tandes, la més antiga va primer: agafa
      // la urgència més alta de les més noves. Així l'ordre per prioritat, el de les tandes i el del recorregut no es
      // contradiuen mai.
      const ordre = (t) => (t.pas ? M.ordrePas(t.pas) : -1);
      const nomPrioritat = Object.keys(PRIORITATS);
      const numero = (id) => (M.tanda(id) || { numero: Infinity }).numero;
      const deTanda = new Map();
      for (const t of netes) if (t.tandaId) deTanda.set(t.tandaId, (deTanda.get(t.tandaId) || []).concat(t));
      for (const ts of deTanda.values()) {
        const urgencia = ts.map((t) => ts.filter((x) => ordre(x) > ordre(t)).reduce((p, x) => Math.min(p, PRIORITATS[x.prioritat]), PRIORITATS[t.prioritat]));
        ts.forEach((t, k) => { t.prioritat = nomPrioritat.find((n) => PRIORITATS[n] === urgencia[k]); });
      }
      // Entre tandes només compta el camí fins a l'entrega: el que ve després (l'opinió, la factura) no passa al davant
      // perquè una tanda més nova tingui pressa.
      const finsEntrega = (t) => t.pas && M.ordrePas(t.pas) <= M.ordrePas('entregada');
      let mesNova = Infinity;
      for (const id of Array.from(deTanda.keys()).sort((a, b) => numero(b) - numero(a))) {
        const ts = deTanda.get(id).filter(finsEntrega);
        ts.forEach((t) => { if (PRIORITATS[t.prioritat] > mesNova) t.prioritat = nomPrioritat.find((n) => PRIORITATS[n] === mesNova); });
        mesNova = Math.min(mesNova, ...ts.map((t) => PRIORITATS[t.prioritat]));
      }
      // Per prioritat; dins de cada prioritat, les de tanda (de la més antiga a la més nova, i dins de cada tanda en l'ordre
      // del recorregut) i després les altres, en l'ordre del registre i del que dóna cada mòdul
      return netes
        .map((t, i) => ({ t, i }))
        .sort((a, b) => PRIORITATS[a.t.prioritat] - PRIORITATS[b.t.prioritat] || (a.t.tandaId ? numero(a.t.tandaId) : Infinity) - (b.t.tandaId ? numero(b.t.tandaId) : Infinity) || (a.t.tandaId && b.t.tandaId ? ordre(a.t) - ordre(b.t) : 0) || a.i - b.i)
        .map((p) => p.t);
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
    // Un botó del simulador per esdeveniment (`esdeveniments.<tipus>.simulador`) i els que el mòdul declari a `simuladors`
    const simulacions = () =>
      actius().flatMap((m) =>
        Object.keys(m.esdeveniments)
          .filter((k) => m.esdeveniments[k].simulador)
          .map((k) => ({ id: m.id + ':' + k, modul: m.id, tipus: k, text: m.esdeveniments[k].simulador.text, dispara: m.esdeveniments[k].simulador.dispara }))
          .concat((m.simuladors || []).map((s) => ({ id: m.id + ':' + s.id, modul: m.id, tipus: null, text: s.text, dispara: s.dispara }))),
      );

    // «Entregat»: en el moment que una comanda s'entrega, cada mòdul encès pot fer la seva part (p. ex. demanar l'opinió)
    // (Quan l'última comanda d'una tanda enviada arriba, la tanda passa sola a «Entregada»: ho fa el recorregut, a magatzem.js)
    M.alEntregar((comanda) => {
      for (const m of actius()) if (typeof m.alEntregar === 'function') provaDe(() => m.alEntregar(comanda, ctx), m.id);
    });
    // El recorregut (magatzem.js) compta els passos dels mòduls encesos: escorxador (carn i kg), enviaments (etiquetes i
    // paquet), ruta (parades). Qui entrega cada comanda (paquet, ruta o la tanda) també en surt.
    M.connectaModuls((id) => actiu(id));

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

    const api = { ctx, ESTATS, PRIORITATS, registra, desregistra, modul: (id) => moduls.get(id) || null, actiu, actius, llista, vistes, vista, seccions, tasques, esperes, accio, executa, tipusEsdeveniment, esdevenimentVisible, textEsdeveniment, avisEsdeveniment, simulacions, correuVisible, textCorreu, modulDePlantilla };
    registra(NUCLI);
    MODULS.forEach(registra);
    return api;
  }

  return { crearRegistre, ESTATS, PRIORITATS, NUCLI, MODULS, COMPRADORS_SIMULATS, quanEsTanca };
});
