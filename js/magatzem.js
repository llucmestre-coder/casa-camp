/* Casa Camp — estat compartit i regles (tandes, comandes, correus, esdeveniments, mòduls, subscripció preparada).
   Sense interfície. Un únic estat a `localStorage['cassovall:v2']`, amb versió (l'estat de la v1 es migra sol, sense
   tocar-lo); si l'emmagatzematge falla, es treballa en memòria. Al navegador (després de dades.js) crea `window.CassovallMagatzem`; a Node,
   `require('./magatzem.js').crearMagatzem({...})`. Els correus guarden plantilla + dades, mai el text final. */
(function (arrel, fabrica) {
  const esNode = typeof module === 'object' && module.exports;
  const dadesBase = esNode ? require('./dades.js') : arrel && arrel.CassovallDades;
  const api = fabrica(dadesBase);
  if (esNode) module.exports = api;
  if (arrel) {
    arrel.crearMagatzemCassovall = api.crearMagatzem;
    arrel.CassovallMagatzem = api.crearMagatzem();
  }
})(typeof window !== 'undefined' ? window : null, function (dadesBase) {
  'use strict';

  const CLAU = 'cassovall:v2';
  const CLAU_V1 = 'cassovall:v1'; // abans dels esdeveniments i dels mòduls: només es llegeix, per migrar-ne l'estat
  const VERSIO = 2;
  // Canvis de configuració per defecte entre fases de la versió real: un estat desat d'abans es posa al dia una sola vegada
  const FASE = 'A';
  const DIA = 86400000;
  const MAX_PLACES = 500;

  const copia = (x) => JSON.parse(JSON.stringify(x));
  const afegeixDies = (dataISO, dies) => {
    const [a, m, d] = dataISO.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d) + dies * DIA).toISOString().slice(0, 10);
  };
  const dataValida = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [a, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };
  const err = (error, extra) => Object.assign({ ok: false, error }, extra || {});

  // Adaptador del navegador: localStorage + esdeveniment `storage` (només arriba des d'altres pestanyes).
  // Retorna null si ni tan sols es pot accedir a localStorage (mode privat, galetes bloquejades…).
  function emmagatzematgeNavegador() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const ls = window.localStorage;
      return {
        llegeix: (clau) => ls.getItem(clau),
        escriu: (clau, text) => ls.setItem(clau, text),
        esborra: (clau) => ls.removeItem(clau),
        escolta(cb) {
          const fn = (e) => cb(e.key);
          window.addEventListener('storage', fn);
          return () => window.removeEventListener('storage', fn);
        },
      };
    } catch (e) {
      return null;
    }
  }

  /* opcions: { dades, emmagatzematge, search, ara, clau }
     - emmagatzematge: objecte { llegeix(clau), escriu(clau, text), esborra(clau), escolta?(cb) } o null (memòria).
       Si s'omet, s'usa localStorage del navegador.
     - search: cadena de consulta de l'URL (per defecte `location.search`).
     - ara: () => Date (per a les proves). */
  function crearMagatzem(opcions) {
    const op = opcions || {};
    const dades = op.dades || dadesBase;
    const ara = op.ara || (() => new Date());
    const clau = op.clau || CLAU;
    const clauAntiga = op.clau ? null : CLAU_V1;
    const emm = op.emmagatzematge === undefined ? emmagatzematgeNavegador() : op.emmagatzematge;

    let estat = null;
    let persistent = !!emm;
    let motiuNoPersistent = emm ? null : 'sense-emmagatzematge';
    const oients = new Set();

    const avui = () => {
      const d = ara();
      const z = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
    };
    const iso = (diesAbans) => new Date(ara().getTime() - (diesAbans || 0) * DIA).toISOString();

    /* ---------- Estat de la llavor ---------- */

    const idTanda = (numero) => 't' + numero;
    const idComanda = (n) => 'CC-' + n;
    const idCorreu = (n) => 'M-' + String(n).padStart(4, '0');
    const idEsdeveniment = (n) => 'E-' + String(n).padStart(4, '0');
    const numeroEsdeveniment = (ev) => Number(String(ev.id).slice(2)) || 0;

    function configPerDefecte() {
      return {
        placesPerTanda: dades.tandes.places,
        subscripcio: !!dades.subscripcio.activaPerDefecte,
        presentacio: false,
        // Mòduls del panell: { id: false } = apagat. Un mòdul que no hi surt és encès (afegir-ne un no demana migrar res).
        moduls: {},
      };
    }

    // Una sola classe de tanda: 26 lots amb data límit (surt quan s'omple o, com a molt tard, a `dataLimit`).
    function novaTanda(e, numero, dataLimit, places, creada) {
      const t = {
        id: idTanda(numero),
        numero,
        nom: 'Tanda ' + numero,
        dataLimit,
        places,
        estat: 'oberta',
        tancadaManual: false,
        subscriptorsSensePlaca: [],
        creada: creada || iso(0),
      };
      e.tandes.push(t);
      return t;
    }

    function llavor() {
      const e = { versio: VERSIO, fase: FASE, config: configPerDefecte(), tandes: [], comandes: [], correus: [], esdeveniments: [], dadesModuls: {}, comptadors: { comanda: 1000, correu: 0, esdeveniment: 0 } };
      const places = e.config.placesPerTanda;
      const ls = dades.llavor;
      const dia = (dies) => afegeixDies(avui(), dies);
      for (const s of ls.tandes) {
        const t = novaTanda(e, s.numero, dia(s.diesLimit), places, iso(s.diesLimit * -1 + 28));
        t.estat = s.estat;
      }
      const metodes = dades.pagament.metodes;
      ls.compradors.forEach((b, i) => {
        const t = tandaDe(e, idTanda(b.tanda));
        const c = afegeixComanda(e, {
          client: { nom: b.nom, cognoms: b.cognoms, email: b.email, telefon: b.telefon, adreca: b.adreca, cp: b.cp, poblacio: b.poblacio, notes: b.notes || '' },
          lots: b.lots,
          tandaId: t.id,
          nova: false,
          enviament: b.mode ? { mode: b.mode } : undefined,
          creada: iso(b.fa),
          metodePagament: metodes[i % metodes.length],
        });
        afegeixCorreu(e, 'comanda-pastor', c, t, { motiu: 'comanda-nova', data: c.creada });
        afegeixCorreu(e, 'comanda-confirmacio', c, t, { motiu: 'comanda-nova', data: c.creada });
      });
      // Les tandes que ja han avançat han passat pels seus estats: queda al registre i a l'historial de cada comprador.
      for (const s of ls.tandes) {
        const t = tandaDe(e, idTanda(s.numero));
        for (const [nom, desfasament] of s.passos || []) {
          const quan = new Date(new Date(t.dataLimit + 'T10:00:00').getTime() + desfasament * DIA).toISOString();
          for (const c of e.comandes.filter((x) => x.tandaId === t.id)) {
            afegeixCorreu(e, 'tanda-' + nom, c, t, { motiu: 'canvi-estat-tanda', data: quan, estatAnterior: null, estatNou: nom });
            c.historial.push({ data: quan, tipus: 'estat-tanda', tandaId: t.id, estat: nom });
            if (nom === 'entregada') {
              c.entregada = quan;
              c.historial.push({ data: quan, tipus: 'entregada' });
            }
          }
        }
      }
      reconstrueixEsdeveniments(e);
      llavorModuls(e);
      return e;
    }

    // Clau d'un client per reconèixer-lo en comandes diferents: el telèfon (9 xifres) o, si no n'hi ha, el correu.
    const clauClient = (k) => {
      const tel = String((k && k.telefon) || '').replace(/\D/g, '').slice(-9);
      return tel.length >= 9 ? 't' + tel : 'e' + String((k && k.email) || '').trim().toLowerCase();
    };

    // La feina que ja han fet els mòduls a les tandes entregades i a la tanda tancada (kg, factures, paquets, opinions…):
    // així el panell s'obre amb historial i no tot buit. Dades dels mòduls i un sol esdeveniment: la carn de la tanda
    // tancada ja és a punt a l'escorxador, perquè «Per fer» s'obri amb el pas que toca (apuntar-ne els kg reals).
    function llavorModuls(e) {
      const dm = e.dadesModuls;
      const escorx = (dm.escorxador = { avisades: {}, kgReals: {} });
      const fact = (dm.factures = { ultima: 0, emeses: {} });
      const env = (dm.enviaments = { comptador: 0, etiquetes: {}, paquets: {} });
      const op = (dm.opinions = { respostes: {} });
      const cl = (dm.clients = { avisos: {} });
      const dia = (t, d) => new Date(new Date(t.dataLimit + 'T10:00:00').getTime() + d * DIA).toISOString();
      let nota = 0;
      for (const t of e.tandes) {
        if (t.estat === 'oberta') continue;
        escorx.avisades[t.id] = dia(t, -4);
        if (t.estat !== 'entregada') continue;
        const cs = e.comandes.filter((c) => c.tandaId === t.id);
        escorx.kgReals[t.id] = {};
        let lot = 0;
        for (const c of cs) {
          escorx.kgReals[t.id][c.id] = Array.from({ length: c.lots }, () => Math.round((4.9 + ((lot++ * 37) % 5) / 10) * 10) / 10);
        }
        env.etiquetes[t.id] = dia(t, -1);
        for (const c of cs) {
          fact.ultima += 1;
          fact.emeses[c.id] = { n: fact.ultima, data: dia(t, -1) };
          if (c.lliurament === 'transportista') {
            env.comptador += 1;
            env.paquets[c.id] = { seguiment: 'SEG-' + String(900000 + env.comptador * 37), historial: [['preparat', -1], ['recollit', 1], ['en-cami', 1.5], ['entregat', 3]].map(([estat, d]) => ({ estat, data: dia(t, d) })) };
          }
          if (c.client.email) {
            // Un sol correu d'entrega per comprador: el de l'opinió ja diu que la té (com fa posaEstat amb Opinions encès)
            e.correus = e.correus.filter((x) => !(x.comandaId === c.id && x.plantilla === 'tanda-entregada'));
            afegeixCorreu(e, 'opinio-demanada', c, t, { motiu: 'entrega', data: c.entregada });
            if (nota < 3) op.respostes[c.id] = { data: dia(t, 4), nota: [5, 4, 5][nota], text: ['Tot en ordre i molt bona carn.', 'Va arribar fred. La picada, molt bona.', ''][nota] };
            nota += 1;
          }
        }
      }
      // Els habituals ja saben que la tanda oberta és oberta
      const oberta = e.tandes.find((t) => t.estat === 'oberta');
      if (oberta) {
        const vegades = {};
        for (const c of e.comandes) vegades[clauClient(c.client)] = (vegades[clauClient(c.client)] || 0) + 1;
        cl.avisos[oberta.id] = { data: iso(20), claus: Object.keys(vegades).filter((k) => vegades[k] > 1) };
      }
      for (const t of e.tandes) {
        if (t.estat === 'completa' && escorx.avisades[t.id]) afegeixEsdeveniment(e, { data: iso(0), tipus: 'escorxador-llest', origen: 'escorxador', tandaId: t.id, dades: { tandaNumero: t.numero }, vist: true });
      }
    }

    /* ---------- Registre d'esdeveniments ---------- */

    // Un sol lloc per on entra tot el que passa al negoci: {id, data, tipus, origen, comandaId?, tandaId?, dades, vist}.
    // `dades` ha de portar prou per escriure la frase sense buscar res més (la comanda pot canviar després).
    function afegeixEsdeveniment(e, x) {
      e.comptadors.esdeveniment = (e.comptadors.esdeveniment || 0) + 1;
      const ev = { id: idEsdeveniment(e.comptadors.esdeveniment), data: x.data || iso(0), tipus: x.tipus, origen: x.origen || 'web', dades: copia(x.dades || {}), vist: !!x.vist };
      if (x.comandaId) ev.comandaId = x.comandaId;
      if (x.tandaId) ev.tandaId = x.tandaId;
      e.esdeveniments.push(ev);
      const max = dades.esdeveniments.max;
      if (e.esdeveniments.length > max) e.esdeveniments.splice(0, e.esdeveniments.length - max);
      return ev;
    }

    const nomComprador = (c) => (String(c.client.nom || '') + ' ' + String(c.client.cognoms || '')).trim();
    const dadesComandaNova = (e, c) => {
      const t = tandaDe(e, c.tandaId);
      return { nom: nomComprador(c), producte: c.producte, lots: c.lots, tandaNumero: t ? t.numero : null };
    };

    // Per a la llavor i per migrar un estat sense registre: el que ja ha passat, deduït de les comandes i del seu
    // historial (tot «vist», excepte les comandes encara noves).
    function reconstrueixEsdeveniments(e) {
      const llista = [];
      const vistos = new Set();
      for (const c of e.comandes) {
        llista.push({ data: c.creada, tipus: 'comanda-nova', origen: 'web', comandaId: c.id, tandaId: c.tandaId || undefined, dades: dadesComandaNova(e, c), vist: !c.nova });
        for (const h of c.historial || []) {
          if (h.tipus !== 'estat-tanda') continue;
          const clauPas = h.tandaId + '|' + h.estat + '|' + h.data;
          if (vistos.has(clauPas)) continue;
          vistos.add(clauPas);
          const t = tandaDe(e, h.tandaId);
          llista.push({ data: h.data, tipus: 'tanda-estat', origen: 'panell', tandaId: h.tandaId, dades: { numero: t ? t.numero : null, de: null, a: h.estat, correus: e.comandes.filter((x) => x.tandaId === h.tandaId).length }, vist: true });
        }
      }
      llista.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)); // estable: a igual data, l'ordre de creació
      e.comptadors = e.comptadors || {};
      e.comptadors.esdeveniment = 0;
      e.esdeveniments = [];
      for (const x of llista) afegeixEsdeveniment(e, x);
    }

    /* ---------- Primitives sobre un estat `e` (serveixen per a l'estat real i per a simulacions) ---------- */

    // Ocupació d'una tanda = places que ocupen les seves comandes (1 per lot; els canals, segons dades.productes). Una
    // comanda retornada abans de sortir allibera el lloc (la retinguda, no: es queda a la tanda fins que paga o es mou).
    const lotsDe = (e, tandaId) => e.comandes.reduce((s, c) => (c.tandaId === tandaId && !(c.pagament === 'retornat' && (!c.via || c.via === 'fora')) ? s + c.places : s), 0);
    const lliures = (e, t) => t.places - lotsDe(e, t.id);
    // Una tanda `oberta` amb la data límit ja passada ha de sortir igualment: no admet més comandes (el dia mateix
    // de la data límit encara sí). L'estat només el canvia el pastor; això és el que veu la web.
    const vencuda = (t) => t.estat === 'oberta' && t.dataLimit < avui();
    const admetComandes = (t) => t.estat === 'oberta' && !vencuda(t);
    const obertes = (e) => e.tandes.filter(admetComandes).sort((a, b) => a.numero - b.numero);
    const tandaDe = (e, id) => e.tandes.find((t) => t.id === id) || null;
    const ocupacioDe = (e, t) => {
      const lots = lotsDe(e, t.id);
      return { lots, places: t.places, lliures: Math.max(0, t.places - lots), percent: Math.min(100, Math.round((lots / t.places) * 100)), plena: lots >= t.places };
    };

    // `lots` = unitats del producte. `places` = places de tanda que ocupa (instantània de la configuració d'aquell
    // moment; 0 i `tandaId: null` si el producte no n'ocupa: «entrega per acordar», sense enviament calculat).
    const normaNom = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    // El cost d'enviament d'una comanda a partir del que ha triat el comprador (`enviament: { mode, poble }`). Si la
    // recull ell mateix a Sort (`recull`, també per telèfon), 0 €. Per telèfon, sense `mode` a les rodalies s'entén «a
    // casa», i el poble és el de la població que ha dit el comprador (si no coincideix amb cap, falta triar-lo).
    function costDeComanda(client, lots, enviament, recull, telefon) {
      if (recull) return { valid: true, enviable: true, complet: true, cal: null, zona: null, lliurament: 'recull', mode: 'recollida', poble: null, caixes: null, gratis: true, import: 0, etiqueta: null, mostra: false };
      const eo = enviament || {};
      const o = { lots, mode: eo.mode, poble: eo.poble };
      if (telefon && !o.mode) {
        o.mode = 'casa';
        if (!o.poble) o.poble = (dades.poblesDeCP(client.cp).find((p) => normaNom(p.nom) === normaNom(client.poblacio)) || {}).nom;
      }
      return dades.costEnviament(client.cp, o);
    }

    function afegeixComanda(e, d) {
      e.comptadors.comanda += 1;
      const producte = d.producte || 'lot';
      const cfg = dades.productes[producte];
      const ocupa = !!(cfg && cfg.ocupaPlaces);
      const recull = ocupa && !!d.recull;
      const cost = costDeComanda(d.client, d.lots, d.enviament, recull, d.origen === 'telefon');
      const c = {
        // «recull» (el comprador la recull a Sort), «repartiment-propi» (a casa, el porta el pastor, preu del poble) o
        // «transportista» (en caixa a la resta de Catalunya); null si no entra a cap tanda o l'enviament no és definitiu
        lliurament: ocupa ? (cost.complet ? cost.lliurament : null) : null,
        enviament: ocupa ? { mode: cost.mode || null, poble: cost.poble || null, caixes: cost.caixes || null } : null,
        // P45 (art. 21.2 LSSI): true tret que el comprador hagi marcat «No vull rebre aquests avisos»
        avisosTanda: d.avisosTanda !== false,
        metodePagament: d.metodePagament || dades.pagament.metodes[0],
        id: idComanda(e.comptadors.comanda),
        creada: d.creada || iso(0),
        nova: d.nova !== undefined ? d.nova : true,
        client: d.client,
        producte,
        lots: d.lots,
        places: ocupa ? d.lots * cfg.placesPerUnitat : 0,
        tandaId: ocupa ? d.tandaId : null,
        importLots: dades.preuProducte(producte, d.lots).import,
        importEnviament: ocupa ? (cost.complet ? cost.import : 0) : null,
        // D'on ve la comanda (web o telèfon), com va el cobrament ('pagat', 'pendent', 'fallit', 'retornat', 'recurrent'),
        // quan s'ha entregat (null si encara no) i, si no hi cabia a la primera tanda oberta, quina era
        origen: d.origen || 'web',
        pagament: d.pagament || 'pagat',
        entregada: d.entregada || null,
        desviada: d.desviada || null,
        subscripcio: d.subscripcio || null,
        origenSubscripcio: d.origenSubscripcio || null,
        historial: [{ data: d.creada || iso(0), tipus: 'creada', tandaId: ocupa ? d.tandaId : null }],
      };
      e.comandes.push(c);
      return c;
    }

    // El correu desa plantilla + dades (instantània): el text final el posa PLA-COPY.md quan es mostri.
    function afegeixCorreu(e, plantilla, comanda, tanda, extra) {
      const x = extra || {};
      e.comptadors.correu += 1;
      const alPastor = plantilla === 'comanda-pastor' || x.destinatari === 'pastor';
      const m = {
        id: idCorreu(e.comptadors.correu),
        plantilla,
        destinatari: alPastor ? 'pastor' : 'comprador',
        a: alPastor ? dades.correus.pastor : comanda.client.email,
        data: x.data || iso(0),
        motiu: x.motiu,
        simulat: true,
        canal: 'correu', // WhatsApp: previst a `dades.avisos.whatsapp` (desactivat, no implementat)
        comandaId: comanda.id,
        tandaId: tanda ? tanda.id : null,
        dades: {
          comanda: { id: comanda.id, producte: comanda.producte, lots: comanda.lots, importLots: comanda.importLots, importEnviament: comanda.importEnviament, lliurament: comanda.lliurament, enviament: copia(comanda.enviament), avisosTanda: comanda.avisosTanda !== false, origenSubscripcio: comanda.origenSubscripcio || null, subscripcio: comanda.subscripcio ? copia(comanda.subscripcio) : null, metodePagament: comanda.metodePagament, pagament: comanda.pagament, client: copia(comanda.client) },
          // `null` si la comanda no entra a cap tanda (entrega per acordar)
          tanda: tanda ? { id: tanda.id, numero: tanda.numero, nom: tanda.nom, dataLimit: tanda.dataLimit, places: tanda.places, estat: tanda.estat, ocupats: lotsDe(e, tanda.id) } : null,
        },
      };
      // El correu al pastor porta l'enllaç al panell (a la comanda: `…/panell/#comanda=CC-1013`).
      if (alPastor) m.dades.enllacPanell = dades.enllacPanell(comanda.id);
      // Dades pròpies d'un mòdul (la plantilla és seva; el text el posa el mòdul)
      if (x.dadesExtra !== undefined) m.dades.extra = copia(x.dadesExtra);
      if (x.estatNou !== undefined) {
        m.dades.estatAnterior = x.estatAnterior;
        m.dades.estatNou = x.estatNou;
      }
      e.correus.push(m);
      return m;
    }

    // Data límit d'una tanda nova: la darrera data límit coneguda (o avui, si ja ha passat) + el període.
    function dataLimitNova(e) {
      const dates = e.tandes.map((t) => t.dataLimit).filter(Boolean).sort();
      const darrera = dates.length ? dates[dates.length - 1] : null;
      const base = darrera && darrera > avui() ? darrera : avui();
      return afegeixDies(base, dades.tandes.periodeSetmanes * 7);
    }

    // Cada quantes tandes toca un subscriptor: la tanda surt com a màxim cada `periodeSetmanes`, així que
    // «cada setmana», «cada 2» i «cada mes» són una per tanda, i «cada 2 mesos» una de cada dues.
    const tandesEntreEntregues = (freqSetmanes) => Math.max(1, Math.round(freqSetmanes / dades.tandes.periodeSetmanes));

    function ompleSubscriptors(e, t) {
      for (const base of e.comandes.filter((c) => c.subscripcio && !c.subscripcio.cancelada)) {
        const s = base.subscripcio;
        const salt = t.numero - s.primeraTandaNumero;
        if (salt <= 0 || salt % tandesEntreEntregues(s.frequenciaSetmanes) !== 0) continue;
        if (s.lotsPerEntrega * dades.productes.lot.placesPerUnitat > lliures(e, t)) {
          t.subscriptorsSensePlaca.push(base.id);
          continue;
        }
        afegeixComanda(e, {
          client: copia(base.client),
          lots: s.lotsPerEntrega,
          tandaId: t.id,
          nova: false,
          enviament: base.enviament ? { mode: base.enviament.mode, poble: base.enviament.poble } : undefined,
          avisosTanda: base.avisosTanda,
          recull: base.lliurament === 'recull',
          pagament: 'recurrent',
          metodePagament: base.metodePagament,
          origenSubscripcio: base.id,
        });
      }
    }

    function obreTanda(e, o) {
      const x = o || {};
      const numero = e.tandes.reduce((m, t) => Math.max(m, t.numero), 0) + 1;
      const data = x.dataLimit ? x.dataLimit : dataLimitNova(e);
      const t = novaTanda(e, numero, data, x.places || e.config.placesPerTanda);
      if (e.config.subscripcio) ompleSubscriptors(e, t);
      return t;
    }

    /* ---------- El recorregut: una sola taula d'on surten els passos, les tasques i els botons ----------
       FONAMENT.md §«El recorregut». La tanda i cada comanda avancen per aquests passos, en aquest ordre, i cap acció (de
       tanda, de paquet, de ruta o de mòdul) no se'n pot saltar cap. Un pas d'un mòdul (`modul`) només hi és si el panell
       l'hi ha connectat (`connectaModuls`) i el mòdul és encès; a més, només compta mentre la tanda és a l'estat d'abans
       del pas (si el mòdul s'encén quan la tanda ja l'ha passat, no la fa tornar enrere). Sense panell (la web), la
       tanda només té els seus estats. */
    let modulConnectat = () => false;
    const actiuRec = (id) => {
      try {
        return !!modulConnectat(id);
      } catch (x) {
        return false;
      }
    };
    const dm = (e, id) => (e.dadesModuls && e.dadesModuls[id]) || {};
    const ordreEstat = (s) => dades.estatsTanda.indexOf(s);
    const comandesT = (e, t) => e.comandes.filter((c) => c.tandaId === t.id);
    const carnDemanadaDe = (e, t) => !!(dm(e, 'escorxador').avisades || {})[t.id];
    // La carn demanada ja hi comptava aquesta comanda? (l'escorxador apunta quines surten quan es demana; si no ho diu, val
    // que en tingui els kg reals)
    const comptadaALaCarn = (e, t, c) => {
      const d = dm(e, 'escorxador');
      const ll = (d.demanades || {})[t.id];
      return ll ? ll.includes(c.id) : !!(((d.kgReals || {})[t.id] || {})[c.id]);
    };
    const kgRealsDe = (e, t) => !!(dm(e, 'escorxador').kgReals || {})[t.id];
    const paquetDe = (e, id) => (dm(e, 'enviaments').paquets || {})[id] || null;
    const estatPaquet = (p) => (p && p.historial && p.historial.length ? p.historial[p.historial.length - 1].estat : '');
    // EL FILTRE de les comandes que surten amb una tanda: ni les retingudes (sense pagar) ni les retornades. El fan servir
    // totes les llistes, comptes i correus (transport, ruta, etiquetes, escorxador, kg, correus de la tanda).
    const surtenT = (e, t) => comandesT(e, t).filter((c) => surtAmbTanda(c));
    const noSurtenT = (e, t) => comandesT(e, t).filter((c) => !surtAmbTanda(c));
    // Per què no surt (es veu a la tanda, a part)
    const motiuNoSurt = (c) => (viaDe(c) === 'fora' ? 'Diners retornats: no surt' : c.pagament === 'fallit' ? 'No s’ha pogut cobrar: no surt fins que pagui' : 'Encara no ha pagat: no surt fins que pagui');
    // Només les que surten amb el transportista
    const senseEtiqueta = (e, t) => surtenT(e, t).filter((c) => viaDe(c) === 'paquet' && !c.entregada && !paquetDe(e, c.id));

    // La tanda. `estat`: el pas és un estat de la tanda (`dades.estatsTanda`). `modul`: el pas és d'un mòdul; `aplica`:
    // si toca a aquesta tanda; `fet`: si ja s'ha fet. `requereix`: el que ha de ser cert per poder fer el pas.
    const RECORREGUT_TANDA = [
      { id: 'oberta', estat: 'oberta' },
      { id: 'tancada', estat: 'completa' },
      { id: 'carn-demanada', modul: 'escorxador', aplica: (e, t) => lotsSurten(e, t) > 0, fet: carnDemanadaDe },
      { id: 'kg-reals', modul: 'escorxador', aplica: (e, t) => lotsSurten(e, t) > 0, fet: kgRealsDe },
      { id: 'preparacio', estat: 'preparacio' },
      { id: 'etiquetes', modul: 'enviaments', fet: (e, t) => !senseEtiqueta(e, t).length },
      { id: 'enviada', estat: 'enviada' },
      { id: 'entregada', estat: 'entregada', requereix: (e, t) => !entregaPendent(e, t.id).length },
    ];
    // La comanda: cobrament → lliurament → entregada → opinió. El lliurament és d'un mòdul (paquet o ruta) o de la tanda.
    // `seguent`: des de cada estat, on es pot anar; `tanda`: en quins estats de la tanda es pot fer.
    const LLIURAMENT = {
      paquet: {
        modul: 'enviaments',
        per: (c) => c.lliurament === 'transportista',
        seguent: { '': ['preparat'], preparat: ['recollit'], recollit: ['en-cami'], 'en-cami': ['entregat', 'no-entregat'], 'no-entregat': ['en-cami'] },
        tanda: { preparat: ['preparacio'], recollit: ['enviada'], 'en-cami': ['enviada'], entregat: ['enviada'], 'no-entregat': ['enviada'] },
      },
      ruta: {
        modul: 'ruta',
        per: (c) => c.lliurament === 'repartiment-propi' || c.lliurament === 'recull',
        seguent: { '': ['entregada'] },
        tanda: { entregada: ['enviada'] },
      },
    };
    // Cobrament: d'on a on es pot passar (el fa el mòdul de pagaments; no atura la tanda, però sense ell no hi ha factura)
    const COBRAMENT = { pendent: ['pagat'], fallit: ['pagat'], pagat: ['fallit', 'retornat'], recurrent: ['fallit', 'retornat'], retornat: [] };
    const cobrada = (c) => c.pagament === 'pagat' || c.pagament === 'recurrent';
    // L'entrega en mà: la ruta, la recull a la granja o (sense tanda) es queda el dia. Només així es pot cobrar en efectiu.
    const enMa = (c) => c.lliurament === 'repartiment-propi' || c.lliurament === 'recull' || !c.tandaId;
    // Decisió d'en Lluc (05/11/2026): una comanda amb el cobrament fallit, o sense pagar (enllaç o «per decidir»), no surt
    // fins que paga. Es queda a la tanda, sense etiqueta, enviament ni ruta, i la tanda pot sortir sense ella. L'efectiu en
    // mà no la reté: es cobra en entregar. Sense el mòdul de pagaments el cobrament no es porta: no es reté res.
    const retornada = (c) => c.pagament === 'retornat';
    const lotsSurten = (e, t) => surtenT(e, t).reduce((n, c) => n + c.places, 0);
    const retinguda = (c) => actiuRec('pagaments') && !c.entregada && (c.pagament === 'fallit' || (c.pagament === 'pendent' && !(c.metodePagament === 'efectiu' && enMa(c))));
    // L'ordre de tots els passos junts (el de les tasques d'una tanda a «Avui»). La factura no atura res: va quan la carn
    // ja és lliurada (es pot emetre abans, en tenir els kg i el cobrament, però no passa per davant de la tanda)
    const ORDRE_PASSOS = ['cobrament', 'oberta', 'tancada', 'carn-demanada', 'kg-reals', 'preparacio', 'etiquetes', 'enviada', 'lliurament', 'entregada', 'factura', 'opinio'];

    // Els passos que compten ara per a la tanda (els dels mòduls apagats o ja passats, fora)
    function passosDe(e, t) {
      let anterior = null;
      const sortida = [];
      for (const p of RECORREGUT_TANDA) {
        if (p.estat) {
          anterior = p.estat;
          sortida.push(p);
        } else if (actiuRec(p.modul) && t.estat === anterior && (!p.aplica || p.aplica(e, t))) sortida.push(p);
      }
      return sortida;
    }
    const pasFet = (e, t, p) => (p.estat ? ordreEstat(t.estat) >= ordreEstat(p.estat) : p.fet(e, t));
    // El pas que toca ara (el primer que no s'ha fet), o null si la tanda ja és entregada
    const pasDe = (e, t) => passosDe(e, t).find((p) => !pasFet(e, t, p)) || null;
    function potPassar(e, t, nou) {
      if (!dades.estatsTanda.includes(nou)) return err('estat_invalid');
      if (nou === t.estat) return err('mateix_estat');
      if (ordreEstat(nou) < ordreEstat(t.estat)) return err('estat_enrere');
      const p = pasDe(e, t);
      if (!p || p.estat !== nou) return err(p && p.modul ? 'pas_pendent' : 'salta_pas', { pas: p ? p.id : null });
      if (p.requereix && !p.requereix(e, t)) return err('entrega_pendent', { comandes: entregaPendent(e, t.id) });
      return { ok: true };
    }

    // Qui entrega la comanda: 'paquet' (Enviaments encès), 'ruta' (Ruta encesa), 'tanda' (la tanda, en passar a
    // «Entregada»), 'a-part' (sense tanda: entrega per acordar), 'retinguda' (no surt fins que pagui) o 'fora' (pagament
    // retornat: ha sortit del recorregut). Quan la tanda surt («Enviada»), la via de cada comanda queda fixada (`c.via`):
    // un mòdul que s'encén més tard no fa tornar enrere la tanda ni les seves comandes.
    const viaDe = (c) => {
      // Ja ha sortit: es segueix per la seva via fins que arriba (si es retornen els diners amb el paquet en camí, el
      // paquet no desapareix: la tanda l'espera i, en arribar, no rep cap correu d'entrega ni d'opinió)
      if (c.via && c.via !== 'retinguda') return c.via;
      if (retornada(c)) return 'fora';
      if (c.via) return c.via;
      if (retinguda(c)) return 'retinguda';
      for (const k of Object.keys(LLIURAMENT)) if (actiuRec(LLIURAMENT[k].modul) && LLIURAMENT[k].per(c)) return k;
      return c.tandaId ? 'tanda' : 'a-part';
    };
    // Surt amb la tanda (no és retinguda ni retornada)
    const surtAmbTanda = (c) => viaDe(c) !== 'retinguda' && viaDe(c) !== 'fora';
    // Comandes de la tanda que un mòdul encara ha d'entregar: mentre n'hi hagi, la tanda no pot passar a «Entregada»
    const entregaPendent = (e, tandaId) => e.comandes.filter((x) => x.tandaId === tandaId && !x.entregada && (viaDe(x) === 'paquet' || viaDe(x) === 'ruta')).map((x) => x.id);
    // Cap mòdul no es pot apagar amb coses a mig fer: l'estat d'entrega (o els kg que s'esperen) no es perd mai
    const PENDENTS_MODUL = {
      enviaments: (e) => e.comandes.filter((c) => !c.entregada && viaDe(c) === 'paquet' && ['preparat', 'recollit', 'en-cami', 'no-entregat'].includes(estatPaquet(paquetDe(e, c.id)))).map((c) => c.id),
      ruta: (e) => e.comandes.filter((c) => !c.entregada && viaDe(c) === 'ruta' && (tandaDe(e, c.tandaId) || {}).estat === 'enviada').map((c) => c.id),
      escorxador: (e) => e.tandes.filter((t) => t.estat === 'completa' && carnDemanadaDe(e, t) && !kgRealsDe(e, t)).map((t) => t.id),
      // Cobraments per fer (fallits, enllaços sense pagar, efectiu per cobrar): sense el mòdul ningú no els podria cobrar
      pagaments: (e) => e.comandes.filter((c) => c.pagament === 'pendent' || c.pagament === 'fallit').map((c) => c.id),
    };

    // Lliurament d'una comanda: per on va, en quin punt és i què pot venir ara
    function lliuramentDe(e, c) {
      const via = viaDe(c);
      const L = LLIURAMENT[via];
      const t = tandaDe(e, c.tandaId);
      // Sense tanda (canal, entrega per acordar): es queda el dia amb el comprador i, quan la té, es marca entregada
      if (via === 'a-part') return { via, estat: c.entregada ? 'entregada' : '', seguents: c.entregada ? [] : ['entregada'] };
      if (!L) return { via, estat: c.entregada ? 'entregada' : '', seguents: [] };
      const estat = via === 'paquet' ? estatPaquet(paquetDe(e, c.id)) : c.entregada ? 'entregada' : '';
      const seguents = c.entregada ? [] : (L.seguent[estat] || []).filter((s) => t && (L.tanda[s] || []).includes(t.estat));
      return { via, estat, seguents };
    }

    // La factura d'una comanda: cobrada i, si l'escorxador és encès, amb els kg reals (mentre la tanda els espera)
    function potFacturar(e, c) {
      if ((dm(e, 'factures').emeses || {})[c.id]) return err('ja_facturada');
      if (!cobrada(c)) return err('no_cobrada');
      const t = tandaDe(e, c.tandaId);
      if (t && actiuRec('escorxador')) {
        const kg = ((dm(e, 'escorxador').kgReals || {})[t.id] || {})[c.id];
        if (!kg && (ordreEstat(t.estat) < ordreEstat('preparacio') || carnDemanadaDe(e, t))) return err('falten_kg', { carnDemanada: carnDemanadaDe(e, t), tandaNumero: t.numero });
      }
      return { ok: true };
    }

    // Marca una comanda com a entregada i, si era l'última de la tanda enviada, la tanda passa sola a «Entregada».
    // Torna els ids de les comandes que acaben d'arribar (per avisar `alEntregar` un cop desat).
    function entrega(e, c, origen) {
      const quan = iso(0);
      c.entregada = quan;
      c.historial.push({ data: quan, tipus: 'entregada' });
      const t = tandaDe(e, c.tandaId);
      if (t && t.estat === 'enviada' && comandesT(e, t).every((x) => x.entregada || !surtAmbTanda(x))) {
        const generats = posaEstat(e, t, 'entregada', false, [c.id]);
        afegeixEsdeveniment(e, { tipus: 'tanda-estat', origen: origen || 'panell', tandaId: t.id, dades: { numero: t.numero, de: 'enviada', a: 'entregada', correus: generats.length }, vist: true });
      }
      return [c.id];
    }

    // Canvi d'estat amb efectes: historial de cada comprador i un correu per comprador (excepte `oberta`).
    // `araEntregades`: les comandes que s'entreguen en aquest mateix moment (per al correu d'entrega, que és un de sol).
    function posaEstat(e, t, nou, auto, araEntregades) {
      const anterior = t.estat;
      t.estat = nou;
      const generats = [];
      const quan = iso(0);
      // Quan la tanda surt, la via de cada comanda queda fixada (un mòdul que s'encén més tard no la fa recular)
      if (nou === 'enviada') for (const c of comandesT(e, t)) c.via = viaDe(c);
      const ara = new Set(araEntregades || []);
      for (const c of e.comandes.filter((x) => x.tandaId === t.id)) {
        c.historial.push({ data: quan, tipus: 'estat-tanda', tandaId: t.id, estat: nou });
        if (auto && nou === 'completa' && !dades.correus.avisaCompletaAutomatica) continue;
        if (!rebCorreuEstat(e, t, nou, c, ara)) continue;
        generats.push(afegeixCorreu(e, 'tanda-' + nou, c, t, { motiu: 'canvi-estat-tanda', estatAnterior: anterior, estatNou: nou }).id);
      }
      return generats;
    }
    // Qui rep el correu d'un canvi d'estat de la tanda. `ara`: les que s'entreguen en aquest mateix moment.
    function rebCorreuEstat(e, t, nou, c, ara) {
      if (nou === 'oberta') return false;
      if (!c.client.email) return false; // per telèfon sense correu: ho sap pel telèfon (qui recull a Sort i té correu, rep l'avís que és a punt)
      // Només les que surten: a la retinguda no se li promet res («aviat la començarem a preparar», «ha sortit»), i la
      // retornada ja no és de la tanda (ni tan sols si els diners es retornen amb el paquet en camí)
      if (!surtAmbTanda(c) || retornada(c)) return false;
      // «Ja tens la comanda a casa» només a qui la té de veritat (mai a un paquet que no ha arribat), i un sol correu
      // d'entrega per comprador: si ja ha rebut el de l'opinió («ja és a casa»), o el rebrà ara mateix, aquest no
      if (nou === 'entregada' && !c.entregada && !ara.has(c.id)) return false;
      if (nou === 'entregada' && e.correus.some((x) => x.comandaId === c.id && x.plantilla === 'opinio-demanada')) return false;
      if (nou === 'entregada' && ara.has(c.id) && actiuRec('opinions')) return false;
      // Un sol avís per estat i tanda (una tanda plena que es buida i es torna a omplir no el repeteix)
      if (e.correus.some((x) => x.plantilla === 'tanda-' + nou && x.comandaId === c.id && x.tandaId === t.id)) return false;
      return true;
    }

    // Manté les invariants després de qualsevol canvi: una tanda plena passa a `completa` (i avisa), una
    // `completa` que ha recuperat places torna a `oberta` (en silenci, si no l'ha tancada el pastor ni ha passat
    // la data límit) i sempre n'hi ha una que admet comandes.
    function normalitza(e, origen) {
      const correus = [];
      for (let volta = 0; volta < 12; volta++) {
        let canvi = false;
        for (const t of e.tandes) {
          const plena = lotsDe(e, t.id) >= t.places;
          if (t.estat === 'oberta' && plena) {
            afegeixEsdeveniment(e, { tipus: 'tanda-plena', origen: origen || 'web', tandaId: t.id, dades: { numero: t.numero, lots: lotsDe(e, t.id), places: t.places } });
            correus.push(...posaEstat(e, t, 'completa', true));
            canvi = true;
          } else if (t.estat === 'completa' && !plena && !t.tancadaManual && t.dataLimit >= avui() && !carnDemanadaDe(e, t)) {
            // (si ja s'ha demanat la carn a l'escorxador, la tanda no torna a obrir-se: el que s'ha demanat ja no canvia)
            t.estat = 'oberta';
            canvi = true;
          }
        }
        if (!obertes(e).length) {
          obreTanda(e);
          canvi = true;
        }
        if (!canvi) break;
      }
      return correus;
    }

    // Assignació: la comanda sencera, a la primera tanda oberta on hi càpiga. Obre les tandes que calguin.
    // Serveix per a la previsió (sobre una còpia) i per a la comanda de veritat (sobre l'estat).
    // `lots` són les PLACES que ocupa la comanda (= lots, per al lot).
    function assigna(e, lots) {
      const maxLots = e.config.placesPerTanda;
      if (!Number.isInteger(lots) || lots < 1) return err('lots_invalids', { lots });
      if (lots > maxLots) return err('massa_lots', { lots, maxLots });
      normalitza(e);
      const primera = obertes(e)[0];
      const primeraInfo = { tandaId: primera.id, numero: primera.numero, dataLimit: primera.dataLimit, placesLliures: lliures(e, primera) };
      let tandaNova = false;
      for (let volta = 0; volta < 20; volta++) {
        const t = obertes(e).find((x) => lliures(e, x) >= lots);
        if (t) {
          return {
            ok: true,
            lots,
            tandaId: t.id,
            tandaNumero: t.numero,
            dataLimit: t.dataLimit,
            tandaNova,
            motiu: tandaNova ? 'tanda-nova' : t.id === primera.id ? 'hi-cap' : 'no-hi-cap-a-la-primera',
            primera: primeraInfo,
            faltenPlaces: Math.max(0, lots - primeraInfo.placesLliures),
          };
        }
        obreTanda(e);
        tandaNova = true;
      }
      return err('sense_lloc', { lots });
    }

    /* ---------- Validació del comprador ---------- */

    // `opcions.sensAdreca`: qui recull a Sort no cal que doni adreça (ni notes d'entrega); la resta de camps es demanen igual
    function validaClient(c, opcions) {
      const x = c || {};
      const s = (v) => String(v === undefined || v === null ? '' : v).trim();
      const errors = {};
      if (!s(x.nom)) errors.nom = 'buit';
      if (!s(x.email)) errors.email = 'buit';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(x.email))) errors.email = 'format';
      const tel = s(x.telefon).replace(/[\s.\-]/g, '').replace(/^(\+34|0034)/, '');
      if (!tel) errors.telefon = 'buit';
      else if (!/^[6-9]\d{8}$/.test(tel)) errors.telefon = 'format';
      if (!s(x.adreca) && !(opcions && opcions.sensAdreca)) errors.adreca = 'buit';
      const cp = dades.validaCP(x.cp);
      if (!cp.valid) errors.cp = cp.motiu;
      if (!s(x.poblacio)) errors.poblacio = 'buit';
      const net = {
        nom: s(x.nom),
        cognoms: s(x.cognoms),
        email: s(x.email),
        telefon: s(x.telefon),
        adreca: opcions && opcions.sensAdreca ? '' : s(x.adreca),
        cp: cp.cp,
        poblacio: s(x.poblacio),
        notes: opcions && opcions.sensAdreca ? '' : s(x.notes),
      };
      return { ok: Object.keys(errors).length === 0, errors, client: net };
    }

    // Comprador d'una comanda per telèfon: nom i telèfon sempre; adreça només si no la recull; el correu és opcional.
    function validaClientTelefon(c, recull) {
      const x = c || {};
      const s = (v) => String(v === undefined || v === null ? '' : v).trim();
      const errors = {};
      if (!s(x.nom)) errors.nom = 'buit';
      const tel = s(x.telefon).replace(/[\s.\-]/g, '').replace(/^(\+34|0034)/, '');
      if (!tel) errors.telefon = 'buit';
      else if (!/^[6-9]\d{8}$/.test(tel)) errors.telefon = 'format';
      if (s(x.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(x.email))) errors.email = 'format';
      const cp = recull ? { cp: '' } : dades.validaCP(x.cp);
      if (!recull) {
        if (!s(x.adreca)) errors.adreca = 'buit';
        if (!cp.valid) errors.cp = cp.motiu;
        if (!s(x.poblacio)) errors.poblacio = 'buit';
      }
      const net = { nom: s(x.nom), cognoms: s(x.cognoms), email: s(x.email), telefon: s(x.telefon), adreca: recull ? '' : s(x.adreca), cp: cp.cp, poblacio: recull ? '' : s(x.poblacio), notes: s(x.notes) };
      return { ok: Object.keys(errors).length === 0, errors, client: net };
    }

    /* ---------- Persistència ---------- */

    function estatValid(x, versio) {
      return !!x && typeof x === 'object' && x.versio === (versio || VERSIO) && x.config && typeof x.config === 'object' &&
        Array.isArray(x.tandes) && Array.isArray(x.comandes) && Array.isArray(x.correus) && x.comptadors && typeof x.comptadors === 'object';
    }

    // Interpreta el text desat d'una clau: l'estat o null (no hi és, JSON trencat o versió que no toca).
    function interpreta(text, versio) {
      if (!text) return null;
      try {
        const x = JSON.parse(text);
        return estatValid(x, versio) ? x : null;
      } catch (e) {
        return null;
      }
    }

    // Deixa un estat desat (de qualsevol versió anterior) amb tot el que la versió actual espera. No esborra res.
    function adapta(x) {
      x.versio = VERSIO;
      // Fase A de la versió real (07/11/2026): la subscripció passa a estar activa per defecte. Es posa al dia una sola
      // vegada (l'estat desat d'abans no té `fase`); després, el que digui el panell.
      if (x.fase !== FASE) {
        x.fase = FASE;
        x.config.subscripcio = !!dades.subscripcio.activaPerDefecte;
      }
      if (!x.config.moduls || typeof x.config.moduls !== 'object' || Array.isArray(x.config.moduls)) x.config.moduls = {};
      if (!x.dadesModuls || typeof x.dadesModuls !== 'object' || Array.isArray(x.dadesModuls)) x.dadesModuls = {};
      if (typeof x.comptadors.esdeveniment !== 'number') x.comptadors.esdeveniment = 0;
      // Estats desats per versions anteriors del codi (no hi ha cap UI publicada que els tingui, però no peten).
      delete x.config.modeTandes;
      for (const t of x.tandes) {
        if (t.dataLimit === undefined) t.dataLimit = t.dataSortida || dataLimitNova(x);
        delete t.dataSortida;
        delete t.dataGuardada;
      }
      for (const c of x.comandes) {
        if (c.origen === undefined) c.origen = 'web';
        if (c.entregada === undefined) {
          const t = x.tandes.find((o) => o.id === c.tandaId);
          const pas = (c.historial || []).filter((h) => h.tipus === 'estat-tanda' && h.estat === 'entregada').pop();
          c.entregada = t && t.estat === 'entregada' ? (pas ? pas.data : c.creada) : null;
        }
        if (c.desviada === undefined) c.desviada = null;
        if (c.producte === undefined) c.producte = 'lot';
        if (c.places === undefined) c.places = c.lots;
        if (c.metodePagament === undefined) c.metodePagament = dades.pagament.metodes[0];
        if (c.lliurament === undefined) {
          const cost = dades.costEnviament(c.client && c.client.cp, { lots: c.lots, mode: 'casa' }); // abans de l'elecció del comprador, les rodalies eren «a casa»
          c.lliurament = c.tandaId && cost.complet ? cost.lliurament : null;
        }
      }
      if (!Array.isArray(x.esdeveniments)) reconstrueixEsdeveniments(x);
      return x;
    }

    function marcaFallada(e) {
      persistent = false;
      motiuNoPersistent = (e && e.name) || 'error';
    }

    function desa() {
      if (!emm) return;
      try {
        emm.escriu(clau, JSON.stringify(estat));
        persistent = true;
        motiuNoPersistent = null;
      } catch (e) {
        marcaFallada(e);
      }
    }

    // Llegeix l'emmagatzematge. Si no hi ha res o no es pot fer servir, es queda amb el que ja tenia o amb la llavor.
    function carrega() {
      let text = null;
      let llegit = false;
      if (emm) {
        try {
          text = emm.llegeix(clau);
          llegit = true;
          persistent = true;
          motiuNoPersistent = null;
        } catch (e) {
          marcaFallada(e);
        }
      }
      if (llegit && text) {
        const x = interpreta(text, VERSIO);
        if (x) {
          estat = adapta(x);
          return;
        }
      }
      // Cap estat a la clau actual: si hi ha el de la v1 (la clau de la maqueta d'abans), s'hi continua. La clau
      // vella no es toca: queda tal com era.
      if (llegit && !text && clauAntiga) {
        let vell = null;
        try {
          vell = interpreta(emm.llegeix(clauAntiga), 1);
        } catch (e) {
          /* sense clau vella */
        }
        if (vell) {
          estat = adapta(vell);
          desa();
          return;
        }
      }
      if (!estat) estat = llavor();
      if (llegit) desa();
    }

    function notifica(info) {
      for (const fn of Array.from(oients)) {
        try {
          fn(info);
        } catch (e) {
          /* un oient que falla no ha d'aturar els altres */
        }
      }
    }

    // Tota mutació: refresca d'emmagatzematge (per no trepitjar l'altra pestanya), aplica, desa i avisa.
    // Les funcions validen ABANS de tocar res; si tornen {ok:false} no es desa res.
    function muta(tipus, fn) {
      carrega();
      const r = fn();
      if (r && r.ok === false) return r;
      desa();
      notifica({ origen: 'local', tipus });
      return r;
    }

    // Una comanda retinguda (no ha sortit amb la seva tanda) va a la primera tanda que l'admeti (o a una de nova, com una
    // comanda que no hi cap). Torna { de, a } (números de tanda) o null si no s'ha pogut.
    function mouASeguent(e, c) {
      const o = tandaDe(e, c.tandaId);
      const a = assigna(e, c.places);
      if (!a.ok) return null;
      const d = tandaDe(e, a.tandaId);
      c.tandaId = d.id;
      delete c.via;
      c.historial.push({ data: iso(0), tipus: 'moguda', de: o ? o.id : null, a: d.id });
      // Li diem on va ara (no ha sortit amb la seva tanda i ja ha pagat)
      if (c.client.email) afegeixCorreu(e, 'comanda-moguda', c, d, { motiu: 'moguda', dadesExtra: { de: o ? o.numero : null, pagada: true } });
      normalitza(e);
      return { de: o ? o.numero : null, a: d.numero };
    }

    /* ---------- Vistes (còpies: la UI no pot embrutar l'estat) ---------- */

    // L'estat d'una comanda és el de la seva tanda; sense tanda (canals per defecte): 'per-acordar'.
    const estatDe = (c) => {
      const t = tandaDe(estat, c.tandaId);
      return t ? t.estat : 'per-acordar';
    };
    const vistaComanda = (c) => {
      const t = tandaDe(estat, c.tandaId);
      return Object.assign(copia(c), { estat: estatDe(c), tandaNumero: t ? t.numero : null });
    };

    // Quantitat vàlida per a un producte: unitats enteres ≥ 1, producte que existeix, màxim per comanda i, si ocupa
    // places, que càpiga en una tanda. Torna {ok, producte, lots, ocupa, places} o l'error.
    function validaQuantitat(producte, lots) {
      const cfg = dades.productes[producte];
      if (!cfg) return err('producte_invalid', { producte });
      if (!Number.isInteger(lots) || lots < 1) return err('lots_invalids', { lots });
      const max = maxPerProducte(producte);
      if (lots > max) return err('massa_lots', { lots, maxLots: max });
      const ocupa = !!cfg.ocupaPlaces;
      return { ok: true, producte, lots, ocupa, places: ocupa ? lots * cfg.placesPerUnitat : 0 };
    }
    function maxPerProducte(producte) {
      const cfg = dades.productes[producte];
      const capTanda = cfg.ocupaPlaces && cfg.placesPerUnitat > 0 ? Math.floor(estat.config.placesPerTanda / cfg.placesPerUnitat) : Infinity;
      return Math.min(capTanda, cfg.maxPerComanda || Infinity);
    }
    // Extres de la vista d'una tanda: `vencuda` (oberta, però la data límit ja ha passat: surt igualment i ja no admet
    // comandes), `tancada` (ja no admet comandes: completa, vencuda o més avançada) i `tancadaPer` ('plena' si té tots
    // els lots; 'data-limit' si ha sortit o ha de sortir sense omplir-se; null si encara és oberta).
    const vistaTanda = (t) => {
      const o = ocupacioDe(estat, t);
      const tancada = !admetComandes(t);
      return Object.assign(copia(t), { ocupacio: o, vencuda: vencuda(t), tancada, tancadaPer: tancada ? (o.plena ? 'plena' : 'data-limit') : null });
    };

    // Qui vulgui fer alguna cosa en el moment exacte en què una comanda s'entrega (p. ex. demanar l'opinió) s'hi apunta amb
    // `alEntregar(fn)`; `fn(comanda)` s'executa un cop per comanda, un cop acabat el canvi. Si no hi ha ningú apuntat, res.
    const ambEntrega = new Set();
    // Es pot donar per entregada (per la tanda) si ja ho és, o si cap mòdul la té entre mans (paquet o ruta: `viaDe`)
    const potDonarPerEntregada = (c) => !!c.entregada || (viaDe(c) !== 'paquet' && viaDe(c) !== 'ruta');
    function avisaEntregades(ids) {
      for (const id of ids || []) {
        const c = estat.comandes.find((x) => x.id === id);
        if (!c) continue;
        for (const fn of Array.from(ambEntrega)) {
          try {
            fn(vistaComanda(c));
          } catch (e) {
            /* un oient que falla no ha d'aturar els altres */
          }
        }
      }
    }

    /* ---------- API pública ---------- */

    const m = {
      clau,
      versio: VERSIO,
      dades,

      // Configuració
      config: () => copia(estat.config),
      placesPerTanda: () => estat.config.placesPerTanda,
      maxLotsPerComanda: (producte) => {
        const max = maxPerProducte(producte || 'lot');
        return Number.isFinite(max) ? max : null;
      },
      subscripcioActiva: () => !!estat.config.subscripcio,
      presentacio: () => !!estat.config.presentacio,
      estatEmmagatzematge: () => ({ persistent, motiu: motiuNoPersistent }),

      // `?presentacio` l'activa i la deixa desada; `?presentacio=0` la treu. Sense el paràmetre, no toca res.
      aplicaURL(search) {
        const p = new URLSearchParams(search || '');
        if (!p.has('presentacio')) return !!estat.config.presentacio;
        const v = p.get('presentacio');
        const activa = !(v === '0' || v === 'false');
        if (!!estat.config.presentacio === activa) return activa;
        muta('presentacio', () => {
          estat.config.presentacio = activa;
          return { ok: true };
        });
        return activa;
      },

      // Places de les tandes noves i de les que encara no han sortit; no es pot baixar per sota del que ja hi ha.
      setPlacesPerTanda(n) {
        if (!Number.isInteger(n) || n < 1 || n > MAX_PLACES) return err('places_invalides', { places: n });
        carrega();
        const obertesOCompletes = () => estat.tandes.filter((t) => t.estat === 'oberta' || t.estat === 'completa');
        const massaPlenes = obertesOCompletes().filter((t) => lotsDe(estat, t.id) > n).map((t) => t.id);
        if (massaPlenes.length) return err('places_per_sota_ocupacio', { tandes: massaPlenes });
        return muta('places', () => {
          estat.config.placesPerTanda = n;
          for (const t of obertesOCompletes()) t.places = n;
          normalitza(estat);
          return { ok: true, places: n };
        });
      },

      // Tandes
      tandes: () => estat.tandes.slice().sort((a, b) => a.numero - b.numero).map(vistaTanda),
      tanda: (id) => {
        const t = tandaDe(estat, id);
        return t ? vistaTanda(t) : null;
      },
      // La que admet comandes ara (la primera oberta que no ha passat la data límit).
      tandaActual: () => {
        const t = obertes(estat)[0];
        return t ? vistaTanda(t) : null;
      },
      // La tanda immediatament anterior a l'actual (per ensenyar que «ja és tancada»: mira `tancada` i `tancadaPer`),
      // o null si no n'hi ha.
      tandaAnterior: () => {
        const actual = obertes(estat)[0];
        if (!actual) return null;
        const abans = estat.tandes.filter((t) => t.numero < actual.numero).sort((a, b) => b.numero - a.numero)[0];
        return abans ? vistaTanda(abans) : null;
      },
      ocupacio: (id) => {
        const t = tandaDe(estat, id);
        return t ? ocupacioDe(estat, t) : null;
      },
      comandesDeTanda: (id) => estat.comandes.filter((c) => c.tandaId === id).map(vistaComanda),

      // Les dues llistes del panell per a una tanda, ordenades per codi postal: les que reparteix ell mateix
      // (`repartimentPropi`) i les que porta el transportista (`transportista`), amb el recompte de lots de cada una.
      // Només hi ha les que surten (el filtre únic, `surtenT`); les retingudes i les retornades van a part (`noSurten`,
      // amb el motiu).
      llistesEntrega(id) {
        const t = tandaDe(estat, id);
        const perCp = (a, b) => (a.client.cp < b.client.cp ? -1 : a.client.cp > b.client.cp ? 1 : a.id < b.id ? -1 : 1);
        const ordenades = (t ? surtenT(estat, t) : []).slice().sort(perCp).map(vistaComanda);
        const llista = (tipus) => {
          const comandes = ordenades.filter((c) => c.lliurament === tipus);
          return { comandes, lots: comandes.reduce((s, c) => s + c.places, 0) };
        };
        const noSurten = (t ? noSurtenT(estat, t) : []).slice().sort(perCp).map((c) => Object.assign(vistaComanda(c), { motiuNoSurt: motiuNoSurt(c) }));
        return { repartimentPropi: llista('repartiment-propi'), transportista: llista('transportista'), recull: llista('recull'), noSurten };
      },
      // EL FILTRE: les comandes que surten amb la tanda (ni retingudes ni retornades), i les que no, amb el motiu
      comandesQueSurten(id) {
        const t = tandaDe(estat, id);
        return t ? surtenT(estat, t).map(vistaComanda) : [];
      },
      comandesQueNoSurten(id) {
        const t = tandaDe(estat, id);
        return t ? noSurtenT(estat, t).map((c) => Object.assign(vistaComanda(c), { motiuNoSurt: motiuNoSurt(c) })) : [];
      },
      // Lots que surten amb la tanda (el que es demana a l'escorxador i el que s'apunta en kg)
      lotsQueSurten(id) {
        const t = tandaDe(estat, id);
        return t ? lotsSurten(estat, t) : 0;
      },
      // Quants correus enviarà de veritat el canvi d'estat (la mateixa funció que els envia): els de la tanda i, en
      // entregar, els de l'opinió de les que s'entreguen ara
      correusDeCanvi(id, nou) {
        const t = tandaDe(estat, id);
        if (!t) return 0;
        const ara = nou === 'entregada' ? comandesT(estat, t).filter((c) => surtAmbTanda(c) && !c.entregada) : [];
        const araIds = new Set(ara.map((c) => c.id));
        let n = comandesT(estat, t).filter((c) => rebCorreuEstat(estat, t, nou, c, araIds)).length;
        if (nou === 'entregada' && actiuRec('opinions')) {
          n += ara.filter((c) => c.client.email && c.lliurament !== 'recull' && !retornada(c) && !estat.correus.some((x) => x.comandaId === c.id && x.plantilla === 'opinio-demanada')).length;
        }
        return n;
      },

      // L'estat a què es pot passar ara (el pas següent del recorregut), o [] si abans cal fer un pas d'un mòdul.
      estatsPossibles(id) {
        const t = tandaDe(estat, id);
        if (!t) return [];
        const p = pasDe(estat, t);
        return p && p.estat && potPassar(estat, t, p.estat).ok ? [p.estat] : [];
      },

      /* ----- El recorregut (taula a dalt): el que cal fer ara i el que es pot fer ----- */

      // El panell hi connecta els mòduls: `fn(id)` diu si un mòdul és encès (els seus passos compten).
      connectaModuls(fn) {
        modulConnectat = typeof fn === 'function' ? fn : () => false;
      },
      recorregut: () => ({ tanda: RECORREGUT_TANDA.map((p) => ({ id: p.id, estat: p.estat || null, modul: p.modul || null })), lliurament: copia(Object.keys(LLIURAMENT).reduce((o, k) => Object.assign(o, { [k]: { modul: LLIURAMENT[k].modul, seguent: LLIURAMENT[k].seguent, tanda: LLIURAMENT[k].tanda } }), {})), cobrament: copia(COBRAMENT), ordre: ORDRE_PASSOS.slice() }),
      ordrePas: (id) => ORDRE_PASSOS.indexOf(id),
      // El pas que toca ara a la tanda: { id, estat?, modul? } o null (ja és entregada)
      pasTanda(id) {
        const t = tandaDe(estat, id);
        const p = t ? pasDe(estat, t) : null;
        return p ? { id: p.id, estat: p.estat || null, modul: p.modul || null } : null;
      },
      potPassar(id, nou) {
        const t = tandaDe(estat, id);
        return t ? potPassar(estat, t, nou) : err('tanda_inexistent');
      },
      // Lliurament d'una comanda: { via: 'paquet'|'ruta'|'tanda'|'a-part', estat, seguents }
      lliurament(comandaId) {
        const c = estat.comandes.find((x) => x.id === comandaId);
        return c ? lliuramentDe(estat, c) : null;
      },
      potFacturar(comandaId) {
        const c = estat.comandes.find((x) => x.id === comandaId);
        return c ? potFacturar(estat, c) : err('comanda_inexistent');
      },
      // Mou una comanda d'una tanda que encara no ha començat a preparar-se (ni ha demanat la carn)
      potMoure(comandaId) {
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        const t = tandaDe(estat, c.tandaId);
        if (!t) return err('sense_tanda');
        // Una retornada ja no és de cap tanda: no es mou enlloc
        if (viaDe(c) === 'fora') return err('retornada');
        // La que no surt fins que pagui (retinguda) es pot moure a la tanda següent en qualsevol moment
        if (viaDe(c) === 'retinguda') return { ok: true };
        if (t.estat !== 'oberta' && t.estat !== 'completa') return err('tanda_origen_tancada');
        if (actiuRec('escorxador') && carnDemanadaDe(estat, t)) return err('carn_demanada');
        return { ok: true };
      },
      // Si el pas `pas` del recorregut es pot fer ara. ref: { tandaId?, comandaId? }. El fan servir els botons i les tasques.
      potFer(pas, ref) {
        const r = ref || {};
        const t = tandaDe(estat, r.tandaId || ((estat.comandes.find((x) => x.id === r.comandaId) || {}).tandaId));
        const c = r.comandaId ? estat.comandes.find((x) => x.id === r.comandaId) : null;
        const no = (motiu) => err(motiu || 'no_toca', { pas });
        if (pas === 'cobrament') return c && (COBRAMENT[c.pagament] || []).includes('pagat') ? { ok: true } : no();
        if (pas === 'factura') {
          if (c) return potFacturar(estat, c);
          return t && comandesT(estat, t).some((x) => potFacturar(estat, x).ok) ? { ok: true } : no();
        }
        if (pas === 'lliurament') {
          if (c) return lliuramentDe(estat, c).seguents.length ? { ok: true } : no();
          return t && comandesT(estat, t).some((x) => lliuramentDe(estat, x).seguents.length) ? { ok: true } : no();
        }
        if (!t) return no('tanda_inexistent');
        if (pas === 'etiquetes') return actiuRec('enviaments') && t.estat === 'preparacio' && senseEtiqueta(estat, t).length ? { ok: true } : no();
        if (pas === 'kg-reals') return actiuRec('escorxador') && t.estat === 'completa' && carnDemanadaDe(estat, t) ? { ok: true } : no();
        const p = pasDe(estat, t);
        if (pas === 'carn-demanada') return p && p.id === 'carn-demanada' ? { ok: true } : no();
        const st = RECORREGUT_TANDA.find((x) => x.id === pas);
        if (st && st.estat) return potPassar(estat, t, st.estat);
        return no('pas_desconegut');
      },
      // Coses a mig fer d'un mòdul (si n'hi ha, no es pot apagar): ids de comandes o de tandes
      pendentsDeModul: (id) => (PENDENTS_MODUL[id] && actiuRec(id) ? PENDENTS_MODUL[id](estat) : []),
      // Si la comanda no surt fins que pagui (cobrament fallit o sense pagar; decisió d'en Lluc, 05/11/2026)
      retinguda(comandaId) {
        const c = estat.comandes.find((x) => x.id === comandaId);
        return !!c && viaDe(c) === 'retinguda';
      },
      // Les comandes de la tanda que encara necessiten etiqueta (les que surten amb el transportista)
      senseEtiqueta: (tandaId) => {
        const t = tandaDe(estat, tandaId);
        return t ? senseEtiqueta(estat, t).map((c) => c.id) : [];
      },

      // Paquet (Enviaments): un pas del recorregut del paquet. 'preparat' fa l'etiqueta (número de seguiment de mostra);
      // 'entregat' entrega la comanda. Refusa el que no toca (paquet que no s'ha recollit, tanda que encara no ha sortit…).
      mouPaquet(comandaId, nou) {
        carrega();
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        const l = lliuramentDe(estat, c);
        if (l.via !== 'paquet') return err('sense_paquet');
        if (!l.seguents.includes(nou)) return err('pas_no_permes', { estat: l.estat, nou });
        const r = muta('paquet', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const env = (estat.dadesModuls.enviaments = estat.dadesModuls.enviaments || {});
          env.paquets = env.paquets || {};
          if (nou === 'preparat') {
            env.comptador = (env.comptador || 0) + 1;
            env.paquets[cc.id] = { seguiment: 'SEG-' + String(900000 + env.comptador * 37), historial: [] };
          }
          env.paquets[cc.id].historial.push({ estat: nou, data: iso(0) });
          const entregades = nou === 'entregat' ? entrega(estat, cc, 'transportista') : [];
          return { ok: true, estat: nou, seguiment: env.paquets[cc.id].seguiment, entregades };
        });
        if (r.ok) avisaEntregades(r.entregades);
        return r;
      },
      // Les etiquetes d'una tanda: un paquet per cada comanda amb transportista que encara no en té
      fesEtiquetes(tandaId) {
        carrega();
        const t = tandaDe(estat, tandaId);
        if (!t) return err('tanda_inexistent');
        if (!m.potFer('etiquetes', { tandaId }).ok) return err('no_toca', { pas: 'etiquetes' });
        return muta('etiquetes', () => {
          const env = (estat.dadesModuls.enviaments = estat.dadesModuls.enviaments || {});
          env.paquets = env.paquets || {};
          env.etiquetes = env.etiquetes || {};
          const fets = [];
          for (const c of senseEtiqueta(estat, tandaDe(estat, tandaId))) {
            env.comptador = (env.comptador || 0) + 1;
            env.paquets[c.id] = { seguiment: 'SEG-' + String(900000 + env.comptador * 37), historial: [{ estat: 'preparat', data: iso(0) }] };
            fets.push(c.id);
          }
          env.etiquetes[tandaId] = iso(0);
          return { ok: true, n: fets.length, comandes: fets };
        });
      },

      canviaEstatTanda(id, nou) {
        if (!dades.estatsTanda.includes(nou)) return err('estat_invalid');
        carrega();
        const t = tandaDe(estat, id);
        if (!t) return err('tanda_inexistent');
        // El recorregut: només el pas que toca ara (cap salt, cap pas d'un mòdul a mig fer, cap entrega pendent)
        const pot = potPassar(estat, t, nou);
        if (!pot.ok) return pot;
        const r = muta('estat-tanda', () => {
          const tt = tandaDe(estat, id);
          const abans = tt.estat;
          if (nou === 'completa') tt.tancadaManual = true;
          // Una tanda entregada vol dir que totes les seves comandes ho són (les que cap mòdul entrega, ara)
          const entregades = [];
          if (nou === 'entregada') {
            const quan = iso(0);
            for (const c of estat.comandes.filter((x) => x.tandaId === tt.id && !x.entregada && surtAmbTanda(x))) {
              c.entregada = quan;
              c.historial.push({ data: quan, tipus: 'entregada' });
              entregades.push(c.id);
            }
          }
          const generats = posaEstat(estat, tt, nou, false, entregades);
          // El canvi el fa el pastor: ja el coneix, per això surt com a vist
          afegeixEsdeveniment(estat, { tipus: 'tanda-estat', origen: 'panell', tandaId: tt.id, dades: { numero: tt.numero, de: abans, a: nou, correus: generats.length }, vist: true });
          const mes = normalitza(estat, 'panell');
          return { ok: true, tanda: vistaTanda(tt), correus: generats.concat(mes), entregades };
        });
        if (r.ok) avisaEntregades(r.entregades);
        return r;
      },

      // Obre una tanda extra (el pastor). `dataLimit` ('AAAA-MM-DD') és opcional: per defecte, la darrera + el període.
      obrirTanda(o) {
        const x = o || {};
        if (x.dataLimit !== undefined && x.dataLimit !== null && !dataValida(x.dataLimit)) return err('data_invalida');
        if (x.places !== undefined && (!Number.isInteger(x.places) || x.places < 1 || x.places > MAX_PLACES)) return err('places_invalides');
        return muta('tanda-nova', () => {
          const t = obreTanda(estat, { dataLimit: x.dataLimit || undefined, places: x.places });
          const correus = normalitza(estat);
          return { ok: true, tanda: vistaTanda(tandaDe(estat, t.id)), correus };
        });
      },

      // Canvia data i/o places (i nom) d'una tanda. Les places no poden quedar per sota dels lots que ja té.
      canviaTanda(id, canvis) {
        const c = canvis || {};
        carrega();
        const t = tandaDe(estat, id);
        if (!t) return err('tanda_inexistent');
        if (c.dataLimit !== undefined) {
          if (t.estat === 'entregada') return err('tanda_tancada');
          if (!dataValida(c.dataLimit)) return err('data_invalida');
        }
        if (c.places !== undefined) {
          if (t.estat !== 'oberta' && t.estat !== 'completa') return err('tanda_tancada');
          if (!Number.isInteger(c.places) || c.places < 1 || c.places > MAX_PLACES) return err('places_invalides');
          if (c.places < lotsDe(estat, t.id)) return err('places_per_sota_ocupacio', { tandes: [t.id] });
        }
        return muta('tanda', () => {
          const tt = tandaDe(estat, id);
          if (c.dataLimit !== undefined) tt.dataLimit = c.dataLimit;
          if (c.places !== undefined) tt.places = c.places;
          if (typeof c.nom === 'string' && c.nom.trim()) tt.nom = c.nom.trim();
          const correus = normalitza(estat);
          return { ok: true, tanda: vistaTanda(tt), correus };
        });
      },

      // Comandes
      comandes(filtre) {
        const f = filtre || {};
        const cerca = f.cerca ? String(f.cerca).trim().toLowerCase() : '';
        const cercaTel = cerca.replace(/\D/g, '');
        return estat.comandes
          .filter((c) => {
            if (f.tandaId && c.tandaId !== f.tandaId) return false;
            if (f.producte && c.producte !== f.producte) return false;
            if (f.lliurament && c.lliurament !== f.lliurament) return false;
            if (f.estat && estatDe(c) !== f.estat) return false;
            if (f.nova !== undefined && !!c.nova !== !!f.nova) return false;
            if (cerca) {
              const text = [c.id, c.client.nom, c.client.cognoms, c.client.email].join(' ').toLowerCase();
              const tel = c.client.telefon.replace(/\D/g, '');
              if (!text.includes(cerca) && !(cercaTel && tel.includes(cercaTel))) return false;
            }
            return true;
          })
          .sort((a, b) => (a.creada < b.creada ? 1 : a.creada > b.creada ? -1 : 0))
          .map(vistaComanda);
      },
      comanda(id) {
        const c = estat.comandes.find((x) => x.id === id);
        return c ? vistaComanda(c) : null;
      },
      nous: () => estat.comandes.filter((c) => c.nova).length,

      validaClient,

      // Abans de pagar: a quina tanda aniria la comanda i per què. No toca res.
      // motiu: 'hi-cap' | 'no-hi-cap-a-la-primera' | 'tanda-nova'.
      // Per a un producte que no ocupa places (canals, per defecte): { ok:true, tandaId:null, motiu:'entrega-per-acordar' }.
      // Les properes entregues d'una subscripció, de les tandes reals (cap data fixa): la primera és la tanda on aniria
      // la comanda ara i les altres, cada `freqSetmanes / periodeSetmanes` tandes. Si una tanda encara no existeix, la
      // seva data és la de l'última coneguda més un període per tanda. Torna { ok, entregues: [{ numero, dataLimit, existent }] }.
      properesEntregues(freqSetmanes, lots, quantes) {
        carrega();
        const q = validaQuantitat('lot', Number(lots === undefined ? 1 : lots));
        if (!q.ok) return q;
        const w = copia(estat);
        const a = assigna(w, q.places);
        if (!a.ok) return a;
        const pas = tandesEntreEntregues(Number(freqSetmanes));
        const ultima = w.tandes.reduce((mx, t) => (t.numero > mx.numero ? t : mx), w.tandes[0]);
        const entregues = [];
        for (let i = 0; i < (quantes || 3); i++) {
          const numero = a.tandaNumero + i * pas;
          const t = w.tandes.find((x) => x.numero === numero);
          entregues.push({ numero, dataLimit: t ? t.dataLimit : afegeixDies(ultima.dataLimit, (numero - ultima.numero) * dades.tandes.periodeSetmanes * 7), existent: !!t });
        }
        return { ok: true, entregues };
      },

      previsioAssignacio(lots, producte) {
        carrega();
        const q = validaQuantitat(producte || 'lot', Number(lots));
        if (!q.ok) return q;
        if (!q.ocupa) return { ok: true, producte: q.producte, lots: q.lots, places: 0, tandaId: null, tandaNumero: null, dataLimit: null, tandaNova: false, motiu: 'entrega-per-acordar', primera: null, faltenPlaces: 0 };
        const a = assigna(copia(estat), q.places);
        return a.ok ? Object.assign(a, { producte: q.producte, lots: q.lots, places: q.places }) : a;
      },

      // Pagament simulat: només amb `presentacio`. entrada: { lots (unitats), producte? ('lot' per defecte), client,
      // subscripcio? (només per al lot) }. Si el producte no ocupa places, la comanda no entra a cap tanda.
      crearComanda(entrada) {
        const x = entrada || {};
        const lots = Number(x.lots);
        carrega();
        if (!estat.config.presentacio) return err('sense_presentacio');
        // D'on ve la comanda: el full de compra de la web (per defecte) o, per a un mòdul, una altra via
        const origen = x.origen === undefined ? 'web' : x.origen;
        if (!dades.esdeveniments.origens.includes(origen)) return err('origen_invalid', { origen });
        // Per telèfon (mòdul «comandes per telèfon»): menys dades (el correu és opcional; sense adreça si la recull) i el
        // cobrament queda «pendent» fins que es cobra
        const telefon = origen === 'telefon';
        const recull = telefon && !!x.recull;
        // Recollida a Sort (rodalies): sense adreça ni notes d'entrega
        const recollidaSort = !telefon && !!x.enviament && x.enviament.mode === 'recollida' && dades.zonaDeCP(x.client && x.client.cp) === 'rodalies';
        const v = telefon ? validaClientTelefon(x.client, recull) : validaClient(x.client, { sensAdreca: recollidaSort });
        const q = validaQuantitat(x.producte || 'lot', lots);
        if (!q.ok) return q;
        // Forma de pagament (simulada): només les de `dades.pagament.metodes` (targeta, apple-pay, google-pay); per telèfon,
        // les de `metodesTelefon` (pendent, efectiu, enllaç).
        const permesos = telefon ? dades.pagament.metodesTelefon : dades.pagament.metodes;
        const metodePagament = x.metodePagament === undefined ? permesos[0] : x.metodePagament;
        if (!permesos.includes(metodePagament)) return err('metode_pagament_invalid', { metodePagament });
        if (!v.ok) return err('client_invalid', { errors: v.errors });
        // L'enviament ha de ser definitiu abans de cobrar: fora de Catalunya no s'envia, i a les rodalies cal haver triat
        // «recullo a Sort» o «a casa» (i el poble, si el codi postal és de diversos)
        const cost = q.ocupa ? costDeComanda(v.client, lots, x.enviament, recull, telefon) : null;
        if (cost && !cost.complet) {
          if (cost.valid && !cost.enviable) return err('no_enviem', { cp: cost.cp });
          return err('enviament_incomplet', { cal: cost.cal });
        }
        // Les canals segueixen les mateixes zones que el lot: fora de Catalunya no s'hi envia
        if (!q.ocupa) {
          const zona = dades.costEnviament(v.client.cp);
          if (zona.valid && !zona.enviable) return err('no_enviem', { cp: zona.cp });
        }
        // L'efectiu es cobra en entregar, en mà: amb la caixa no hi ha ningú per cobrar-lo
        if (metodePagament === 'efectiu' && q.ocupa && cost.lliurament === 'transportista') return err('efectiu_nomes_en_ma');
        let sub = null;
        if (x.subscripcio) {
          if (q.producte !== 'lot') return err('subscripcio_nomes_lots');
          if (!estat.config.subscripcio) return err('subscripcio_inactiva');
          const s = x.subscripcio;
          const freq = s.frequenciaSetmanes === undefined ? dades.subscripcio.frequenciaPerDefecte : s.frequenciaSetmanes;
          if (!dades.subscripcio.frequenciesSetmanes.includes(freq)) return err('subscripcio_invalida', { camp: 'frequenciaSetmanes' });
          // Sense permanència: només la freqüència i els lots de cada entrega (cap mínim de lots ni de tandes)
          sub = { frequenciaSetmanes: freq, lotsPerEntrega: lots };
        }
        // P45: els avisos de tanda nova van per defecte (art. 21.2 LSSI) tret que el comprador els refusi. Per telèfon no
        // se li ha ofert la casella: no s'hi avisa fins que ho digui.
        const avisosTanda = telefon ? x.avisosTanda === true : x.avisosTanda !== false;
        return muta('comanda-nova', () => {
          // Es treballa sobre una còpia i només es manté si tot ha anat bé: una assignació que falla
          // (p. ex. subscriptors que ocupen cada tanda nova) no pot deixar tandes obertes a mig fer.
          const w = copia(estat);
          let a = { ok: true, producte: q.producte, lots, places: 0, tandaId: null, tandaNumero: null, dataLimit: null, tandaNova: false, motiu: 'entrega-per-acordar', primera: null, faltenPlaces: 0 };
          let t = null;
          if (q.ocupa) {
            a = assigna(w, q.places);
            if (!a.ok) return a;
            Object.assign(a, { producte: q.producte, lots, places: q.places });
            t = tandaDe(w, a.tandaId);
            if (sub) sub.primeraTandaNumero = t.numero;
          }
          // Si no hi cabia a la primera tanda oberta, la tanda on ha anat a parar la deixa apuntada (es veu a la tanda)
          const desviada = q.ocupa && a.primera && a.tandaId !== a.primera.tandaId ? { tandaId: a.primera.tandaId, numero: a.primera.numero, lliures: a.primera.placesLliures } : null;
          const c = afegeixComanda(w, { client: v.client, producte: q.producte, lots, tandaId: t ? t.id : null, subscripcio: sub, nova: true, metodePagament, origen, recull, desviada, enviament: x.enviament, avisosTanda, pagament: telefon ? 'pendent' : 'pagat' });
          // Per telèfon no es manen els correus de la web: ho ha parlat per telèfon. El correu de l'enllaç de pagament és del mòdul de pagaments.
          const ids = telefon ? [] : [afegeixCorreu(w, 'comanda-pastor', c, t, { motiu: 'comanda-nova' }).id, afegeixCorreu(w, 'comanda-confirmacio', c, t, { motiu: 'comanda-nova' }).id];
          const dadesEv = dadesComandaNova(w, c);
          if (x.simulat) dadesEv.simulat = true;
          afegeixEsdeveniment(w, { tipus: 'comanda-nova', origen, comandaId: c.id, tandaId: t ? t.id : undefined, dades: dadesEv });
          const mes = normalitza(w, origen);
          estat = w;
          return { ok: true, comanda: vistaComanda(c), assignacio: a, correus: ids.concat(mes) };
        });
      },

      movaComanda(comandaId, tandaId) {
        carrega();
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        const desti = tandaDe(estat, tandaId);
        if (!desti) return err('tanda_inexistent');
        const origen = tandaDe(estat, c.tandaId);
        if (!origen) return err('sense_tanda'); // entrega per acordar: no és a cap tanda
        if (origen.id === desti.id) return err('mateixa_tanda');
        const pot = m.potMoure(comandaId);
        if (!pot.ok) return pot;
        if (!admetComandes(desti)) return err('tanda_desti_no_oberta');
        if (lliures(estat, desti) < c.places) return err('no_hi_caben', { placesLliures: lliures(estat, desti), lots: c.places });
        return muta('comanda-moguda', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const d = tandaDe(estat, tandaId);
          const o = tandaDe(estat, cc.tandaId);
          const eraRetinguda = viaDe(cc) === 'retinguda';
          cc.tandaId = d.id;
          delete cc.via;
          if (cc.subscripcio) cc.subscripcio.primeraTandaNumero = d.numero;
          cc.historial.push({ data: iso(0), tipus: 'moguda', de: o.id, a: d.id });
          // La que no ha sortit per no haver pagat: li diem a quina tanda va (com `mouRetinguda`)
          if (eraRetinguda && cc.client.email) afegeixCorreu(estat, 'comanda-moguda', cc, d, { motiu: 'moguda', dadesExtra: { de: o.numero, pagada: false } });
          const correus = normalitza(estat);
          return { ok: true, comanda: vistaComanda(cc), correus };
        });
      },

      // Una comanda retinguda (no surt fins que pagui) va a la tanda següent que l'admeti
      mouRetinguda(comandaId) {
        carrega();
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        if (viaDe(c) !== 'retinguda' || !c.tandaId) return err('no_retinguda');
        return muta('comanda-moguda', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const o = tandaDe(estat, cc.tandaId);
          // Una altra tanda oberta amb lloc, o una de nova (mai la mateixa)
          const d = obertes(estat).find((t) => t.id !== cc.tandaId && lliures(estat, t) >= cc.places) || obreTanda(estat);
          cc.tandaId = d.id;
          delete cc.via;
          cc.historial.push({ data: iso(0), tipus: 'moguda', de: o ? o.id : null, a: d.id });
          // Li diem que no ha sortit amb la seva tanda i a quina va (sense prometre res: encara no ha pagat)
          if (cc.client.email) afegeixCorreu(estat, 'comanda-moguda', cc, d, { motiu: 'moguda', dadesExtra: { de: o ? o.numero : null, pagada: false } });
          normalitza(estat);
          return { ok: true, comanda: vistaComanda(cc), de: o ? o.numero : null, a: d.numero };
        });
      },

      // Cobrament d'una comanda: 'pagat', 'pendent', 'fallit' o 'retornat'. El mòdul de pagaments és qui ho fa servir.
      setPagament(comandaId, nou) {
        if (!['pagat', 'pendent', 'fallit', 'retornat'].includes(nou)) return err('pagament_invalid', { pagament: nou });
        carrega();
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        if (c.pagament === nou) return err('mateix_pagament');
        if (!(COBRAMENT[c.pagament] || []).includes(nou)) return err('cobrament_no_permes', { de: c.pagament, a: nou });
        return muta('pagament', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const eraRetinguda = viaDe(cc) === 'retinguda';
          cc.pagament = nou;
          cc.historial.push({ data: iso(0), tipus: 'pagament', estat: nou });
          // Ja no surt (retornada o retinguda) i la tanda encara es prepara: l'etiqueta que ja tenia no val
          const t = tandaDe(estat, cc.tandaId);
          const env = estat.dadesModuls.enviaments;
          if (!surtAmbTanda(cc) && t && t.estat === 'preparacio' && env && env.paquets && estatPaquet(env.paquets[cc.id]) === 'preparat') delete env.paquets[cc.id];
          // Paga quan la seva tanda ja ha sortit sense ella, o quan la carn ja s'ha demanat sense comptar-la: va a la tanda
          // següent que l'admeti (la carn i els kg de la seva tanda ja no hi compten)
          const tardana = t && (cc.via === 'retinguda' || (actiuRec('escorxador') && (carnDemanadaDe(estat, t) || ordreEstat(t.estat) >= ordreEstat('preparacio')) && !comptadaALaCarn(estat, t, cc)));
          const moguda = eraRetinguda && nou === 'pagat' && tardana ? mouASeguent(estat, cc) : null;
          return { ok: true, comanda: vistaComanda(cc), moguda };
        });
      },

      // Una parada de la ruta (o una comanda a part) ha arribat al comprador. Una sola vegada per comanda. El paquet
      // s'entrega amb `mouPaquet(id, 'entregat')` i la resta, amb la tanda («Entregada»): aquí es refusen.
      marcaEntregada(comandaId) {
        carrega();
        const c = estat.comandes.find((x) => x.id === comandaId);
        if (!c) return err('comanda_inexistent');
        if (c.entregada) return { ok: true, jaEntregada: true, comanda: vistaComanda(c) };
        const via = viaDe(c);
        if (via === 'paquet') return err('entrega_per_paquet');
        if (via === 'tanda') return err('entrega_per_tanda');
        if (via === 'retinguda') return err('no_ha_pagat');
        if (via === 'fora') return err('pagament_retornat');
        if (via === 'ruta' && !lliuramentDe(estat, c).seguents.includes('entregada')) return err('tanda_no_enviada');
        const r = muta('entregada', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const entregades = entrega(estat, cc, 'panell');
          return { ok: true, jaEntregada: false, comanda: vistaComanda(cc), entregades };
        });
        if (r.ok) avisaEntregades(r.entregades);
        return r;
      },
      alEntregar(fn) {
        ambEntrega.add(fn);
        return () => ambEntrega.delete(fn);
      },
      // `true` si cap mòdul té la comanda pendent d'entregar (o ja és entregada)
      potDonarPerEntregada(comandaId) {
        const c = estat.comandes.find((x) => x.id === comandaId);
        return !!c && potDonarPerEntregada(c);
      },
      // Ids de les comandes de la tanda que un mòdul encara ha d'entregar (buit = la tanda es pot passar a «Entregada»)
      entregaPendentDeModul: (tandaId) => entregaPendent(estat, tandaId),
      clauClient,

      marcaVista(id) {
        carrega();
        if (!estat.comandes.some((c) => c.id === id)) return err('comanda_inexistent');
        return muta('vista', () => {
          estat.comandes.find((c) => c.id === id).nova = false;
          // L'esdeveniment de la comanda nova i el distintiu «Nova» són el mateix avís: es treuen alhora
          estat.esdeveniments.filter((ev) => ev.comandaId === id && ev.tipus === 'comanda-nova').forEach((ev) => (ev.vist = true));
          return { ok: true };
        });
      },
      marcaTotesVistes: () =>
        muta('vista', () => {
          estat.comandes.forEach((c) => {
            c.nova = false;
          });
          estat.esdeveniments.filter((ev) => ev.tipus === 'comanda-nova').forEach((ev) => (ev.vist = true));
          return { ok: true };
        }),

      /* ----- Esdeveniments: tot el que passa al negoci entra per aquí (a la versió real, un webhook per origen) ----- */

      // El més nou primer. filtre: { tipus (text o llista), origen, comandaId, tandaId, vist (true/false), limit }.
      esdeveniments(filtre) {
        const f = filtre || {};
        const tipus = f.tipus === undefined ? null : [].concat(f.tipus);
        const llista = estat.esdeveniments
          .filter((ev) => (!tipus || tipus.includes(ev.tipus)) && (!f.origen || ev.origen === f.origen) && (!f.comandaId || ev.comandaId === f.comandaId) && (!f.tandaId || ev.tandaId === f.tandaId) && (f.vist === undefined || !!ev.vist === !!f.vist))
          .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : numeroEsdeveniment(b) - numeroEsdeveniment(a)))
          .map(copia);
        return f.limit ? llista.slice(0, f.limit) : llista;
      },
      nousEsdeveniments: () => estat.esdeveniments.filter((ev) => !ev.vist).length,

      // Apunta un esdeveniment (el fa servir cada mòdul i el simulador). entrada: { tipus, origen, comandaId?, tandaId?,
      // dades?, vist? }. No fa res més: les conseqüències (tasques, avisos) es calculen a partir del registre.
      registraEsdeveniment(entrada) {
        const x = entrada || {};
        if (typeof x.tipus !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(x.tipus)) return err('tipus_invalid');
        if (!dades.esdeveniments.origens.includes(x.origen)) return err('origen_invalid', { origen: x.origen });
        carrega();
        if (x.comandaId && !estat.comandes.some((c) => c.id === x.comandaId)) return err('comanda_inexistent');
        if (x.tandaId && !tandaDe(estat, x.tandaId)) return err('tanda_inexistent');
        return muta('esdeveniment', () => ({ ok: true, esdeveniment: copia(afegeixEsdeveniment(estat, x)) }));
      },

      // Marca com a vist(os). Sense filtre, tots; amb filtre (el de `esdeveniments`) o amb ids, només aquests.
      marcaEsdevenimentsVists(quins) {
        const q = quins || {};
        const ids = Array.isArray(q) ? q : q.ids || null;
        carrega();
        const triats = estat.esdeveniments.filter((ev) => !ev.vist && (!ids || ids.includes(ev.id)) && (Array.isArray(q) || !q.tipus || [].concat(q.tipus).includes(ev.tipus)));
        if (!triats.length) return { ok: true, n: 0 };
        return muta('esdeveniment-vist', () => {
          triats.forEach((t) => (estat.esdeveniments.find((ev) => ev.id === t.id).vist = true));
          return { ok: true, n: triats.length };
        });
      },
      marcaEsdevenimentVist: (id) => m.marcaEsdevenimentsVists([id]),

      /* ----- Mòduls: peces que s'encenen i s'apaguen (el registre amb el seu contingut és a panell/moduls.js) ----- */

      modulActiu: (id) => estat.config.moduls[id] !== false,
      // { id: false } només per als apagats; la resta, encesos
      modulsApagats: () => Object.keys(estat.config.moduls).filter((k) => estat.config.moduls[k] === false),
      setModul(id, actiu) {
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(id)) return err('modul_invalid', { id });
        // Un mòdul amb coses a mig fer (paquets en camí, entregues de la ruta, kg que s'esperen) no s'apaga: si s'apagués,
        // la tanda les donaria per fetes. Quan s'acabin, sí.
        if (!actiu) {
          carrega();
          const pendents = m.pendentsDeModul(id);
          if (pendents.length) return err('modul_amb_pendents', { id, pendents });
        }
        return muta('modul', () => {
          if (actiu) delete estat.config.moduls[id];
          else estat.config.moduls[id] = false;
          return { ok: true, id, actiu: !!actiu };
        });
      },
      // Dades pròpies d'un mòdul (p. ex. els kg reals o la numeració de factures), perquè no calgui tocar el model.
      // `modulActualitza(id, fn)`: `fn` rep una còpia de les dades, la modifica i (opcional) torna {ok:false} per avortar.
      modulDades: (id) => copia((estat.dadesModuls && estat.dadesModuls[id]) || {}),
      modulActualitza(id, fn) {
        if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(id) || typeof fn !== 'function') return err('modul_invalid', { id });
        return muta('modul-dades', () => {
          const dadesMod = copia(estat.dadesModuls[id] || {});
          const r = fn(dadesMod);
          if (r && r.ok === false) return r;
          estat.dadesModuls[id] = dadesMod;
          return { ok: true, dades: copia(dadesMod) };
        });
      },

      // Un correu de plantilla pròpia (d'un mòdul) a una comanda. El text el posa el mòdul; aquí només es desa.
      // entrada: { plantilla, comandaId, tandaId?, destinatari? ('comprador' per defecte | 'pastor'), motiu?, dadesExtra? }
      registraCorreu(entrada) {
        const x = entrada || {};
        if (typeof x.plantilla !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(x.plantilla)) return err('plantilla_invalida');
        carrega();
        const c = estat.comandes.find((o) => o.id === x.comandaId);
        if (!c) return err('comanda_inexistent');
        const t = tandaDe(estat, x.tandaId || c.tandaId);
        return muta('correu', () => ({ ok: true, correu: copia(afegeixCorreu(estat, x.plantilla, c, t, { motiu: x.motiu, destinatari: x.destinatari, dadesExtra: x.dadesExtra })) }));
      },

      // Correus simulats, el més nou primer. filtre: { comandaId, tandaId, destinatari, plantilla }.
      correus(filtre) {
        const f = filtre || {};
        return estat.correus
          .filter((c) => (!f.comandaId || c.comandaId === f.comandaId) && (!f.tandaId || c.tandaId === f.tandaId) && (!f.destinatari || c.destinatari === f.destinatari) && (!f.plantilla || c.plantilla === f.plantilla))
          .map(copia)
          .reverse();
      },

      // Subscripcions (només té sentit si està activa). Preparat per a la vista del panell, que encara no existeix.
      subscripcions() {
        return estat.comandes
          .filter((c) => c.subscripcio)
          .map((c) => ({
            comandaId: c.id,
            client: copia(c.client),
            subscripcio: copia(c.subscripcio),
            lotsServits: c.lots + estat.comandes.filter((r) => r.origenSubscripcio === c.id).reduce((s, r) => s + r.lots, 0),
          }));
      },

      // Torna a la llavor. No toca `presentacio` (és del dispositiu, no de les dades).
      restablir: () =>
        muta('restablir', () => {
          const presentacio = estat ? estat.config.presentacio : false;
          estat = llavor();
          estat.config.presentacio = presentacio;
          return { ok: true };
        }),

      // Avisa de tot canvi, propi (origen 'local') o d'una altra pestanya (origen 'extern'). Retorna com desubscriure's.
      subscriu(fn) {
        oients.add(fn);
        return () => oients.delete(fn);
      },

      // Torna a llegir l'emmagatzematge (normalment no cal: els canvis d'altres pestanyes arriben sols).
      refresca() {
        carrega();
        if (!obertes(estat).length) {
          muta('normalitza', () => {
            normalitza(estat);
            return { ok: true };
          });
        }
        notifica({ origen: 'refresca', tipus: 'refresca' });
      },

      // NOMÉS per a proves i per quan en Lluc confirmi la subscripció. La UI no l'ha de cridar mai: aquí no hi
      // ha cap interruptor visible (PLA.md, decisió de la subscripció).
      dev: {
        setSubscripcio: (valor) =>
          muta('dev-subscripcio', () => {
            estat.config.subscripcio = !!valor;
            return { ok: true, subscripcio: !!valor };
          }),
      },
    };

    // Arrencada. Si mentrestant ha passat la data límit de l'única tanda oberta, se'n obre una de nova.
    carrega();
    if (!obertes(estat).length) {
      muta('normalitza', () => {
        normalitza(estat);
        return { ok: true };
      });
    }
    const search = op.search !== undefined ? op.search : typeof location !== 'undefined' ? location.search : '';
    if (search) m.aplicaURL(search);
    if (emm && typeof emm.escolta === 'function') {
      emm.escolta((k) => {
        if (k === clau || k === null) {
          carrega();
          notifica({ origen: 'extern', tipus: 'storage' });
        }
      });
    }
    return m;
  }

  return { crearMagatzem, CLAU, VERSIO };
});
