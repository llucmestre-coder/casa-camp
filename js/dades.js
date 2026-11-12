/* Casa Camp — configuració editable en un sol lloc.
   Tot el que pot canviar el pastor (o en Lluc) és aquí: lot, peces, preus, tandes, enviament, correus i la llavor
   d'exemple. Sense build: al navegador crea `window.CassovallDades`; a Node, `module.exports`.
   Les xifres marcades «mostra» són de mostra evident (`000 €`, `00 €`) fins que el pastor en digui de reals. */
(function (arrel, fabrica) {
  const exportat = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = exportat;
  if (arrel) arrel.CassovallDades = exportat;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const ESTATS_TANDA = ['oberta', 'completa', 'preparacio', 'enviada', 'entregada'];

  // Una còpia nova cada vegada: les proves en canvien valors sense embrutar res més.
  function crearDades() {
    const d = {
      estatsTanda: ESTATS_TANDA,

      // Nom i lloc: «Casa Camp» tots dos (en Lluc, 01/11/2026, nit).
      // Tot el que els necessiti (enviament, correus) els llegeix d'aquí.
      negoci: {
        nom: 'Casa Camp',
        lloc: 'Casa Camp',
      },

      // Només hi ha un telèfon (en Lluc, 01/11/2026). Sense fix, sense correu (se n'ha de crear un de nou) ni horari.
      contacte: {
        telefons: ['646 455 128'],
      },

      // Preu (el pastor, 11/11/2026): 99 € + 10 % d'IVA = 108,90 €, IVA inclòs. `preu` és per lot, en euros; si
      // `preuMostra` torna a ser true, la vista ensenya `etiquetaMostra`. El lot es diu «lot de 5 kg» (`kg`): el €/kg es calcula sobre 5 kg i els kg reals només van a la factura (`pesLot()` suma les peces: 5,1 kg).
      lot: {
        kg: 5,
        preu: 108.9,
        preuMostra: false,
        etiquetaMostra: '000 €',
        etiquetaPerKgMostra: '000 €/kg',
      },

      // Peces reals del lot (en Lluc, 01/11/2026): ja no són de mostra. Els dos bistecs (530 + 360 g) són un sol
      // filet (en Lluc, 01/11/2026, nit).
      peces: [
        { id: 'picada', nom: 'Picada', grams: 1000 },
        { id: 'hamburguesa', nom: 'Hamburguesa', grams: 1000 },
        { id: 'filet', nom: 'Filet', grams: 890 },
        { id: 'estofat', nom: 'Estofat', grams: 510 },
        { id: 'xurrasco', nom: 'Xurrasco', grams: 700 },
        { id: 'entrecot', nom: 'Entrecot', grams: 1000 },
      ],

      // Productes. El lot ocupa 1 plaça de tanda per unitat. Mitja canal i canal: NO se sap com funcionen
      // (pregunta per al pastor). A la maqueta no ocupen places, no entren a cap tanda i queden com a «entrega per
      // acordar» (sense càlcul d'enviament ni correus de tanda). Per canviar-ho, sense tocar el codi:
      //   ocupaPlaces: true, placesPerUnitat: N  → entren a la tanda i ocupen N places per unitat.
      // `maxPerComanda`: null = el que càpiga en una tanda (només per als que ocupen places).
      productes: {
        lot: { nom: 'Lot de 5 kg', ocupaPlaces: true, placesPerUnitat: 1, maxPerComanda: null },
        // Canals (el pastor, 11/11/2026): no es compren a la web ni se'n mostra el pes; el preu final el dona ell per
        // telèfon o WhatsApp. La fitxa ensenya `preuKg`, IVA inclòs (14,99 i 13,99 € + 10 %). `preu` (la canal
        // sencera) no se sap: es queda de mostra.
        'mitja-canal': { nom: 'Mitja canal', preu: 0, preuKg: 16.49, preuMostra: true, etiquetaMostra: '000 €', etiquetaPerKgMostra: '000 €/kg', ocupaPlaces: false, placesPerUnitat: 0, maxPerComanda: 10, pendent: true },
        canal: { nom: 'Canal sencera', preu: 0, preuKg: 15.39, preuMostra: true, etiquetaMostra: '000 €', etiquetaPerKgMostra: '000 €/kg', ocupaPlaces: false, placesPerUnitat: 0, maxPerComanda: 10, pendent: true },
      },

      // Tandes: un sol model (en Lluc, 01/11/2026 vespre), 26 lots amb data límit. Una tanda surt a la data límit encara
      // que no tingui els 26 lots (la gestiona el pastor); si s'omple abans, surt abans. `periodeSetmanes` és el temps
      // entre dues dates límit consecutives: una tanda cada 2 setmanes (dada del client, 07/11/2026).
      tandes: {
        places: 26,
        periodeSetmanes: 2,
        periodePendent: false,
      },

      // Enviament (variant B del prototip, 07/11/2026). El preu del producte és igual per a tothom; només l'enviament
      // depèn del codi postal, en tres zones:
      //  1. `rodalies`: taula de pobles. El comprador tria «Recullo a Sort» (0 €) o «A casa» (preu del poble; el porta el
      //     pastor amb vehicle refrigerat). Cada poble té la llista tancada dels seus CP (`cps`); un CP pot ser de diversos
      //     pobles i llavors el full demana el poble. De moment només Sort; la resta, per al pastor (`pendentConfirmar`).
      //     `problemesRodalies()` diu si la taula està trencada (la prova és a PLA-eines/proves-magatzem).
      //  2. `catalunya`: la resta de CP que comencen per 08, 17, 25 o 43: preu fix per caixa (cost = caixes × preu).
      //     `lotsPerCaixa` és de mostra, pendent del pastor.
      //  3. Fora de Catalunya: no s'hi envia (el full diu el telèfon).
      // Les xifres `mostra` ensenyen `etiquetaMostra` (`00 €`), sigui quin sigui el valor intern. El nom del
      // transportista no surt mai a la web pública.
      enviament: {
        rodalies: {
          recollida: { nom: 'Sort', lloc: '[PENDENT: lloc exacte de la recollida a Sort]', horari: '[PENDENT: horari de la recollida]' },
          pobles: [{ nom: 'Sort', cps: ['25560'], preuCasa: 0, preuMostra: true, etiquetaMostra: '00 €', pendentConfirmar: true }],
        },
        catalunya: { provincies: ['08', '17', '25', '43'], preuCaixa: 0, lotsPerCaixa: 1, mostra: true, etiquetaMostra: '00 €' },
      },

      // Dies entre que es tanca la tanda i l'entrega (variable {diesEntrega} de PLA-COPY.md). [PENDENT: pregunta 5 del
      // pastor]. `etiquetaMostra` és la xifra de mostra que ensenyen la web i els correus («uns 00 dies»), com
      // `000 €` als imports; quan el pastor la doni: dies = N, mostra = false.
      diesEntrega: { dies: 10, mostra: true, etiquetaMostra: '00' },

      // Formes de pagament (simulades): només aquestes tres, sense Bizum.
      // `metodesTelefon`: com paga qui fa la comanda per telèfon (la comanda queda «pendent» fins que es cobra).
      // `comissioMostra`: el que es queda la passarel·la per comanda; xifra de mostra fins que hi hagi tarifa real.
      pagament: {
        metodes: ['targeta', 'apple-pay', 'google-pay'],
        metodesTelefon: ['pendent', 'efectiu', 'enllac'],
        comissioMostra: '00 €',
      },

      // Escorxador (mòdul «escorxador»): quants kg de carn en lot surten d'una vedella. XIFRA DE MOSTRA: el pastor ha
      // de dir-la (PLA-eines/panell-connectat/ARQUITECTURA.md, preguntes per al pastor).
      escorxador: { kgPerVedella: 130, mostra: true },

      // Canals d'avís al pastor quan entra una comanda. El correu funciona (simulat). WhatsApp: PREPARAT però
      // desactivat i sense implementar (en Lluc, 01/11/2026: no es descarta per a la versió real).
      avisos: {
        correu: { actiu: true },
        whatsapp: { actiu: false, implementat: false },
      },

      // Registre d'esdeveniments del panell (PLA.md §«Panell connectat»). `origens`: d'on pot venir un esdeveniment;
      // a la versió real, cada origen és un webhook que escriu el mateix registre. `panell` és el que fa el pastor
      // des del panell (canviar l'estat d'una tanda). `max`: els més antics s'esborren per no omplir el navegador.
      esdeveniments: {
        origens: ['web', 'telefon', 'pagament', 'transportista', 'escorxador', 'factures', 'client', 'gestoria', 'panell'],
        max: 500,
      },

      // Enllaç al panell que porta el correu al pastor. `urlBase` és un marcador fins que hi hagi domini.
      panell: { urlBase: '[DOMINI]', ruta: '/panell/' },

      // Subscripció (en Lluc, 07/11/2026): activa, només per al lot, sense permanència. Cada 2, 4 o 8 setmanes (2 per
      // defecte en encendre-la); es cobra quan es tanca la tanda; es pot aturar o saltar una tanda amb un enllaç fins a
      // la data límit. `activaPerDefecte` és l'únic lloc on el valor inicial es decideix; la UI no el pot canviar.
      subscripcio: {
        activaPerDefecte: true,
        frequenciesSetmanes: [2, 4, 8],
        frequenciaPerDefecte: 2,
      },

      // Els correus es desen amb un identificador de plantilla i les dades; el text és a PLA-COPY.md.
      correus: {
        pastor: '[CORREU DEL NEGOCI]', // pendent: se n'ha de crear un de nou
        avisaCompletaAutomatica: true,
        plantilles: [
          'comanda-pastor',
          'comanda-confirmacio',
          'tanda-completa',
          'tanda-preparacio',
          'tanda-enviada',
          'tanda-entregada',
          'comanda-moguda', // no ha sortit amb la seva tanda (sense pagar) i va a la següent
        ],
      },

      // Avisos de tanda nova (P45, art. 21.2 LSSI): s'avisa els compradors per correu tret que hagin marcat «No vull
      // rebre aquests avisos». La comanda desa `avisosTanda` (true per defecte). Al full, just abans de «Continua».
      avisosTanda: { frase: "T'avisarem per correu quan obri una tanda nova.", casella: 'No vull rebre aquests avisos' },

      // Llavor d'exemple (per a «Restablir dades»). TOT és fictici: noms «Exemple/Mostra/…», correus `.invalid`
      // (domini reservat, no pot ser de ningú) i telèfons que comencen per 000 (cap número espanyol hi comença).
      // Els codis postals són els de la capital de cada població. `fa` = dies d'antiguitat de la comanda;
      // `tanda` = número de la tanda. Les dates límit es calculen respecte a avui (`diesLimit`). Tres tandes:
      // la 12, entregada (va sortir a la data límit sense omplir-se: 22 lots); la 13, completa amb els 26; la 14, oberta (19/26).
      // `passos`: estats pels quals ja ha passat, amb el desfasament en dies respecte a la seva data límit.
      llavor: {
        tandes: [
          { numero: 12, diesLimit: -42, estat: 'entregada', passos: [['preparacio', -1], ['enviada', 1], ['entregada', 3]] },
          { numero: 13, diesLimit: -14, estat: 'completa', passos: [['completa', -3]] },
          { numero: 14, diesLimit: 14, estat: 'oberta', passos: [] },
        ],
        compradors: [
          { tanda: 12, fa: 62, lots: 6, nom: 'Roser', cognoms: 'Exemple', email: 'roser@exemple.invalid', telefon: '000 000 013', adreca: 'Carrer de Mostra, 13', cp: '08301', poblacio: 'Mataró', notes: '' },
          { tanda: 12, fa: 58, lots: 5, nom: 'Pau', cognoms: 'Prova', email: 'pau@exemple.invalid', telefon: '000 000 014', adreca: 'Plaça Inventada, 14', cp: '08720', poblacio: 'Vilafranca del Penedès', notes: '' },
          { tanda: 12, fa: 55, lots: 6, nom: 'Mireia', cognoms: 'Mostra', email: 'mireia@exemple.invalid', telefon: '000 000 015', adreca: 'Carrer Fictici, 15', cp: '17001', poblacio: 'Girona', notes: '' },
          { tanda: 12, fa: 52, lots: 5, nom: 'Jaume', cognoms: 'Demo', email: 'jaume@exemple.invalid', telefon: '000 000 016', adreca: 'Carrer Demo, 16', cp: '25560', poblacio: 'Sort', notes: '', mode: 'casa' },
          { tanda: 13, fa: 33, lots: 6, nom: 'Núria', cognoms: 'Exemple', email: 'nuria@exemple.invalid', telefon: '000 000 001', adreca: 'Carrer d’Exemple, 1, 2n 1a', cp: '08001', poblacio: 'Barcelona', notes: '' },
          { tanda: 13, fa: 30, lots: 5, nom: 'Jordi', cognoms: 'Mostra', email: 'jordi@exemple.invalid', telefon: '000 000 002', adreca: 'Carrer de Mostra, 2', cp: '17001', poblacio: 'Girona', notes: '' },
          { tanda: 13, fa: 27, lots: 4, nom: 'Pau', cognoms: 'Prova', email: 'pau@exemple.invalid', telefon: '000 000 014', adreca: 'Plaça Inventada, 14', cp: '08720', poblacio: 'Vilafranca del Penedès', notes: '' },
          { tanda: 13, fa: 24, lots: 7, nom: 'Marc', cognoms: 'Fictici', email: 'marc@exemple.invalid', telefon: '000 000 004', adreca: 'Carrer Fictici, 4', cp: '08201', poblacio: 'Sabadell', notes: 'Trucar abans de passar' },
          { tanda: 13, fa: 20, lots: 4, nom: 'Sílvia', cognoms: 'Demo', email: 'silvia@exemple.invalid', telefon: '000 000 005', adreca: 'Carrer Demo, 5', cp: '25560', poblacio: 'Sort', notes: '', mode: 'casa' },
          { tanda: 14, fa: 12, lots: 1, nom: 'Pere', cognoms: 'Inventat', email: 'pere@exemple.invalid', telefon: '000 000 006', adreca: 'Carrer Inventat, 6, 1r', cp: '08221', poblacio: 'Terrassa', notes: '' },
          { tanda: 14, fa: 10, lots: 2, nom: 'Marta', cognoms: 'Simulada', email: 'marta@exemple.invalid', telefon: '000 000 007', adreca: 'Avinguda Simulada, 7', cp: '43001', poblacio: 'Tarragona', notes: 'Deixar a consergeria' },
          { tanda: 14, fa: 8, lots: 3, nom: 'Quim', cognoms: 'Exemple', email: 'quim@exemple.invalid', telefon: '000 000 008', adreca: 'Carrer d’Exemple, 8', cp: '25560', poblacio: 'Sort', notes: '', mode: 'casa' },
          { tanda: 14, fa: 6, lots: 2, nom: 'Anna', cognoms: 'Mostra', email: 'anna@exemple.invalid', telefon: '000 000 009', adreca: 'Carrer de Mostra, 9, àtic', cp: '08240', poblacio: 'Manresa', notes: '' },
          { tanda: 14, fa: 4, lots: 5, nom: 'Oriol', cognoms: 'Prova', email: 'oriol@exemple.invalid', telefon: '000 000 010', adreca: 'Camí de Prova, 10', cp: '25620', poblacio: 'Tremp', notes: '' },
          { tanda: 14, fa: 2, lots: 1, nom: 'Jordi', cognoms: 'Mostra', email: 'jordi@exemple.invalid', telefon: '000 000 002', adreca: 'Carrer de Mostra, 2', cp: '17001', poblacio: 'Girona', notes: '' },
          { tanda: 14, fa: 1, lots: 5, nom: 'Biel', cognoms: 'Demo', email: 'biel@exemple.invalid', telefon: '000 000 012', adreca: 'Plaça Demo, 12', cp: '08400', poblacio: 'Granollers', notes: 'Cal factura' },
        ],
      },
    };

    // Imports: 45 → «45 €», 45,5 → «45,50 €».
    d.formatEuros = function (n) {
      const arrodonit = Math.round(Number(n) * 100) / 100;
      const text = Number.isInteger(arrodonit) ? String(arrodonit) : arrodonit.toFixed(2).replace('.', ',');
      return text + ' €';
    };

    // Un codi postal espanyol: 5 xifres, província 01–52. No diu si és rodalies ni si servim aquella zona.
    d.validaCP = function (cp) {
      const net = String(cp === undefined || cp === null ? '' : cp).replace(/\s+/g, '');
      if (net === '') return { valid: false, cp: net, motiu: 'buit' };
      if (!/^\d{5}$/.test(net)) return { valid: false, cp: net, motiu: 'format' };
      const provincia = Number(net.slice(0, 2));
      if (provincia < 1 || provincia > 52) return { valid: false, cp: net, motiu: 'provincia' };
      return { valid: true, cp: net, motiu: null };
    };

    // Enllaç al panell (el porta el correu al pastor); amb `comandaId`, apunta a la comanda: «…/panell/#comanda=CC-1013».
    d.enllacPanell = function (comandaId) {
      return d.panell.urlBase + d.panell.ruta + (comandaId ? '#comanda=' + comandaId : '');
    };

    // Pobles de les rodalies que tenen aquest CP (un CP pot ser de diversos pobles). Cada un: { nom, import, etiqueta, mostra }.
    d.poblesDeCP = function (cp) {
      const net = String(cp === undefined || cp === null ? '' : cp).replace(/\s+/g, '');
      return d.enviament.rodalies.pobles
        .filter((p) => p.cps.includes(net))
        .map((p) => ({ nom: p.nom, import: p.preuCasa, etiqueta: p.preuMostra ? p.etiquetaMostra : d.formatEuros(p.preuCasa), mostra: !!p.preuMostra }));
    };

    // Zona d'un CP vàlid: 'rodalies' (és a la taula), 'catalunya' (08, 17, 25, 43) o 'fora'. null si el CP no és vàlid.
    d.zonaDeCP = function (cp) {
      const v = d.validaCP(cp);
      if (!v.valid) return null;
      if (d.poblesDeCP(v.cp).length) return 'rodalies';
      return d.enviament.catalunya.provincies.includes(v.cp.slice(0, 2)) ? 'catalunya' : 'fora';
    };

    // Cost d'enviament per codi postal (variant B del prototip). `opcions`: { mode: 'recollida' | 'casa', poble, lots }.
    //  - rodalies: sense `mode` no hi ha cost (`cal: 'mode'`); 'recollida' = 0 € i `lliurament: 'recull'`; 'casa' = preu del
    //    poble i `lliurament: 'repartiment-propi'`; si el CP és de diversos pobles i no se'n dóna cap, `cal: 'poble'`.
    //  - catalunya: caixes = ceil(lots / lotsPerCaixa); import = caixes × preu per caixa; `lliurament: 'transportista'`
    //    (el nom del transportista no surt mai a la web).
    //  - fora: `enviable: false`, sense cost (`lliurament: null`).
    // `complet` = hi ha un cost definitiu (el full ja pot continuar). `gratis` mana sobre `import`; `etiqueta` és el text
    // d'import per a la vista (null si és gratis, si no és complet o si el CP no és vàlid). `mostra` = xifra de mostra.
    d.costEnviament = function (cp, opcions) {
      const o = opcions || {};
      const base = { valid: false, cp: null, motiu: null, zona: null, enviable: false, complet: false, cal: null, lliurament: null, mode: null, poble: null, pobles: [], caixes: null, gratis: false, import: null, etiqueta: null, mostra: false };
      const v = d.validaCP(cp);
      if (!v.valid) return Object.assign(base, { cp: v.cp, motiu: v.motiu });
      const zona = d.zonaDeCP(v.cp);
      const r = Object.assign(base, { valid: true, cp: v.cp, zona });
      if (zona === 'fora') return r;
      r.enviable = true;
      if (zona === 'catalunya') {
        const c = d.enviament.catalunya;
        const caixes = Math.max(1, Math.ceil(Number(o.lots || 1) / c.lotsPerCaixa));
        return Object.assign(r, { complet: true, lliurament: 'transportista', caixes, import: caixes * c.preuCaixa, etiqueta: c.mostra ? c.etiquetaMostra : d.formatEuros(caixes * c.preuCaixa), mostra: !!c.mostra });
      }
      // Rodalies
      r.pobles = d.poblesDeCP(v.cp);
      if (o.mode !== 'recollida' && o.mode !== 'casa') return Object.assign(r, { cal: 'mode' });
      r.mode = o.mode;
      if (o.mode === 'recollida') return Object.assign(r, { complet: true, lliurament: 'recull', gratis: true, import: 0 });
      const triat = r.pobles.length === 1 ? r.pobles[0] : r.pobles.find((p) => p.nom === o.poble);
      if (!triat) return Object.assign(r, { cal: 'poble' });
      return Object.assign(r, { complet: true, lliurament: 'repartiment-propi', poble: triat.nom, import: triat.import, etiqueta: triat.etiqueta, mostra: triat.mostra });
    };

    // Problemes de la taula de rodalies (llista de textos; buida = tot bé): un poble sense CP, un CP no vàlid o fora de
    // Catalunya, un CP repetit dins d'un poble, un nom repetit, un preu que no és un número i un CP de diversos pobles
    // amb preus diferents que el codi no resolgui demanant el poble. Es pot passar una altra taula (les proves).
    d.problemesRodalies = function (pobles) {
      const taula = pobles || d.enviament.rodalies.pobles;
      const problemes = [];
      const noms = new Set();
      const perCP = {};
      taula.forEach((p, i) => {
        const nom = p && p.nom ? p.nom : '(poble ' + (i + 1) + ' sense nom)';
        if (!p || !p.nom) problemes.push(nom);
        if (noms.has(nom)) problemes.push('El poble «' + nom + '» està repetit.');
        noms.add(nom);
        if (!p || !Array.isArray(p.cps) || !p.cps.length) {
          problemes.push('El poble «' + nom + '» no té cap codi postal.');
          return;
        }
        if (!Number.isFinite(p.preuCasa) || p.preuCasa < 0) problemes.push('El poble «' + nom + '» no té un preu vàlid.');
        const vistos = new Set();
        p.cps.forEach((cp) => {
          const v = d.validaCP(cp);
          if (!v.valid || v.cp !== String(cp)) problemes.push('El codi postal «' + cp + '» del poble «' + nom + '» no és vàlid.');
          else if (!d.enviament.catalunya.provincies.includes(v.cp.slice(0, 2))) problemes.push('El codi postal ' + cp + ' del poble «' + nom + '» no és de Catalunya.');
          if (vistos.has(cp)) problemes.push('El codi postal ' + cp + ' està repetit al poble «' + nom + '».');
          vistos.add(cp);
          (perCP[cp] = perCP[cp] || []).push(p);
        });
      });
      // Un CP de diversos pobles amb preus diferents: el cost sense poble ha de ser «falta triar el poble»
      Object.keys(perCP).forEach((cp) => {
        const llista = perCP[cp];
        if (llista.length < 2 || new Set(llista.map((p) => p.preuCasa)).size < 2) return;
        const original = d.enviament.rodalies.pobles;
        let r;
        try {
          d.enviament.rodalies.pobles = taula;
          r = d.costEnviament(cp, { mode: 'casa' });
        } finally {
          d.enviament.rodalies.pobles = original;
        }
        if (!(r.cal === 'poble' && !r.complet)) problemes.push('El codi postal ' + cp + ' és de diversos pobles amb preus diferents i el codi no demana el poble.');
      });
      return problemes;
    };

    d.preuLots = function (lots) {
      const n = Number(lots);
      const total = n * d.lot.preu;
      return { import: total, etiqueta: d.lot.preuMostra ? d.lot.etiquetaMostra : d.formatEuros(total), mostra: !!d.lot.preuMostra };
    };

    // Preu de qualsevol producte ('lot', 'mitja-canal', 'canal'). `null` si no existeix.
    d.preuProducte = function (id, quantitat) {
      if (id === 'lot') return d.preuLots(quantitat);
      const p = d.productes[id];
      if (!p) return null;
      const total = Number(quantitat) * p.preu;
      return { import: total, etiqueta: p.preuMostra ? p.etiquetaMostra : d.formatEuros(total), mostra: !!p.preuMostra };
    };

    // Pes del lot: el nominal («lot de 5 kg») i el que sumen les peces (5,1 kg).
    d.pesLot = function () {
      const grams = d.peces.reduce((s, p) => s + p.grams, 0);
      return { kgNominal: d.lot.kg, grams, kgReals: grams / 1000 };
    };

    // Preu per kg de les canals (fitxa de la home), IVA inclòs
    d.preuPerKgCanal = function (id) {
      const p = d.productes[id];
      return p.preuKg ? d.formatEuros(p.preuKg) + '/kg' : p.etiquetaPerKgMostra;
    };

    d.preuPerKg = function () {
      const perKg = d.lot.preu / d.lot.kg;
      return { import: perKg, etiqueta: d.lot.preuMostra ? d.lot.etiquetaPerKgMostra : d.formatEuros(perKg) + '/kg', mostra: !!d.lot.preuMostra };
    };

    // Desglossament del full de compra: producte + enviament = total. Mentre l'enviament no és definitiu (CP no vàlid, fora de Catalunya o falta triar recollida/casa o poble), enviament i total són null. `opcions` com a `costEnviament`.
    // Si el producte no ocupa places (canals, per defecte) l'entrega és «per acordar»: `entregaPerAcordar:true` i
    // enviament i total són null (no hi ha càlcul). `lots` i `etiquetes.lots` són les unitats i l'import del producte.
    d.desglossament = function (lots, cp, producte, opcions) {
      const id = producte || 'lot';
      const nLots = Number(lots);
      const pl = d.preuProducte(id, nLots);
      if (!pl) return null;
      const p = id === 'lot' ? d.productes.lot : d.productes[id];
      if (!p.ocupaPlaces) {
        return {
          producte: id,
          lots: nLots,
          kg: null,
          entregaPerAcordar: true,
          cpValid: null,
          zona: null,
          gratis: false,
          mostra: pl.mostra,
          importLots: pl.import,
          importEnviament: null,
          total: null,
          etiquetes: { lots: pl.etiqueta, enviament: null, total: null },
        };
      }
      const env = d.costEnviament(cp, Object.assign({ lots: nLots }, opcions));
      const mostra = pl.mostra || env.mostra;
      const res = {
        producte: id,
        lots: nLots,
        kg: id === 'lot' ? nLots * d.lot.kg : null,
        kgReals: id === 'lot' ? nLots * d.pesLot().kgReals : null,
        entregaPerAcordar: false,
        cpValid: env.valid,
        complet: env.complet,
        cal: env.cal,
        enviable: env.enviable,
        zona: env.zona,
        lliurament: env.lliurament,
        gratis: env.gratis,
        mostra,
        importLots: pl.import,
        importEnviament: env.complet ? env.import : null,
        total: env.complet ? pl.import + env.import : null,
        etiquetes: { lots: pl.etiqueta, enviament: null, total: null },
      };
      if (env.complet) {
        res.etiquetes.enviament = env.etiqueta;
        res.etiquetes.total = mostra ? p.etiquetaMostra || d.lot.etiquetaMostra : d.formatEuros(res.total);
      }
      return res;
    };

    return d;
  }

  const perDefecte = crearDades();
  perDefecte.crearDades = crearDades;
  return perDefecte;
});
