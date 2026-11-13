/* Casa Camp — pàgina de pagament (pagament.html; en Lluc, 07/11/2026). Rep la comanda que la pàgina de compra ha desat a
   sessionStorage (C.comandaEnCurs), en pinta el resum i fa el pagament simulat. Només amb `?presentacio`: sense, diu
   que ara es demana per telèfon (§8.A: cap «pagat» que el codi no ha aconseguit). Abans era el pas 3 del full
   (js/compra.js). A la versió real, aquesta pàgina és la de la passarel·la. */
(function () {
  'use strict';

  const D = window.CassovallDades;
  const M = window.CassovallMagatzem;
  const C = window.CasaCamp;
  const esc = C.esc;
  const el = (id) => document.getElementById(id);

  const TEL = D.contacte.telefons[0];
  const TEL_HREF = 'tel:+34' + TEL.replace(/\s+/g, '');
  const NOMS = { lot: 'Lot de vedella de 5 kg', 'mitja-canal': 'Mitja canal', canal: 'Canal sencera' };
  const FOTOS = { lot: 'assets/fotos/lot.webp', 'mitja-canal': 'assets/fotos/canal.webp', canal: 'assets/fotos/canal.webp' };

  // Targetes de prova del pagament simulat (les de proves de Stripe): una de rebutjada i una de no confirmada.
  const TARGETES_REBUTJADES = ['4000000000000002', '4000000000009995'];
  const TARGETES_NO_CONFIRMADES = ['4000000000000119'];
  const ESPERA = 1400; // ms que «pensa» el pagament simulat

  // Marques dels botons de cartera, dibuixades aquí (cap fitxer ni petició de fora). A la versió real, els botons els
  // posa la passarel·la amb els fitxers oficials d'Apple i Google.
  const LOGO_APPLE = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';
  const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false"><path fill="#FBBC05" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#EA4335" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#34A853" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0124 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 01-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
  const ICONA_TARGETA = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><rect x="2.5" y="5" width="19" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 9.5h19" stroke="currentColor" stroke-width="2"/><path d="M6 15h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const ICONA_FET = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const cos = el('pg-cos');
  const resum = el('pg-resum-cos');
  const torna = el('pg-torna');
  torna.href = C.ambPresentacio('compra.html');

  const S = { comanda: null, pagant: false, metode: 'targeta', tocats: new Set(), totsTocats: false };

  /* ---------- Quan no es pot pagar aquí ---------- */

  function missatge(titol, text, ambTelefon) {
    el('pg-titol').textContent = titol;
    cos.innerHTML = `<div class="pg-missatge"><p>${text}</p>${ambTelefon ? `<p class="pg-tel">${esc(TEL)}</p><p><a class="pg-paga" href="${TEL_HREF}"><span>Truca</span></a></p>` : ''}<p><a class="pg-boto-sec" href="${esc(C.ambPresentacio('index.html'))}">Torna a Casa Camp</a></p></div>`;
    torna.href = C.ambPresentacio('index.html');
  }

  /* ---------- Resum (columna de l'esquerra) ---------- */

  function recordatori(c) {
    const a = M.previsioAssignacio(c.lots, c.producte);
    if (!a.ok) return '';
    if (!D.productes[c.producte].ocupaPlaces) return "Pagues ara i et truquem per quedar el dia de l'entrega.";
    const on = c.enviament && c.enviament.mode === 'recollida' ? 'la pots recollir a Sort' : 'tens la carn a casa';
    return `La tanda es tanca com a molt tard el ${C.dataCurta(a.dataLimit)}, i uns ${C.diesEntrega()} dies després ${on}. T'escrivim el dia que surt.`;
  }

  // La subscripció, si n'hi ha: una línia al resum i a la confirmació
  const liniaSub = (s, lots) => `Recurrent: ${lots === 1 ? 'un lot' : lots + ' lots'} cada ${s.frequenciaSetmanes} setmanes. ${lots === 1 ? 'El primer el pagues ara' : 'El primer cop els pagues ara'}; els següents te’ls cobrem quan es tanca cada tanda. Ho pots aturar quan vulguis.`;

  function pintaResum(c) {
    const r = C.resumCompra(c.producte, c.lots, c.client.cp, c.enviament || {});
    const quantitat = c.producte === 'lot' ? `${C.lots(c.lots)} · ${c.lots * D.lot.kg} kg` : 'Quantitat: 1';
    const recull = !r.aPart && r.env.lliurament === 'recull';
    const env = r.aPart ? 'Per acordar' : r.env.complet ? (recull ? '0 €' : r.env.etiqueta) : '—';
    const k = c.client;
    resum.innerHTML = `
      <p class="pg-eti">Paga a Casa Camp</p>
      <p class="pg-import" id="pg-import">${esc(r.total || r.preu)}</p>
      <ul class="pg-linies">
        <li class="pg-linia"><img src="${FOTOS[c.producte]}" alt="" width="48" height="48"><span><b>${esc(NOMS[c.producte])}</b><small>${esc(quantitat)}</small></span><span>${esc(r.preu)}</span></li>
      </ul>
      <dl class="pg-xifres">
        <div><dt>Subtotal</dt><dd>${esc(r.preu)}</dd></div>
        <div><dt>Enviament</dt><dd>${esc(env)}</dd></div>
        <div class="pg-total"><dt>Total</dt><dd>${esc(r.total || r.preu)}</dd></div>
      </dl>
      <div class="pg-entrega">
        <p>${recull ? `<b>El recolliràs a:</b> ${esc(D.enviament.rodalies.recollida.nom)} · ${esc(D.enviament.rodalies.recollida.lloc)} · ${esc(D.enviament.rodalies.recollida.horari)}` : `<b>T'arriba a:</b> ${esc(k.nom)} ${esc(k.cognoms)}, ${esc(k.adreca)}, ${esc(k.cp)} ${esc(k.poblacio)}`}</p>
        <p>${esc(recordatori(c))}</p>${c.subscripcio ? `
        <p>${esc(liniaSub(c.subscripcio, c.lots))}</p>
        <p>${esc(`Avui pagues ${r.total || r.preu}. A cada tanda següent, ${r.total || r.preu} (${C.lots(c.lots)}${recull ? '' : ' + enviament'}).`)}</p>` : ''}
      </div>`;
    return r;
  }

  /* ---------- Formulari de pagament (columna de la dreta) ---------- */

  function pintaPagament(c, r) {
    const cartera = (id, nom, logo) => `<button type="button" class="pg-cartera" id="pg-${id}" aria-label="Paga amb ${nom}"><span class="pg-marca">${logo}<span>Pay</span></span><span class="pg-roda">Pagant…</span></button>`;
    const total = r.total || r.preu;
    const avisDades = C.desaDades() ? '' : '<p class="pg-nota">Aquest navegador no deixa desar dades: la comanda no es veurà al panell.</p>';
    cos.innerHTML = `
      <div class="pg-expres">${cartera('apple', 'Apple Pay', LOGO_APPLE)}${cartera('google', 'Google Pay', LOGO_GOOGLE)}</div>
      <p class="pg-ratlla">o paga amb targeta</p>
      <form id="pg-form" novalidate>
        <div class="pg-camp" id="c-email"><label for="pg-email">Correu electrònic</label><input id="pg-email" type="email" autocomplete="email" value="${esc(c.client.email)}" aria-describedby="pg-email-err"><p class="pg-error" id="pg-email-err" hidden></p></div>
        <fieldset class="pg-grup" id="c-targeta">
          <legend>Dades de la targeta</legend>
          <div class="pg-targeta">
            <div class="pg-num"><label class="sr-nomes" for="pg-num">Número de la targeta</label><input id="pg-num" autocomplete="cc-number" inputmode="numeric" placeholder="1234 1234 1234 1234" aria-describedby="pg-targeta-err">${ICONA_TARGETA}</div>
            <div class="pg-exp"><label class="sr-nomes" for="pg-exp">Caducitat</label><input id="pg-exp" autocomplete="cc-exp" inputmode="numeric" maxlength="5" placeholder="MM/AA" aria-describedby="pg-targeta-err"></div>
            <div class="pg-cvc"><label class="sr-nomes" for="pg-cvc">CVC</label><input id="pg-cvc" autocomplete="cc-csc" inputmode="numeric" maxlength="4" placeholder="CVC" aria-describedby="pg-targeta-err"></div>
          </div>
          <p class="pg-error" id="pg-targeta-err" hidden></p>
        </fieldset>
        <div class="pg-camp" id="c-titular"><label for="pg-titular">Nom del titular</label><input id="pg-titular" autocomplete="cc-name" value="${esc((c.client.nom + ' ' + c.client.cognoms).trim())}" aria-describedby="pg-titular-err"><p class="pg-error" id="pg-titular-err" hidden></p></div>
        <button type="submit" class="pg-paga" id="pg-paga"><span>Paga ${esc(total)}</span><span class="pg-roda">Pagant…</span></button>
        <!-- PENDENT: confirmar «No guardem les dades de la targeta» quan es triï la passarel·la de la versió real; si no es pot complir, es treu -->
        <p class="pg-nota">No guardem les dades de la targeta.</p>
        <p class="pg-avis" id="pg-avis" role="alert" hidden></p>
        ${avisDades}
      </form>`;

    const num = el('pg-num');
    num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); });
    const exp = el('pg-exp');
    exp.addEventListener('input', () => {
      let v = exp.value.replace(/\D/g, '').slice(0, 4);
      if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
      exp.value = v;
    });
    const cvc = el('pg-cvc');
    cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4); });
    // Un error surt en sortir d'un camp que ja s'ha tocat, i només el d'aquell camp. Desapareix mentre s'escriu, tan bon
    // punt el camp és correcte: si s'esborrés en sortir-ne, el botó «Paga» pujaria sota el ratolí i el clic es perdria.
    // Mai no esborren el que s'ha escrit.
    const QUIN = { 'pg-num': 'targeta', 'pg-exp': 'targeta', 'pg-cvc': 'targeta', 'pg-email': 'email', 'pg-titular': 'titular' };
    Object.keys(QUIN).forEach((id) => {
      el(id).addEventListener('blur', () => {
        if (!el(id).value) return;
        S.tocats.add(id);
        mostraErrors(valida(), [QUIN[id]]);
      });
      el(id).addEventListener('input', () => {
        if (el(id).getAttribute('aria-invalid') === 'true') mostraErrors(valida(), [QUIN[id]]);
      });
    });
    el('pg-form').addEventListener('submit', (e) => { e.preventDefault(); paga('targeta'); });
    el('pg-apple').addEventListener('click', () => paga('apple-pay'));
    el('pg-google').addEventListener('click', () => paga('google-pay'));
  }

  /* ---------- Validació ---------- */

  const luhn = (n) => {
    let suma = 0;
    let doble = false;
    for (let i = n.length - 1; i >= 0; i--) {
      let d = Number(n[i]);
      if (doble) { d *= 2; if (d > 9) d -= 9; }
      suma += d;
      doble = !doble;
    }
    return suma % 10 === 0;
  };

  // Torna { email, titular, targeta: [missatges], camps: { 'pg-num': true… } (camps de la targeta amb error) }
  function valida() {
    const e = { targeta: [], camps: {} };
    const t = (id, text) => { if (!S.tocats.has(id) && !S.totsTocats) return; e.targeta.push(text); e.camps[id] = true; };
    const email = el('pg-email').value.trim();
    if (!email) e.email = 'Escriu el teu correu: t’hi enviem la confirmació.';
    else if (M.validaClient(Object.assign({}, S.comanda.client, { email })).errors.email) e.email = 'A aquest correu li falta alguna cosa. Ha de ser com nom@exemple.com.';
    if (!el('pg-titular').value.trim()) e.titular = 'Escriu el nom que surt a la targeta.';
    const num = el('pg-num').value.replace(/\s/g, '');
    if (!num) t('pg-num', 'Escriu el número de la targeta.');
    else if (num.length < 13 || !luhn(num)) t('pg-num', 'Aquest número de targeta no és correcte. Revisa’l.');
    const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(el('pg-exp').value);
    if (!m) t('pg-exp', 'Posa la caducitat així: 08/28.');
    else if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) t('pg-exp', 'Aquesta targeta ja ha caducat.');
    if (!/^\d{3,4}$/.test(el('pg-cvc').value)) t('pg-cvc', 'El CVC són les xifres de seguretat: 3 al darrere (4 al davant, a les American Express).');
    return e;
  }

  function mostraErrors(e, quins) {
    const posa = (caixa, err, text, inputs) => {
      el(caixa).classList.toggle('pg-mal', !!text);
      el(err).hidden = !text;
      el(err).innerHTML = text || '';
      inputs.forEach((id) => (text ? el(id).setAttribute('aria-invalid', 'true') : el(id).removeAttribute('aria-invalid')));
    };
    if (quins.includes('email')) posa('c-email', 'pg-email-err', e.email && esc(e.email), ['pg-email']);
    if (quins.includes('titular')) posa('c-titular', 'pg-titular-err', e.titular && esc(e.titular), ['pg-titular']);
    if (quins.includes('targeta')) {
      posa('c-targeta', 'pg-targeta-err', e.targeta.length && e.targeta.map((t) => `<span>${esc(t)}</span>`).join(''), []);
      ['pg-num', 'pg-exp', 'pg-cvc'].forEach((id) => (e.camps[id] ? el(id).setAttribute('aria-invalid', 'true') : el(id).removeAttribute('aria-invalid')));
    }
  }

  /* ---------- Pagar ---------- */

  function avis(text) {
    el('pg-avis').textContent = text;
    el('pg-avis').hidden = false;
  }

  function ocupat(si, boto) {
    S.pagant = si;
    ['pg-paga', 'pg-apple', 'pg-google'].forEach((id) => {
      const b = el(id);
      b.disabled = si;
      b.setAttribute('aria-busy', si && b === boto ? 'true' : 'false');
    });
  }

  function paga(metode) {
    if (S.pagant) return;
    S.metode = metode;
    el('pg-avis').hidden = true;
    const targeta = metode === 'targeta';
    S.totsTocats = true; // en pagar, es miren tots els camps
    const e = valida();
    // Amb Apple Pay o Google Pay, la cartera ja porta la targeta i el nom: només cal el correu
    const quins = targeta ? ['email', 'targeta', 'titular'] : ['email'];
    mostraErrors(e, quins);
    const primer = quins.map((q) => (q === 'targeta' ? (e.targeta.length ? 'pg-num' : null) : e[q] ? 'pg-' + q : null)).find(Boolean);
    if (primer) { el(primer).focus(); return; }
    // Sense connexió: el codi sap segur que no s'ha enviat res
    if (navigator.onLine === false) { avis('No s’ha pogut fer el pagament. No t’hem cobrat res. Torna-ho a provar.'); return; }
    const boto = el(targeta ? 'pg-paga' : metode === 'apple-pay' ? 'pg-apple' : 'pg-google');
    ocupat(true, boto);
    const num = targeta ? el('pg-num').value.replace(/\s/g, '') : '';
    setTimeout(() => {
      ocupat(false);
      if (TARGETES_REBUTJADES.includes(num)) { avis('El banc no ha acceptat la targeta. No t’hem cobrat res. Prova-ho amb una altra o truca’ns al ' + TEL + '.'); return; }
      if (TARGETES_NO_CONFIRMADES.includes(num)) { avis('No hem pogut confirmar el pagament. Abans de tornar-ho a provar, truca’ns al ' + TEL + ' i ho comprovem.'); return; }
      acaba();
    }, ESPERA);
  }

  function acaba() {
    const c = S.comanda;
    const client = Object.assign({}, c.client, { email: el('pg-email').value.trim() });
    const r = M.crearComanda({ lots: c.lots, producte: c.producte, client, metodePagament: S.metode, enviament: c.enviament || undefined, subscripcio: c.subscripcio || undefined, avisosTanda: c.avisosTanda !== false });
    if (!r.ok) { avis('No s’ha pogut fer el pagament. No t’hem cobrat res. Torna-ho a provar.'); return; }
    C.comandaEnCurs.esborra();
    confirmacio(r, client);
  }

  /* ---------- Confirmació ---------- */

  function confirmacio(r, client) {
    const c = r.comanda;
    const a = r.assignacio;
    const total = C.importTotal(c);
    let tanda = 'Et trucarem per quedar el dia que te la portem.';
    let ultima = '';
    if (a.tandaId) {
      const t = M.tanda(a.tandaId);
      tanda = t && t.ocupacio.plena
        ? `Amb la teva comanda, la <strong>tanda ${a.tandaNumero}</strong> queda plena i tancada. Ara la preparem.`
        : `Va a la <strong>tanda ${a.tandaNumero}</strong>, que es tanca com a molt tard el ${C.dataCurta(a.dataLimit)}.`;
      ultima = ` ${c.lliurament === 'recull' ? 'La podràs recollir a Sort' : 'La tens a casa'} uns ${C.diesEntrega()} dies després que es tanqui la tanda. Quan surti, t’escriurem amb el dia exacte.`;
    }
    const items = [`Comanda <strong>${esc(c.id)}</strong>`, `${esc(C.producte(c.producte, c.lots))} · ${esc(total)} pagats`, tanda, c.lliurament === 'recull' ? `El recolliràs a Sort: ${esc(D.enviament.rodalies.recollida.lloc)} · ${esc(D.enviament.rodalies.recollida.horari)}` : `T’arriba a: ${esc(client.adreca)}, ${esc(client.cp)} ${esc(client.poblacio)}`];
    if (c.subscripcio) items.push(esc(liniaSub(c.subscripcio, c.lots)));
    const vista = document.createElement('div');
    vista.className = 'pg-confirmacio';
    vista.innerHTML = `
      <div class="pg-fet">${ICONA_FET}</div>
      <h2 id="pg-conf-titol" tabindex="-1">Gràcies, ${esc(client.nom)}. La comanda és pagada.</h2>
      <ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>
      <p>T’hem enviat la confirmació a ${esc(client.email)}.${ultima}</p>
      <p>Si has de canviar alguna cosa, truca’ns al ${esc(TEL)}.</p>
      <p><a class="pg-paga" href="${esc(C.ambPresentacio('index.html'))}"><span>Torna a Casa Camp</span></a></p>`;
    torna.href = C.ambPresentacio('index.html');
    el('pg-titol').textContent = 'Pagament fet';
    const eti = resum.querySelector('.pg-eti');
    if (eti) eti.textContent = 'Pagat a Casa Camp';
    canvia(vista);
  }

  // El pagament marxa cap a l'esquerra i la confirmació entra per la dreta, alhora, sense rebot (idea H, 04/11/2026)
  function canvia(vista) {
    const fi = () => { cos.replaceChildren(vista); scrollTo(0, 0); el('pg-conf-titol').focus(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !cos.animate) { fi(); return; }
    const opt = { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' };
    const surt = cos.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(-40px)', opacity: 0 }], Object.assign({ fill: 'forwards' }, opt));
    surt.onfinish = () => {
      fi();
      surt.cancel();
      cos.animate([{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], opt);
    };
  }

  /* ---------- Inici ---------- */

  function inici() {
    if (!M.presentacio()) {
      missatge('De moment, les comandes per telèfon', 'Encara no cobrem per la web. Truca’ns i digues-nos què vols.', true);
      return;
    }
    const c = C.comandaEnCurs.llegeix();
    if (!c || !D.productes[c.producte]) {
      missatge('No hi ha cap comanda per pagar', 'Potser ja l’has pagada o ha passat massa estona. Torna a la web per fer-ne una.', false);
      return;
    }
    const v = M.validaClient(c.client, { sensAdreca: !!c.enviament && c.enviament.mode === 'recollida' && D.zonaDeCP(c.client.cp) === 'rodalies' });
    if (!v.ok || !String(c.client.cognoms || '').trim()) {
      missatge('Falten dades de l’entrega', 'Torna a la pàgina de compra i revisa-les.', false);
      torna.href = C.ambPresentacio('compra.html');
      return;
    }
    // Fora de Catalunya no es cobra res, ni el lot ni les canals
    const zonaCP = D.costEnviament(c.client.cp);
    if (zonaCP.valid && !zonaCP.enviable) {
      missatge('De moment no enviem fora de Catalunya', 'Truca’ns i en parlem.', true);
      return;
    }
    // L'enviament ha de ser definitiu (res no es cobra sense saber com i quant)
    if (D.productes[c.producte].ocupaPlaces && !D.costEnviament(c.client.cp, Object.assign({ lots: c.lots }, c.enviament)).complet) {
      missatge('Falten dades de l’entrega', 'Torna a la pàgina de compra i tria com vols rebre el lot.', false);
      torna.href = C.ambPresentacio('compra.html');
      return;
    }
    S.comanda = c;
    pintaPagament(c, pintaResum(c));
  }
  inici();
})();
