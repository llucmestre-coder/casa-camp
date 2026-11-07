/* Casa Camp — full de compra. Un sol full lateral (des de baix al mòbil), sense compte: lots → dades → pagament.
   Serveix per al lot, la mitja canal i la canal sencera. Textos: PLA-COPY.md §2. Les dades i les regles vénen de
   js/dades.js i js/magatzem.js; aquí només hi ha la interfície.
   El pagament és a pagament.html (js/pagament.js), només amb `?presentacio`. Sense, el pas 3 diu que ara es demana
   per telèfon i no es desa res (§8.A: cap èxit que no ha passat). */
(function () {
  'use strict';

  const D = window.CassovallDades;
  const M = window.CassovallMagatzem;
  const C = window.CasaCamp;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = C.esc;

  const TEL = D.contacte.telefons[0];
  const TEL_HREF = 'tel:+34' + TEL.replace(/\s+/g, '');
  const TITOLS = { lot: 'Demana el teu lot', 'mitja-canal': 'Demana mitja canal', canal: 'Demana una canal sencera' };
  const NOMS_CANAL = { 'mitja-canal': 'Mitja canal', canal: 'Canal sencera' };

  const full = $('#full');
  const camps = ['nom', 'cognoms', 'telefon', 'email', 'adreca', 'cp', 'poblacio'];
  const el = (id) => document.getElementById(id);

  const S = { producte: 'lot', lots: 1, opener: null };

  const aPart = () => !D.productes[S.producte].ocupaPlaces;
  const maxLots = () => (S.producte === 'lot' ? M.maxLotsPerComanda('lot') || M.placesPerTanda() : 1);

  /* ---------- Obrir i tancar (focus atrapat, Esc, el focus torna al botó) ---------- */

  function obre(producte, opener, lots) {
    const id = D.productes[producte] ? producte : 'lot';
    if (id !== S.producte) S.lots = 1;
    S.producte = id;
    // La caixa de compra de la home porta la quantitat triada (data-lots); el full la manté dins dels límits
    if (id === 'lot' && lots > 0) S.lots = Math.min(lots, maxLots());
    S.opener = opener || document.activeElement;
    full.inert = false;
    document.body.classList.add('full-obert');
    Moviment.silenci(render); // en obrir, els valors ja són al seu lloc: res no s'hi mou
    setTimeout(() => $('.tanca', full).focus({ focusVisible: false }), 50);
  }

  function tanca() {
    document.body.classList.remove('full-obert');
    full.inert = true;
    if (S.opener && S.opener.focus) S.opener.focus();
    S.opener = null;
  }

  function focusables() {
    return $$('button, input, textarea, a[href]', full).filter((e) => !e.disabled && !e.closest('[hidden]') && e.offsetParent !== null);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-obre-full]');
    if (b) {
      obre(b.dataset.obreFull || 'lot', b, Number(b.dataset.lots) || 0);
      return;
    }
    if (e.target.closest('[data-tanca-full]')) tanca();
  });
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('full-obert')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      tanca();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) {
      e.preventDefault();
      f[f.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
      e.preventDefault();
      f[0].focus();
    }
  });

  /* ---------- Pas 1: quantitat i tanda ---------- */

  function previsio() {
    return M.previsioAssignacio(S.lots, S.producte);
  }

  function liniaTanda() {
    const a = previsio();
    if (!a.ok) return '';
    if (aPart()) return 'No va per tandes. Un cop pagada, et truquem per quedar el dia.';
    if (a.motiu === 'hi-cap') {
      if (S.producte === 'lot' && a.primera.placesLliures === S.lots) return 'Amb els teus lots, la tanda queda plena i es tanca. Ara la preparem.';
      return `Entra a la tanda oberta fins al ${C.dataCurta(a.dataLimit)}, o fins que s'ompli.`;
    }
    const lliures = a.primera.placesLliures;
    const cap = lliures > 0 ? `només hi caben ${lliures} ${lliures === 1 ? 'lot més' : 'lots més'}` : 'ja no hi caben més lots';
    return `En aquesta tanda ${cap} i en demanes ${S.lots}. ${C.fraseTandaSeguent(a.dataLimit)}`;
  }

  function etiquetes() {
    const r = C.resumCompra(S.producte, S.lots, el('f-cp').value);
    r.concepte = S.producte === 'lot' ? `Lots (${S.lots} × ${r.unitari})` : NOMS_CANAL[S.producte];
    return r;
  }

  function render() {
    const lot = S.producte === 'lot';
    el('full-titol').textContent = TITOLS[S.producte];
    el('pas-1-titol').textContent = lot ? '1. Quants lots vols' : '1. Què demanes';
    el('quant').hidden = !lot;
    Moviment.text(el('q-num'), S.lots, 'balanca');
    Moviment.text(el('q-unitat'), S.lots === 1 ? 'lot de 5 kg' : `lots, ${S.lots * D.lot.kg} kg`);
    el('q-menys').disabled = S.lots <= 1;
    el('q-mes').disabled = S.lots >= maxLots();
    const e = etiquetes();
    Moviment.html(el('q-resum'), lot ? `${C.lots(S.lots)} · ${esc(e.preu)} <span>(cada lot, ${D.lot.kg} kg)</span>` : `${esc(NOMS_CANAL[S.producte])} · ${esc(e.preu)}`);
    const alMaxim = lot && S.lots >= maxLots();
    el('q-max').hidden = !alMaxim;
    if (alMaxim) el('q-max').textContent = `En una comanda hi caben com a màxim ${maxLots()} lots.`;
    el('q-tanda').textContent = liniaTanda();
    el('q-canvi').hidden = lot;
    renderDesglos();
  }

  // `mode`: 'suau' (només la xifra, quan canvia la quantitat) o 'balanca' (l'enviament i el total, quan el codi postal és complet)
  function renderDesglos(mode) {
    const e = etiquetes();
    Moviment.text(el('d-lots'), e.concepte);
    Moviment.text(el('d-lots-imp'), e.preu);
    let env = 'Posa el codi postal i te’l calculem';
    let nota = '';
    if (aPart()) {
      // «Per acordar» és text nou (no és a PLA-COPY.md); la nota és la de PLA-COPY.md §4.8
      env = 'Per acordar';
      nota = 'Et trucarem per quedar el dia que te la portem.';
    } else if (e.env.valid) {
      env = e.env.gratis ? 'Gratis' : e.env.etiqueta;
      nota = e.env.gratis ? 'Te la portem nosaltres mateixos, sense cap cost.' : 'Te la porta un transportista, refrigerada.';
    }
    Moviment.text(el('d-env'), env, mode);
    Moviment.text(el('d-total'), e.total || '—', mode);
    el('d-nota').textContent = nota;
  }

  el('q-menys').addEventListener('click', () => {
    S.lots = Math.max(1, S.lots - 1);
    render();
  });
  el('q-mes').addEventListener('click', () => {
    S.lots = Math.min(maxLots(), S.lots + 1);
    render();
  });
  el('q-canvi-boto').addEventListener('click', () => {
    S.producte = 'lot';
    S.lots = 1;
    render();
  });

  /* ---------- Pas 2: dades i validació (en sortir del camp; els errors no esborren res) ---------- */

  const MISSATGES = {
    nom: { buit: 'Escriu el teu nom.' },
    cognoms: { buit: 'Escriu els cognoms.' },
    telefon: { buit: 'Escriu un telèfon perquè et puguem trucar.', format: 'Aquest telèfon no sembla complet. Ha de tenir 9 xifres.' },
    email: { buit: 'Escriu el teu correu: t’hi enviem la confirmació.', format: 'A aquest correu li falta alguna cosa. Ha de ser com nom@exemple.com.' },
    adreca: { buit: 'Escriu l’adreça on vols rebre la comanda.' },
    cp: { buit: 'Escriu el codi postal: el necessitem per calcular l’enviament.', format: 'El codi postal té 5 xifres.', provincia: 'De moment no enviem a aquest codi postal. Truca’ns al ' + TEL + ' i en parlem.' },
    poblacio: { buit: 'Escriu la població.' },
  };

  const valorsClient = () => ({
    nom: el('f-nom').value,
    cognoms: el('f-cognoms').value,
    telefon: el('f-telefon').value,
    email: el('f-email').value,
    adreca: el('f-adreca').value,
    cp: el('f-cp').value,
    poblacio: el('f-poblacio').value,
    notes: el('f-notes').value,
  });

  function erroresClient() {
    const v = valorsClient();
    const r = M.validaClient(v);
    const errors = Object.assign({}, r.errors);
    if (!v.cognoms.trim()) errors.cognoms = 'buit';
    return errors;
  }

  function posaError(camp, motiu) {
    const input = el('f-' + camp);
    const err = el('f-' + camp + '-err');
    const caixa = input.closest('.camp');
    caixa.classList.toggle('amb-error', !!motiu);
    if (motiu) {
      input.setAttribute('aria-invalid', 'true');
      err.textContent = MISSATGES[camp][motiu] || MISSATGES[camp].buit;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
      err.textContent = '';
    }
  }

  camps.forEach((c) => {
    const input = el('f-' + c);
    input.addEventListener('blur', () => posaError(c, erroresClient()[c]));
    input.addEventListener('input', () => {
      if (input.closest('.camp').classList.contains('amb-error') && !erroresClient()[c]) posaError(c, null);
      if (c === 'cp') {
        renderDesglos('balanca');
      }
    });
  });

  el('continua').addEventListener('click', () => {
    const errors = erroresClient();
    camps.forEach((c) => posaError(c, errors[c]));
    const claus = camps.filter((c) => errors[c]);
    const avis = el('avis-errors');
    if (claus.length) {
      avis.textContent = `Hi ha ${claus.length} ${claus.length === 1 ? 'camp' : 'camps'} per revisar. Els tens marcats en vermell.`;
      avis.hidden = false;
      el('f-' + claus[0]).focus();
      return;
    }
    avis.hidden = true;
    passaAlPagament();
  });

  /* ---------- Pas 3: cap a la pàgina de pagament (en Lluc, 07/11/2026) ----------
     Amb `?presentacio`, la comanda es desa a sessionStorage i el comprador passa a pagament.html, una pàgina de pagament
     a part (com la d'una passarel·la). Sense presentació, o si el navegador no deixa desar res, el pas 3 diu que ara
     es demana per telèfon: cap pagament que no es pot fer (§8.A). */

  function senseWeb(titol, text) {
    el('pas-3-cos').innerHTML = `<div class="sense-pagament"><h4>${titol}</h4><p>${text}</p><p class="telefon-gran">${esc(TEL)}</p><a class="boto" href="${TEL_HREF}">Truca</a></div>`;
    el('pas-3').hidden = false;
    el('pas-3').scrollIntoView({ block: 'start', behavior: 'auto' });
    const primer = focusables().find((x) => el('pas-3').contains(x));
    if (primer) primer.focus();
  }

  function passaAlPagament() {
    if (!M.presentacio()) {
      senseWeb('De moment, les comandes per telèfon', 'Encara no cobrem per la web. Truca’ns i digues-nos què vols.');
      return;
    }
    const ok = C.comandaEnCurs.desa({ producte: S.producte, lots: S.lots, client: valorsClient() });
    if (!ok) {
      senseWeb('Aquest navegador no ens deixa continuar', 'Per acabar la comanda, truca’ns i te la prenem per telèfon.');
      return;
    }
    location.href = C.ambPresentacio('pagament.html');
  }

  // «Torna» des de la pàgina de pagament (index.html#comanda): el full s'obre amb el que ja s'havia escrit
  function recuperaComanda() {
    if (location.hash !== '#comanda') return;
    history.replaceState(null, '', location.pathname + location.search);
    const c = C.comandaEnCurs.llegeix();
    if (!c) return;
    camps.concat('notes').forEach((k) => {
      if (c.client[k] !== undefined) el('f-' + k).value = c.client[k];
    });
    obre(c.producte, null, c.lots);
  }

  if (M.presentacio()) el('continua').textContent = 'Continua al pagament';
  recuperaComanda();

  window.CompraFull = { obre, tanca };
})();
