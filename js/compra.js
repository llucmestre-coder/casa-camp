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

  // `mode` ('recollida' | 'casa') i `poble`: l'enviament a les rodalies, res triat d'entrada. `sub`: la subscripció, apagada
  // d'entrada. `noAvis`: la casella de la P45 (desmarcada).
  const S = { producte: 'lot', lots: 1, opener: null, mode: null, poble: null, sub: { on: false, freq: D.subscripcio.frequenciaPerDefecte }, noAvis: false, cpAnterior: '', poblacioAuto: '' };

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

  const opcionsEnviament = () => ({ mode: S.mode, poble: S.poble, lots: S.lots });
  // Recollida a Sort (zona de Sort): el full no demana l'adreça ni les notes d'entrega
  const recollidaSort = () => !aPart() && S.mode === 'recollida' && D.zonaDeCP(el('f-cp').value) === 'rodalies';

  function etiquetes() {
    const r = C.resumCompra(S.producte, S.lots, el('f-cp').value, opcionsEnviament());
    r.concepte = S.producte === 'lot' ? `Lots (${S.lots} × ${r.unitari})` : NOMS_CANAL[S.producte];
    return r;
  }

  /* ---------- Enviament segons el codi postal (variant B del prototip, 07/11/2026) ---------- */

  const TXT_TRUCA = `De moment no enviem fora de Catalunya. Truca’ns al <a href="${TEL_HREF}">${esc(TEL)}</a> i en parlem.`;

  // Les tres sortides: rodalies (interruptor «Recullo a Sort | A casa» i, si el CP és de diversos pobles, píndoles amb el
  // preu a dins), resta de Catalunya (una frase amb el preu) i fora (frase amb el telèfon).
  function htmlEnviament() {
    const cp = el('f-cp').value;
    const env = D.costEnviament(cp, opcionsEnviament());
    if (!env.valid) return cp.trim() === '' ? '<p class="nota">Posa el codi postal i et diem què costa portar-te-ho.</p>' : '';
    if (!env.enviable) return `<p class="nota entra">${TXT_TRUCA}</p>`;
    if (env.zona === 'catalunya') return `<p class="nota entra">Enviem a tota Catalunya, en fred, a <strong>${esc(env.etiqueta)} per caixa</strong>.</p>`;
    const rec = D.enviament.rodalies.recollida;
    const radio = (valor, text) => `<label><input type="radio" name="env-mode" value="${valor}"${S.mode === valor ? ' checked' : ''}>${text}</label>`;
    let h = `<div class="entra"><div class="segment" role="radiogroup" aria-label="Com vols rebre el lot">${radio('recollida', 'Recullo a ' + esc(rec.nom))}${radio('casa', 'A casa')}</div>`;
    if (S.mode === 'recollida') {
      h += `<p class="nota"><strong>Sense cost.</strong> ${esc(rec.lloc)} · ${esc(rec.horari)}</p>`;
    } else if (S.mode === 'casa') {
      if (env.pobles.length > 1) {
        h += `<fieldset class="pindoles"><legend class="legend-p">Quin poble?</legend>${env.pobles.map((p) => `<label class="pindola"><input type="radio" name="env-poble" value="${esc(p.nom)}"${S.poble === p.nom ? ' checked' : ''}>${esc(p.nom)}<small>${esc(p.etiqueta)}</small></label>`).join('')}</fieldset>`;
      }
      h += '<p class="nota">Te’l portem nosaltres, en fred, amb un preu fix per poble.</p>';
    } else {
      h += '<p class="nota">Tria com vols rebre el lot per poder continuar.</p>';
    }
    return h + '</div>';
  }

  // Repinta una caixa només si l'HTML ha canviat, i el focus (si hi era dins) torna al mateix control
  function repinta(caixa, h) {
    if (caixa.dataset.h === h) return;
    const a = document.activeElement;
    const clau = a && caixa.contains(a) && a.name ? [a.name, a.value] : null;
    caixa.dataset.h = h;
    caixa.innerHTML = h;
    if (clau) {
      const nou = Array.from(caixa.querySelectorAll('input')).find((i) => i.name === clau[0] && i.value === clau[1]);
      if (nou) nou.focus({ focusVisible: true });
    }
  }

  // L'adreça i les notes només surten quan ens han de portar la comanda: a casa (rodalies) o a la resta de Catalunya
  // (i, per a les canals, a qualsevol codi postal de Catalunya). Primer va el codi postal i la tria d'enviament.
  function adrecaVisible() {
    const e = D.costEnviament(el('f-cp').value, opcionsEnviament());
    if (!e.valid || !e.enviable) return false;
    return aPart() || e.zona === 'catalunya' || S.mode === 'casa';
  }

  function renderEnviament() {
    const env = D.costEnviament(el('f-cp').value, opcionsEnviament());
    repinta(el('env-tria'), aPart() ? (env.valid && !env.enviable ? `<p class="nota entra">${TXT_TRUCA}</p>` : '') : htmlEnviament());
    // «Continua»: desactivat fins que es tria (rodalies) i, fora de Catalunya, passa a «Truca’ns»
    const fora = env.valid && !env.enviable;
    const falta = !aPart() && env.valid && env.enviable && !env.complet;
    el('continua').hidden = fora;
    el('truca').hidden = !fora;
    el('continua').disabled = falta;
    el('avis-tanda').hidden = fora;
    const sense = !adrecaVisible();
    el('camp-adreca').hidden = sense;
    el('camp-notes').hidden = sense;
    if (sense) posaError('adreca', null);
  }

  /* ---------- Subscripció (variant B del prototip): només per al lot, apagada d'entrada ---------- */

  function renderSubscripcio() {
    const caixa = el('sub-b');
    const hi = S.producte === 'lot' && M.subscripcioActiva();
    caixa.hidden = !hi;
    if (!hi) return;
    const on = S.sub.on;
    const f = S.sub.freq;
    caixa.classList.toggle('on', on);
    el('sub-on').checked = on;
    el('sub-text').textContent = `T’apartem ${S.lots === 1 ? 'un lot' : S.lots + ' lots'} cada ${f} setmanes. ${S.lots === 1 ? 'El primer el pagues ara' : 'El primer cop els pagues ara'}; els següents te’ls cobrem quan es tanca cada tanda. Ho pots aturar quan vulguis.`;
    el('sub-detall').hidden = !on;
    if (!on) return;
    repinta(el('sub-freq'), D.subscripcio.frequenciesSetmanes.map((v) => `<label class="pindola"><input type="radio" name="sub-freq" value="${v}"${f === v ? ' checked' : ''}>${v} setmanes</label>`).join(''));
    const r = M.properesEntregues(f, S.lots, 3);
    el('sub-dates').innerHTML = r.ok ? `Les properes tandes es tanquen: <strong>${r.entregues.map((x) => esc(C.dataMini(x.dataLimit))).join(' · ')}</strong>` : '';
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
    renderSubscripcio();
    renderDesglos();
  }

  // Amb el lot recurrent encès, sota el total: què es paga avui i què es cobrarà a cada tanda següent
  function liniaRecurrent(e) {
    let p = el('d-recurrent');
    if (!p) {
      p = document.createElement('p');
      p.id = 'd-recurrent';
      p.className = 'nota-recurrent';
      el('desglos').appendChild(p);
    }
    const hi = S.producte === 'lot' && M.subscripcioActiva() && S.sub.on && !!e.total && !aPart();
    p.hidden = !hi;
    p.textContent = hi ? `Avui pagues ${e.total}. A cada tanda següent, ${e.total} (${C.lots(S.lots)}${e.env.lliurament === 'recull' ? '' : ' + enviament'}).` : '';
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
      if (e.env.valid && !e.env.enviable) { env = 'No s’hi envia'; nota = ''; }
    } else if (e.env.valid) {
      if (!e.env.enviable) {
        env = 'No s’hi envia';
      } else if (!e.env.complet) {
        env = '—'; // la frase que diu què falta triar és al costat de la tria, no aquí
      } else if (e.env.lliurament === 'recull') {
        env = '0 €';
      } else if (e.env.lliurament === 'repartiment-propi') {
        env = e.env.etiqueta;
      } else {
        env = e.env.etiqueta;
        nota = e.env.caixes > 1 ? `Te’l portem en ${e.env.caixes} caixes.` : '';
      }
    }
    Moviment.text(el('d-env'), env, mode);
    Moviment.text(el('d-total'), (aPart() && e.env.valid && !e.env.enviable ? null : e.total) || '—', mode);
    liniaRecurrent(e);
    el('d-nota').textContent = nota;
    renderEnviament();
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
    adreca: recollidaSort() ? '' : el('f-adreca').value,
    cp: el('f-cp').value,
    poblacio: el('f-poblacio').value,
    notes: recollidaSort() ? '' : el('f-notes').value,
  });

  function erroresClient() {
    const v = valorsClient();
    const r = M.validaClient(v, { sensAdreca: !adrecaVisible() });
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
        // Un altre codi postal = una altra tria d'enviament: es torna a començar (res triat d'entrada)
        const net = input.value.replace(/\s+/g, '');
        if (net !== S.cpAnterior) {
          S.cpAnterior = net;
          S.mode = null;
          S.poble = null;
        }
        ajustaPoblacio();
        renderDesglos('balanca');
      }
    });
  });

  // La població de les rodalies s'omple sola (i només si el comprador no hi ha escrit res d'ell)
  function ajustaPoblacio() {
    const env = D.costEnviament(el('f-cp').value, opcionsEnviament());
    const p = env.zona === 'rodalies' ? env.poble || (env.pobles.length === 1 ? env.pobles[0].nom : '') : '';
    const camp = el('f-poblacio');
    if (p && (camp.value.trim() === '' || camp.value === S.poblacioAuto)) {
      camp.value = p;
      S.poblacioAuto = p;
    } else if (!p && S.poblacioAuto && camp.value === S.poblacioAuto) {
      // Un altre codi postal: el poble que s'havia posat sol ja no hi val
      camp.value = '';
      S.poblacioAuto = '';
    }
  }

  // Enviament, avisos i subscripció (tot canvia el desglossament; res no es desa fins a pagar)
  el('env-tria').addEventListener('change', (e) => {
    if (e.target.name === 'env-mode') {
      S.mode = e.target.value;
      if (S.mode === 'recollida') S.poble = null;
    } else if (e.target.name === 'env-poble') {
      S.poble = e.target.value;
    } else return;
    ajustaPoblacio();
    renderDesglos('balanca');
  });
  el('sub-on').addEventListener('change', (e) => {
    S.sub.on = e.target.checked;
    renderSubscripcio();
    liniaRecurrent(etiquetes());
  });
  el('sub-freq').addEventListener('change', (e) => {
    if (e.target.name !== 'sub-freq') return;
    S.sub.freq = Number(e.target.value);
    renderSubscripcio();
  });
  el('f-no-avisos').addEventListener('change', (e) => {
    S.noAvis = e.target.checked;
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
    // La subscripció només va amb el lot, i només si està encesa; la P45 (avisos de tanda nova) va amb la comanda
    const subscripcio = S.producte === 'lot' && S.sub.on && M.subscripcioActiva() ? { frequenciaSetmanes: S.sub.freq } : null;
    const ok = C.comandaEnCurs.desa({ producte: S.producte, lots: S.lots, client: valorsClient(), enviament: aPart() ? null : { mode: S.mode, poble: S.poble }, subscripcio, avisosTanda: !S.noAvis });
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
    S.cpAnterior = String(c.client.cp || '').replace(/\s+/g, '');
    S.mode = c.enviament ? c.enviament.mode : null;
    S.poble = c.enviament ? c.enviament.poble : null;
    S.sub = { on: !!c.subscripcio, freq: c.subscripcio ? c.subscripcio.frequenciaSetmanes : D.subscripcio.frequenciaPerDefecte };
    S.noAvis = c.avisosTanda === false;
    el('f-no-avisos').checked = S.noAvis;
    obre(c.producte, null, c.lots);
  }

  if (M.presentacio()) el('continua').textContent = 'Continua al pagament';
  recuperaComanda();

  window.CompraFull = { obre, tanca };
})();
