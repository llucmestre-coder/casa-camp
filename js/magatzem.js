/* ECO Cassovall — estat compartit i regles (tandes, comandes, correus, subscripció preparada).
   Sense interfície. Un únic estat a `localStorage['cassovall:v1']`, amb versió; si l'emmagatzematge falla, es
   treballa en memòria. Al navegador (després de dades.js) crea `window.CassovallMagatzem`; a Node,
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

  const CLAU = 'cassovall:v1';
  const VERSIO = 1;
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

    function configPerDefecte() {
      return {
        placesPerTanda: dades.tandes.places,
        subscripcio: !!dades.subscripcio.activaPerDefecte,
        presentacio: false,
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
      const e = { versio: VERSIO, config: configPerDefecte(), tandes: [], comandes: [], correus: [], comptadors: { comanda: 1000, correu: 0 } };
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
          }
        }
      }
      return e;
    }

    /* ---------- Primitives sobre un estat `e` (serveixen per a l'estat real i per a simulacions) ---------- */

    // Ocupació d'una tanda = places que ocupen les seves comandes (1 per lot; els canals, segons dades.productes).
    const lotsDe = (e, tandaId) => e.comandes.reduce((s, c) => (c.tandaId === tandaId ? s + c.places : s), 0);
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
    function afegeixComanda(e, d) {
      e.comptadors.comanda += 1;
      const producte = d.producte || 'lot';
      const cfg = dades.productes[producte];
      const ocupa = !!(cfg && cfg.ocupaPlaces);
      const cost = dades.costEnviament(d.client.cp);
      const c = {
        // «repartiment-propi» (gratis, el porta ell) o «transportista» (de pagament); null si no entra a cap tanda
        lliurament: ocupa && cost.valid ? cost.lliurament : null,
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
        importEnviament: ocupa ? (cost.valid ? cost.import : 0) : null,
        pagament: d.pagament || 'pagat',
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
      const alPastor = plantilla === 'comanda-pastor';
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
          comanda: { id: comanda.id, producte: comanda.producte, lots: comanda.lots, importLots: comanda.importLots, importEnviament: comanda.importEnviament, lliurament: comanda.lliurament, metodePagament: comanda.metodePagament, client: copia(comanda.client) },
          // `null` si la comanda no entra a cap tanda (entrega per acordar)
          tanda: tanda ? { id: tanda.id, numero: tanda.numero, nom: tanda.nom, dataLimit: tanda.dataLimit, places: tanda.places, estat: tanda.estat, ocupats: lotsDe(e, tanda.id) } : null,
        },
      };
      // El correu al pastor porta l'enllaç al panell (a la comanda: `…/panell/#comanda=CC-1013`).
      if (alPastor) m.dades.enllacPanell = dades.enllacPanell(comanda.id);
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

    // Canvi d'estat amb efectes: historial de cada comprador i un correu per comprador (excepte `oberta`).
    function posaEstat(e, t, nou, auto) {
      const anterior = t.estat;
      t.estat = nou;
      const generats = [];
      const quan = iso(0);
      for (const c of e.comandes.filter((x) => x.tandaId === t.id)) {
        c.historial.push({ data: quan, tipus: 'estat-tanda', tandaId: t.id, estat: nou });
        if (nou === 'oberta') continue;
        if (auto && nou === 'completa' && !dades.correus.avisaCompletaAutomatica) continue;
        generats.push(afegeixCorreu(e, 'tanda-' + nou, c, t, { motiu: 'canvi-estat-tanda', estatAnterior: anterior, estatNou: nou }).id);
      }
      return generats;
    }

    // Manté les invariants després de qualsevol canvi: una tanda plena passa a `completa` (i avisa), una
    // `completa` que ha recuperat places torna a `oberta` (en silenci, si no l'ha tancada el pastor ni ha passat
    // la data límit) i sempre n'hi ha una que admet comandes.
    function normalitza(e) {
      const correus = [];
      for (let volta = 0; volta < 12; volta++) {
        let canvi = false;
        for (const t of e.tandes) {
          const plena = lotsDe(e, t.id) >= t.places;
          if (t.estat === 'oberta' && plena) {
            correus.push(...posaEstat(e, t, 'completa', true));
            canvi = true;
          } else if (t.estat === 'completa' && !plena && !t.tancadaManual && t.dataLimit >= avui()) {
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

    function validaClient(c) {
      const x = c || {};
      const s = (v) => String(v === undefined || v === null ? '' : v).trim();
      const errors = {};
      if (!s(x.nom)) errors.nom = 'buit';
      if (!s(x.email)) errors.email = 'buit';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(x.email))) errors.email = 'format';
      const tel = s(x.telefon).replace(/[\s.\-]/g, '').replace(/^(\+34|0034)/, '');
      if (!tel) errors.telefon = 'buit';
      else if (!/^[6-9]\d{8}$/.test(tel)) errors.telefon = 'format';
      if (!s(x.adreca)) errors.adreca = 'buit';
      const cp = dades.validaCP(x.cp);
      if (!cp.valid) errors.cp = cp.motiu;
      if (!s(x.poblacio)) errors.poblacio = 'buit';
      const net = {
        nom: s(x.nom),
        cognoms: s(x.cognoms),
        email: s(x.email),
        telefon: s(x.telefon),
        adreca: s(x.adreca),
        cp: cp.cp,
        poblacio: s(x.poblacio),
        notes: s(x.notes),
      };
      return { ok: Object.keys(errors).length === 0, errors, client: net };
    }

    /* ---------- Persistència ---------- */

    function estatValid(x) {
      return !!x && typeof x === 'object' && x.versio === VERSIO && x.config && typeof x.config === 'object' &&
        Array.isArray(x.tandes) && Array.isArray(x.comandes) && Array.isArray(x.correus) && x.comptadors && typeof x.comptadors === 'object';
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
        try {
          const x = JSON.parse(text);
          if (estatValid(x)) {
            // Estats desats per versions anteriors del codi (no hi ha cap UI publicada que els tingui, però no peten).
            delete x.config.modeTandes;
            for (const t of x.tandes) {
              if (t.dataLimit === undefined) t.dataLimit = t.dataSortida || dataLimitNova(x);
              delete t.dataSortida;
              delete t.dataGuardada;
            }
            for (const c of x.comandes) {
              if (c.producte === undefined) c.producte = 'lot';
              if (c.places === undefined) c.places = c.lots;
              if (c.metodePagament === undefined) c.metodePagament = dades.pagament.metodes[0];
              if (c.lliurament === undefined) {
                const cost = dades.costEnviament(c.client && c.client.cp);
                c.lliurament = c.tandaId && cost.valid ? cost.lliurament : null;
              }
            }
            estat = x;
            return;
          }
        } catch (e) {
          /* JSON trencat: es tracta com a res */
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
      llistesEntrega(id) {
        const ordenades = estat.comandes
          .filter((c) => c.tandaId === id)
          .sort((a, b) => (a.client.cp < b.client.cp ? -1 : a.client.cp > b.client.cp ? 1 : a.id < b.id ? -1 : 1))
          .map(vistaComanda);
        const llista = (tipus) => {
          const comandes = ordenades.filter((c) => c.lliurament === tipus);
          return { comandes, lots: comandes.reduce((s, c) => s + c.places, 0) };
        };
        return { repartimentPropi: llista('repartiment-propi'), transportista: llista('transportista') };
      },

      // Estats a què es pot passar des de l'actual (només endavant).
      estatsPossibles(id) {
        const t = tandaDe(estat, id);
        if (!t) return [];
        const i = dades.estatsTanda.indexOf(t.estat);
        return dades.estatsTanda.slice(i + 1);
      },

      canviaEstatTanda(id, nou) {
        const ordre = dades.estatsTanda;
        if (!ordre.includes(nou)) return err('estat_invalid');
        carrega();
        const t = tandaDe(estat, id);
        if (!t) return err('tanda_inexistent');
        if (nou === t.estat) return err('mateix_estat');
        if (ordre.indexOf(nou) < ordre.indexOf(t.estat)) return err('estat_enrere');
        return muta('estat-tanda', () => {
          const tt = tandaDe(estat, id);
          if (nou === 'completa') tt.tancadaManual = true;
          const generats = posaEstat(estat, tt, nou, false);
          const mes = normalitza(estat);
          return { ok: true, tanda: vistaTanda(tt), correus: generats.concat(mes) };
        });
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
        const v = validaClient(x.client);
        const q = validaQuantitat(x.producte || 'lot', lots);
        if (!q.ok) return q;
        // Forma de pagament (simulada): només les de `dades.pagament.metodes` (targeta, apple-pay, google-pay).
        const metodePagament = x.metodePagament === undefined ? dades.pagament.metodes[0] : x.metodePagament;
        if (!dades.pagament.metodes.includes(metodePagament)) return err('metode_pagament_invalid', { metodePagament });
        if (!v.ok) return err('client_invalid', { errors: v.errors });
        let sub = null;
        if (x.subscripcio) {
          if (q.producte !== 'lot') return err('subscripcio_nomes_lots');
          if (!estat.config.subscripcio) return err('subscripcio_inactiva');
          const s = x.subscripcio;
          if (!dades.subscripcio.frequenciesSetmanes.includes(s.frequenciaSetmanes)) return err('subscripcio_invalida', { camp: 'frequenciaSetmanes' });
          const minim = s.minimLots === undefined ? dades.subscripcio.minimLotsPerDefecte : s.minimLots;
          if (!Number.isInteger(minim) || minim < 0) return err('subscripcio_invalida', { camp: 'minimLots' });
          sub = { frequenciaSetmanes: s.frequenciaSetmanes, lotsPerEntrega: lots, minimLots: minim };
        }
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
          const c = afegeixComanda(w, { client: v.client, producte: q.producte, lots, tandaId: t ? t.id : null, subscripcio: sub, nova: true, metodePagament });
          const ids = [afegeixCorreu(w, 'comanda-pastor', c, t, { motiu: 'comanda-nova' }).id, afegeixCorreu(w, 'comanda-confirmacio', c, t, { motiu: 'comanda-nova' }).id];
          const mes = normalitza(w);
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
        if (origen.estat === 'enviada' || origen.estat === 'entregada') return err('tanda_origen_tancada');
        if (!admetComandes(desti)) return err('tanda_desti_no_oberta');
        if (lliures(estat, desti) < c.places) return err('no_hi_caben', { placesLliures: lliures(estat, desti), lots: c.places });
        return muta('comanda-moguda', () => {
          const cc = estat.comandes.find((x) => x.id === comandaId);
          const d = tandaDe(estat, tandaId);
          const o = tandaDe(estat, cc.tandaId);
          cc.tandaId = d.id;
          if (cc.subscripcio) cc.subscripcio.primeraTandaNumero = d.numero;
          cc.historial.push({ data: iso(0), tipus: 'moguda', de: o.id, a: d.id });
          const correus = normalitza(estat);
          return { ok: true, comanda: vistaComanda(cc), correus };
        });
      },

      marcaVista(id) {
        carrega();
        if (!estat.comandes.some((c) => c.id === id)) return err('comanda_inexistent');
        return muta('vista', () => {
          estat.comandes.find((c) => c.id === id).nova = false;
          return { ok: true };
        });
      },
      marcaTotesVistes: () =>
        muta('vista', () => {
          estat.comandes.forEach((c) => {
            c.nova = false;
          });
          return { ok: true };
        }),

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
