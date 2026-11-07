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

      // Preu: PENDENT del pastor. `preu` és el valor intern (per lot, en euros); mentre `preuMostra` sigui true
      // la vista ensenya `etiquetaMostra`, sigui quin sigui el valor. Per posar el preu real: preu = 45,
      // preuMostra = false. El lot es diu «lot de 5 kg» (`kg`) però les peces reals pesen 5,1 kg (`pesLot()`).
      lot: {
        kg: 5,
        preu: 0,
        preuMostra: true,
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
        'mitja-canal': { nom: 'Mitja canal', preu: 0, preuMostra: true, etiquetaMostra: '000 €', kg: 0, etiquetaPesMostra: 'Uns 000 kg', etiquetaPerKgMostra: '000 €/kg', ocupaPlaces: false, placesPerUnitat: 0, maxPerComanda: 10, pendent: true },
        canal: { nom: 'Canal sencera', preu: 0, preuMostra: true, etiquetaMostra: '000 €', kg: 0, etiquetaPesMostra: 'Uns 000 kg', etiquetaPerKgMostra: '000 €/kg', ocupaPlaces: false, placesPerUnitat: 0, maxPerComanda: 10, pendent: true },
      },

      // Tandes: un sol model (en Lluc, 01/11/2026 vespre), 26 lots amb data límit. Una tanda surt quan arriba a
      // `places` o, com a molt tard, a la seva data límit, el que passi primer; si arriba la data sense 26, surt
      // igualment (es confirma amb el pastor). `periodeSetmanes` és el temps entre dues dates límit consecutives
      // (PENDENT del pastor; 4 és de mostra).
      tandes: {
        places: 26,
        periodeSetmanes: 4,
        periodePendent: true,
      },

      // Enviament. El preu del producte és igual per a tothom; només l'enviament depèn del codi postal.
      // Rodalies de Sort: gratis, ho reparteix el pastor mateix («repartiment-propi»). Només el 25560 (Sort) és segur;
      // la resta de pobles de les rodalies, PENDENTS de confirmar amb ell: no s'hi afegeix cap codi per endevinar.
      // La resta d'Espanya: transportista, de pagament (xifra de mostra `00 €`; tarifes per decidir).
      // El nom del transportista no ha de sortir a la web pública: aquí només hi ha un marcador.
      enviament: {
        rodalies: { nom: 'rodalies de Sort', cps: ['25560'], pendentConfirmar: true },
        resta: { import: 0, mostra: true, etiquetaMostra: '00 €' },
        transportista: { nom: '[TRANSPORTISTA]', pendentConfirmar: true },
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

      // Subscripció: preparada però inactiva (només la proposta d'en Lluc; no és decisió del pastor).
      // `activaPerDefecte` és l'únic lloc on el valor inicial es decideix; la UI no el pot canviar.
      subscripcio: {
        activaPerDefecte: false,
        frequenciesSetmanes: [1, 2, 4, 8],
        minimLotsPerDefecte: 3,
        pendent: true,
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
          { tanda: 12, fa: 52, lots: 5, nom: 'Jaume', cognoms: 'Demo', email: 'jaume@exemple.invalid', telefon: '000 000 016', adreca: 'Carrer Demo, 16', cp: '25560', poblacio: 'Sort', notes: '' },
          { tanda: 13, fa: 33, lots: 6, nom: 'Núria', cognoms: 'Exemple', email: 'nuria@exemple.invalid', telefon: '000 000 001', adreca: 'Carrer d’Exemple, 1, 2n 1a', cp: '08001', poblacio: 'Barcelona', notes: '' },
          { tanda: 13, fa: 30, lots: 5, nom: 'Jordi', cognoms: 'Mostra', email: 'jordi@exemple.invalid', telefon: '000 000 002', adreca: 'Carrer de Mostra, 2', cp: '17001', poblacio: 'Girona', notes: '' },
          { tanda: 13, fa: 27, lots: 4, nom: 'Pau', cognoms: 'Prova', email: 'pau@exemple.invalid', telefon: '000 000 014', adreca: 'Plaça Inventada, 14', cp: '08720', poblacio: 'Vilafranca del Penedès', notes: '' },
          { tanda: 13, fa: 24, lots: 7, nom: 'Marc', cognoms: 'Fictici', email: 'marc@exemple.invalid', telefon: '000 000 004', adreca: 'Carrer Fictici, 4', cp: '08201', poblacio: 'Sabadell', notes: 'Trucar abans de passar' },
          { tanda: 13, fa: 20, lots: 4, nom: 'Sílvia', cognoms: 'Demo', email: 'silvia@exemple.invalid', telefon: '000 000 005', adreca: 'Carrer Demo, 5', cp: '25560', poblacio: 'Sort', notes: '' },
          { tanda: 14, fa: 12, lots: 1, nom: 'Pere', cognoms: 'Inventat', email: 'pere@exemple.invalid', telefon: '000 000 006', adreca: 'Carrer Inventat, 6, 1r', cp: '08221', poblacio: 'Terrassa', notes: '' },
          { tanda: 14, fa: 10, lots: 2, nom: 'Marta', cognoms: 'Simulada', email: 'marta@exemple.invalid', telefon: '000 000 007', adreca: 'Avinguda Simulada, 7', cp: '43001', poblacio: 'Tarragona', notes: 'Deixar a consergeria' },
          { tanda: 14, fa: 8, lots: 3, nom: 'Quim', cognoms: 'Exemple', email: 'quim@exemple.invalid', telefon: '000 000 008', adreca: 'Carrer d’Exemple, 8', cp: '25560', poblacio: 'Sort', notes: '' },
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

    // Cost d'enviament per codi postal. `gratis` mana sobre `import`. `etiqueta` és el text d'import per a la vista
    // (null si és gratis o el codi no és vàlid: la paraula «gratis» és copy). `mostra` = xifra de mostra.
    // `lliurament`: 'repartiment-propi' (rodalies de Sort, el porta el pastor) o 'transportista'; null si el CP no és vàlid.
    d.costEnviament = function (cp) {
      const v = d.validaCP(cp);
      if (!v.valid) {
        return { valid: false, cp: v.cp, motiu: v.motiu, zona: null, lliurament: null, gratis: false, import: null, etiqueta: null, mostra: false };
      }
      if (d.enviament.rodalies.cps.includes(v.cp)) {
        return { valid: true, cp: v.cp, motiu: null, zona: 'rodalies', lliurament: 'repartiment-propi', gratis: true, import: 0, etiqueta: null, mostra: false };
      }
      const r = d.enviament.resta;
      return {
        valid: true,
        cp: v.cp,
        motiu: null,
        zona: 'resta',
        lliurament: 'transportista',
        gratis: false,
        import: r.import,
        etiqueta: r.mostra ? r.etiquetaMostra : d.formatEuros(r.import),
        mostra: !!r.mostra,
      };
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

    // Pes i preu per kg de les canals (fitxa de la home). `kg` és el pes aproximat: PENDENT del pastor (pregunta 16).
    d.pesCanal = function (id) {
      const p = d.productes[id];
      return !p.kg ? p.etiquetaPesMostra : 'Uns ' + String(p.kg).replace('.', ',') + ' kg';
    };
    d.preuPerKgCanal = function (id) {
      const p = d.productes[id];
      return p.preuMostra || !p.kg ? p.etiquetaPerKgMostra : d.formatEuros(p.preu / p.kg) + '/kg';
    };

    d.preuPerKg = function () {
      const perKg = d.lot.preu / d.lot.kg;
      return { import: perKg, etiqueta: d.lot.preuMostra ? d.lot.etiquetaPerKgMostra : d.formatEuros(perKg) + '/kg', mostra: !!d.lot.preuMostra };
    };

    // Desglossament del full de compra: producte + enviament = total. Sense codi postal vàlid, enviament i total són null.
    // Si el producte no ocupa places (canals, per defecte) l'entrega és «per acordar»: `entregaPerAcordar:true` i
    // enviament i total són null (no hi ha càlcul). `lots` i `etiquetes.lots` són les unitats i l'import del producte.
    d.desglossament = function (lots, cp, producte) {
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
      const env = d.costEnviament(cp);
      const mostra = pl.mostra || env.mostra;
      const res = {
        producte: id,
        lots: nLots,
        kg: id === 'lot' ? nLots * d.lot.kg : null,
        kgReals: id === 'lot' ? nLots * d.pesLot().kgReals : null,
        entregaPerAcordar: false,
        cpValid: env.valid,
        zona: env.zona,
        lliurament: env.lliurament,
        gratis: env.gratis,
        mostra,
        importLots: pl.import,
        importEnviament: env.valid ? env.import : null,
        total: env.valid ? pl.import + env.import : null,
        etiquetes: { lots: pl.etiqueta, enviament: null, total: null },
      };
      if (env.valid) {
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
