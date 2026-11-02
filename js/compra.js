/* Casa Camp — full de compra. Un sol full lateral (des de baix al mòbil), sense compte: lots → dades → pagament.
   Serveix per al lot, la mitja canal i la canal sencera. Textos: PLA-COPY.md §2. Les dades i les regles vénen de
   js/dades.js i js/magatzem.js; aquí només hi ha la interfície.
   Pagament simulat: només amb `?presentacio` (M.presentacio()). Sense, el pas 3 diu que ara es demana per telèfon i
   no es desa res (§8.A: cap èxit que no ha passat). */
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

  // Targetes de prova del pagament simulat (les de proves de Stripe): una de rebutjada i una de no confirmada.
  const TARGETES_REBUTJADES = ['4000000000000002', '4000000000009995'];
  const TARGETES_NO_CONFIRMADES = ['4000000000000119'];

  // Apple Pay i Google Pay: false = surten sempre (maqueta); true = només als aparells que les admeten (versió real)
  const CARTERES_NOMES_AMB_SUPORT = false;
  // Marques dels botons de cartera, dibuixades aquí (cap fitxer ni petició de fora). A la versió real, els botons els
  // posa la passarel·la amb els fitxers oficials d'Apple i Google.
  const LOGO_APPLE = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';
  const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false"><path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0124 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 01-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

  const full = $('#full');
  const cos = $('#full-cos');
  const form = $('#full-form');
  const camps = ['nom', 'cognoms', 'telefon', 'email', 'adreca', 'cp', 'poblacio'];
  const el = (id) => document.getElementById(id);

  const S = { producte: 'lot', lots: 1, pas3: false, pagant: false, opener: null, construit: false, metode: 'targeta' };

  const aPart = () => !D.productes[S.producte].ocupaPlaces;
  const maxLots = () => (S.producte === 'lot' ? M.maxLotsPerComanda('lot') || M.placesPerTanda() : 1);

  /* ---------- Obrir i tancar (focus atrapat, Esc, el focus torna al botó) ---------- */

  function obre(producte, opener) {
    const id = D.productes[producte] ? producte : 'lot';
    if (id !== S.producte) S.lots = 1;
    S.producte = id;
    S.opener = opener || document.activeElement;
    if (!S.pagant) mostraFormulari();
    full.inert = false;
    document.body.classList.add('full-obert');
    render();
    setTimeout(() => $('.tanca', full).focus({ focusVisible: false }), 50);
  }

  function tanca() {
    if (S.pagant) return;
    document.body.classList.remove('full-obert');
    full.inert = true;
    mostraFormulari();
    if (S.opener && S.opener.focus) S.opener.focus();
    S.opener = null;
  }

  function focusables() {
    return $$('button, input, textarea, a[href]', full).filter((e) => !e.disabled && !e.closest('[hidden]') && e.offsetParent !== null);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-obre-full]');
    if (b) {
      obre(b.dataset.obreFull || 'lot', b);
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
      if (S.producte === 'lot' && a.primera.placesLliures === S.lots) return `La teva comanda entra a la tanda ${a.tandaNumero}. Amb els teus lots, la tanda queda plena i tancada. Ara la preparem.`;
      return `La teva comanda entra a la tanda ${a.tandaNumero}. Es tanca quan arribi a ${M.placesPerTanda()} lots o, com a molt tard, el ${C.dataCurta(a.dataLimit)}.`;
    }
    const lliures = a.primera.placesLliures;
    const cap = lliures > 0 ? `només hi caben ${lliures} ${lliures === 1 ? 'lot més' : 'lots més'}` : 'ja no hi caben més lots';
    return `A la tanda ${a.primera.numero} ${cap} i en demanes ${S.lots}. Perquè t'arribi tot junt, la comanda anirà a la tanda ${a.tandaNumero}, que es tanca com a molt tard el ${C.dataCurta(a.dataLimit)}.`;
  }

  function recordatori() {
    const a = previsio();
    if (!a.ok) return '';
    if (aPart()) return "Pagues ara i et truquem per quedar el dia de l'entrega.";
    return `Pagues ara. La comanda va a la tanda ${a.tandaNumero}, que es tanca com a molt tard el ${C.dataCurta(a.dataLimit)}. Uns ${C.diesEntrega()} dies després que es tanqui, la tens a casa. T'escrivim quan sigui en camí.`;
  }

  function etiquetes() {
    const lot = S.producte === 'lot';
    const preu = C.importLots(S.producte, S.lots);
    const cp = el('f-cp').value;
    const env = D.costEnviament(cp);
    const mostra = D.preuProducte(S.producte, S.lots).mostra || env.mostra;
    const p = D.productes[S.producte];
    let total = null;
    // Les canals (no van per tandes) tenen l'entrega per acordar: no es calcula l'enviament i el total és el producte
    if (aPart()) total = preu;
    else if (env.valid) total = mostra ? p.etiquetaMostra || D.lot.etiquetaMostra : D.formatEuros(D.preuProducte(S.producte, S.lots).import + env.import);
    const unitari = D.lot.preuMostra ? D.lot.etiquetaMostra : D.formatEuros(D.lot.preu);
    return {
      concepte: lot ? `Lots (${S.lots} × ${unitari})` : NOMS_CANAL[S.producte],
      preu,
      env,
      total,
    };
  }

  function render() {
    const lot = S.producte === 'lot';
    el('full-titol').textContent = TITOLS[S.producte];
    el('pas-1-titol').textContent = lot ? '1. Quants lots vols' : '1. Què demanes';
    el('quant').hidden = !lot;
    el('q-num').textContent = S.lots;
    el('q-unitat').textContent = S.lots === 1 ? 'lot de 5 kg' : `lots, ${S.lots * D.lot.kg} kg`;
    el('q-menys').disabled = S.lots <= 1;
    el('q-mes').disabled = S.lots >= maxLots();
    const e = etiquetes();
    el('q-resum').innerHTML = lot ? `${C.lots(S.lots)} · ${esc(e.preu)} <span>(cada lot, ${D.lot.kg} kg)</span>` : `${esc(NOMS_CANAL[S.producte])} · ${esc(e.preu)}`;
    const alMaxim = lot && S.lots >= maxLots();
    el('q-max').hidden = !alMaxim;
    if (alMaxim) el('q-max').textContent = `En una comanda hi caben com a màxim ${maxLots()} lots.`;
    el('q-tanda').textContent = liniaTanda();
    el('q-canvi').hidden = lot;
    renderDesglos();
    if (S.construit) actualitzaPas3();
  }

  function renderDesglos() {
    const e = etiquetes();
    el('d-lots').textContent = e.concepte;
    el('d-lots-imp').textContent = e.preu;
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
    el('d-env').textContent = env;
    el('d-total').textContent = e.total || '—';
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
        renderDesglos();
        if (S.construit) actualitzaPas3();
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
    mostraPas3();
  });

  /* ---------- Pas 3: pagament ---------- */

  function campHTML(id, etiqueta, extra) {
    const x = extra || {};
    return `<div class="camp${x.ample ? ' ample' : ''}"><label for="${id}">${etiqueta}</label><input id="${id}" ${x.attrs || ''} placeholder=" " aria-describedby="${id}-err"><span class="error" id="${id}-err" hidden></span></div>`;
  }

  function construeixPas3() {
    const dest = el('pas-3-cos');
    if (!M.presentacio()) {
      dest.innerHTML = `<div class="sense-pagament"><h4>De moment, les comandes per telèfon</h4><p>Encara no cobrem per la web. Truca’ns i digues-nos què vols.</p><p class="telefon-gran">${esc(TEL)}</p><a class="boto" href="${TEL_HREF}">Truca</a></div>`;
      S.construit = false;
      return;
    }
    const aviso = C.desaDades() ? '' : '<p class="avis-storage">Aquest navegador no deixa desar dades: la comanda no es veurà al panell.</p>';
    const carteres = carteresVisibles();
    const botoCartera = (id, nom, marca) => `<button type="button" class="boto-cartera boto-doble" id="paga-${id}" aria-label="Paga amb ${nom}"><span class="marca-cartera">${marca}<span>Pay</span></span><span>Pagant…</span></button>`;
    // Pagament exprés com al pas de pagar definitiu (en Lluc, 02/11/2026): a dalt els botons de cada cartera, amb el
    // format de la marca (SVG propi, res de fora), una ratlla i a sota la targeta. La ratlla «o paga amb targeta» és
    // text nou, fora de PLA-COPY.md.
    dest.innerHTML = `
      <p class="recorda" id="p-recorda"></p>
      ${carteres.length ? `<div class="expres">${carteres.includes('apple-pay') ? botoCartera('apple', 'Apple Pay', LOGO_APPLE) : ''}${carteres.includes('google-pay') ? botoCartera('google', 'Google Pay', LOGO_GOOGLE) : ''}</div>
      <p class="ratlla"><span>o paga amb targeta</span></p>` : ''}
      <div id="p-targeta">
        <div class="camps-targeta">
          ${campHTML('f-cc-num', 'Número de la targeta', { attrs: 'autocomplete="cc-number" inputmode="numeric"' })}
          ${campHTML('f-cc-exp', 'Caducitat (MM/AA)', { attrs: 'autocomplete="cc-exp" inputmode="numeric" maxlength="5"' })}
          ${campHTML('f-cc-cvc', 'CVC', { attrs: 'autocomplete="cc-csc" inputmode="numeric" maxlength="4"' })}
        </div>
        <!-- PENDENT: confirmar «No guardem les dades de la targeta» quan es triï la passarel·la de la versió real; si no es pot complir, es treu -->
        <p class="nota-targeta">No guardem les dades de la targeta.</p>
        <button type="button" class="boto boto-ample boto-doble paga" id="paga"><span id="paga-text">Paga</span><span>Pagant…</span></button>
      </div>
      <p class="error-pagament" id="pag-error" role="alert" hidden></p>
      ${aviso}`;
    S.construit = true;
    const num = el('f-cc-num');
    num.addEventListener('input', () => {
      num.value = num.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
    });
    const exp = el('f-cc-exp');
    exp.addEventListener('input', () => {
      let v = exp.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
      exp.value = v;
    });
    el('f-cc-cvc').addEventListener('input', () => {
      el('f-cc-cvc').value = el('f-cc-cvc').value.replace(/\D/g, '').slice(0, 4);
    });
    ['f-cc-num', 'f-cc-exp', 'f-cc-cvc'].forEach((id) => el(id).addEventListener('blur', () => validaTargeta([id])));
    el('paga').addEventListener('click', () => paga('targeta'));
    if (el('paga-apple')) el('paga-apple').addEventListener('click', () => paga('apple-pay'));
    if (el('paga-google')) el('paga-google').addEventListener('click', () => paga('google-pay'));
    actualitzaPas3();
  }

  // Quines carteres surten. A la maqueta (?presentacio), sempre totes dues, perquè es vegin des de qualsevol
  // ordinador. A la versió real: CARTERES_NOMES_AMB_SUPORT = true i només surten als aparells que les admeten (ho
  // acaba de decidir la passarel·la de pagament; aquí, una aproximació).
  function carteresVisibles() {
    if (!CARTERES_NOMES_AMB_SUPORT) return ['apple-pay', 'google-pay'];
    const r = [];
    try {
      if (window.ApplePaySession && window.ApplePaySession.canMakePayments()) r.push('apple-pay');
    } catch (e) {
      /* sense Apple Pay */
    }
    if ('PaymentRequest' in window && /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent)) r.push('google-pay');
    return r;
  }

  function actualitzaPas3() {
    if (!M.presentacio() || !el('p-recorda')) return;
    el('p-recorda').textContent = recordatori();
    const total = etiquetes().total;
    el('paga-text').textContent = total ? `Paga ${total}` : 'Paga';
  }

  function mostraPas3() {
    S.pas3 = true;
    el('pas-3').hidden = false;
    // Amb el pas 3 obert, «Continua» ja no porta enlloc (el pagament torna a validar el pas 2)
    el('continua').hidden = true;
    if (!S.construit) construeixPas3();
    render();
    el('pas-3').scrollIntoView({ block: 'start', behavior: 'auto' });
    const primer = focusables().find((x) => el('pas-3').contains(x));
    if (primer) primer.focus();
  }

  /* Validació de la targeta */
  const luhn = (n) => {
    let suma = 0;
    let doble = false;
    for (let i = n.length - 1; i >= 0; i--) {
      let d = Number(n[i]);
      if (doble) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      suma += d;
      doble = !doble;
    }
    return suma % 10 === 0;
  };

  function posaErrorTargeta(id, text) {
    const input = el(id);
    const err = el(id + '-err');
    input.closest('.camp').classList.toggle('amb-error', !!text);
    if (text) {
      input.setAttribute('aria-invalid', 'true');
      err.textContent = text;
      err.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      err.hidden = true;
      err.textContent = '';
    }
  }

  function validaTargeta(ids) {
    const errors = {};
    const num = el('f-cc-num').value.replace(/\s/g, '');
    if (!num) errors['f-cc-num'] = 'Escriu el número de la targeta.';
    else if (num.length < 13 || !luhn(num)) errors['f-cc-num'] = 'Aquest número de targeta no és correcte. Revisa’l.';
    const exp = el('f-cc-exp').value;
    const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(exp);
    if (!m) errors['f-cc-exp'] = 'Posa el mes i l’any així: 08/28.';
    else {
      const ara = new Date();
      const fi = new Date(2000 + Number(m[2]), Number(m[1]), 1); // primer dia del mes següent
      if (fi <= ara) errors['f-cc-exp'] = 'Aquesta targeta ja ha caducat.';
    }
    if (!/^\d{3,4}$/.test(el('f-cc-cvc').value)) errors['f-cc-cvc'] = 'El CVC són les xifres de seguretat de la targeta: 3 al darrere (4 al davant, a les American Express).';
    (ids || ['f-cc-num', 'f-cc-exp', 'f-cc-cvc']).forEach((id) => posaErrorTargeta(id, errors[id]));
    return errors;
  }

  function errorPagament(text) {
    const e = el('pag-error');
    e.textContent = text;
    e.hidden = false;
  }

  function ocupat(si) {
    S.pagant = si;
    ['paga', 'paga-apple', 'paga-google'].forEach((id) => {
      const b = el(id);
      if (!b) return;
      b.setAttribute('aria-busy', si ? 'true' : 'false');
      b.disabled = si;
    });
  }

  function paga(metode) {
    if (S.pagant) return;
    S.metode = metode;
    el('pag-error').hidden = true;
    // El pas 2 pot haver canviat després de «Continua»: es torna a mirar abans de res
    const errors = erroresClient();
    const claus = camps.filter((c) => errors[c]);
    if (claus.length) {
      camps.forEach((c) => posaError(c, errors[c]));
      el('f-' + claus[0]).focus();
      return;
    }
    const targeta = S.metode === 'targeta';
    if (targeta) {
      const e = validaTargeta();
      const primer = ['f-cc-num', 'f-cc-exp', 'f-cc-cvc'].find((id) => e[id]);
      if (primer) {
        el(primer).focus();
        return;
      }
    }
    // Sense connexió: el codi sap segur que no s'ha enviat res
    if (navigator.onLine === false) {
      errorPagament('No s’ha pogut fer el pagament. No t’hem cobrat res. Torna-ho a provar.');
      return;
    }
    ocupat(true);
    const num = targeta ? el('f-cc-num').value.replace(/\s/g, '') : '';
    setTimeout(() => {
      ocupat(false);
      if (TARGETES_REBUTJADES.includes(num)) {
        errorPagament('El banc no ha acceptat la targeta. No t’hem cobrat res. Prova-ho amb una altra o truca’ns al ' + TEL + '.');
        return;
      }
      if (TARGETES_NO_CONFIRMADES.includes(num)) {
        errorPagament('No hem pogut confirmar el pagament. Abans de tornar-ho a provar, truca’ns al ' + TEL + ' i ho comprovem.');
        return;
      }
      acaba();
    }, 1400);
  }

  /* ---------- Comanda feta ---------- */

  function acaba() {
    const client = valorsClient();
    const r = M.crearComanda({ lots: S.lots, producte: S.producte, client, metodePagament: S.metode });
    if (!r.ok) {
      errorPagament('No s’ha pogut fer el pagament. No t’hem cobrat res. Torna-ho a provar.');
      return;
    }
    mostraConfirmacio(r, client);
  }

  function mostraConfirmacio(r, client) {
    const c = r.comanda;
    const a = r.assignacio;
    const total = C.importTotal(c);
    let tanda = '';
    let ultima = '';
    if (a.tandaId) {
      const t = M.tanda(a.tandaId);
      tanda = t && t.ocupacio.plena
        ? `Amb la teva comanda, la <strong>tanda ${a.tandaNumero}</strong> queda plena i tancada. Ara la preparem.`
        : `Va a la <strong>tanda ${a.tandaNumero}</strong>, que es tanca com a molt tard el ${C.dataCurta(a.dataLimit)}.`;
      ultima = `La tens a casa uns ${C.diesEntrega()} dies després que es tanqui la tanda. Quan la comanda surti, t’escriurem amb el dia exacte.`;
    } else {
      tanda = 'Et trucarem per quedar el dia que te la portem.';
    }
    const items = [`Comanda <strong>${esc(c.id)}</strong>`, `${esc(C.producte(c.producte, c.lots))} · ${esc(total)} pagats`, tanda, `T’arriba a: ${esc(client.adreca)}, ${esc(client.cp)} ${esc(client.poblacio)}`];
    const avisStorage = C.desaDades() ? '' : '<p class="avis-storage">Aquest navegador no deixa desar dades: la comanda no es veurà al panell.</p>';
    const vista = document.createElement('div');
    vista.className = 'confirmacio';
    vista.innerHTML = `
      <h3 id="conf-titol" tabindex="-1">Gràcies, ${esc(client.nom)}. La comanda és pagada.</h3>
      <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      <p>T’hem enviat la confirmació a ${esc(client.email)}.${ultima ? ' ' + ultima : ''}</p>
      <p>Si has de canviar alguna cosa, truca’ns al ${esc(TEL)}.</p>
      ${avisStorage}
      <button type="button" class="boto boto-ample" data-tanca-full>Tanca</button>`;
    // Primer es buida el formulari (mentre és al DOM: els camps es busquen per id) i després es canvia la vista
    form.reset();
    camps.forEach((k) => posaError(k, null));
    S.pas3 = false;
    S.lots = 1;
    S.metode = 'targeta';
    S.construit = false;
    el('pas-3').hidden = true;
    el('pas-3-cos').innerHTML = '';
    el('continua').hidden = false;
    el('avis-errors').hidden = true;
    cos.replaceChildren(vista);
    full.scrollTop = 0;
    $('#conf-titol').focus();
  }

  // Torna al formulari (després d'una confirmació, o en reobrir el full)
  function mostraFormulari() {
    if (cos.firstElementChild !== form) cos.replaceChildren(form);
  }

  // Si l'usuari obre el full sense haver pagat, el pas 3 es manté tal com estava
  window.CompraFull = { obre, tanca };
})();
