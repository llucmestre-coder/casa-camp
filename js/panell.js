/* Casa Camp — panell de comandes (mòbil primer). Vistes: Avui (la llista de feina), Tandes, Comandes (amb fitxa),
   Transport, Correus i Configuració, més les dels mòduls que hi hagi encesos (panell/moduls.js). Llegeix i escriu
   l'estat compartit de js/magatzem.js; el canvi d'una altra pestanya arriba sol (esdeveniment `storage`).
   Textos: PLA-COPY.md §3 i §4. Entrada: només amb `?presentacio` (maqueta). */
(function () {
  'use strict';

  const D = window.CassovallDades;
  const M = window.CassovallMagatzem;
  // Les dates del panell amb l'apòstrof tipogràfic («18 d’octubre»): js/comu.js és comú amb la web i el porta recte
  const C = window.CassovallModulsComu && window.CassovallModulsComu.tipografia ? window.CassovallModulsComu.tipografia(window.CasaCamp) : window.CasaCamp;
  const R = window.CassovallModuls; // registre de mòduls (panell/moduls.js)
  const COMU = window.CassovallModulsComu; // ajudes dels mòduls (panell/moduls-comu.js): «d’Eulàlia»
  const BASE = window.CassovallModulsBase || {}; // el que exporta panell/moduls.js (p. ex. `quanEsTanca`)
  const PWA = window.CassovallPWA || null; // service worker, instal·lació i avisos (panell/pwa.js)
  const esc = C.esc;
  const de = (x) => COMU.de(String(x));
  const pl = COMU.plural; // la funció de plurals de tot el panell (moduls-comu.js) // «de 26», «d’11»: com sona la xifra
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const id = (x) => document.getElementById(x);

  const TEL = D.contacte.telefons[0];
  const ESTATS = R.ESTATS;
  const PAGAMENTS = { targeta: 'Targeta', 'apple-pay': 'Apple Pay', 'google-pay': 'Google Pay', pendent: 'Per decidir', efectiu: 'En efectiu', enllac: 'Enllaç de pagament' };
  // El cobrament és de la comanda (no d'un mòdul): els quatre estats es veuen sempre; el mòdul de pagaments hi actua
  const PAG_ESTATS = { pagat: 'Pagat', recurrent: 'Pagat', pendent: 'Per cobrar', fallit: 'Cobrament fallit', retornat: 'Retornat' };
  const adrecaText = (k) => [k.adreca, [k.cp, k.poblacio].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const enviamentTextComanda = (c) => (c.lliurament === 'recull' ? 'Recollida a la granja' : C.importEnviament(c));
  const ORIGENS = { web: 'Web', telefon: 'Telèfon', pagament: 'Pagaments', transportista: 'Transportista', escorxador: 'Escorxador', factures: 'Factures', client: 'Client', gestoria: 'Gestoria', panell: 'Tu' };
  // Les vistes de sempre; les dels mòduls les dóna `R.vistes()`. `instalar` no és a la navegació: s'hi va des de Configuració.
  const VISTES = ['avui', 'tandes', 'comandes', 'transport', 'correus', 'configuracio', 'instalar'];
  const filtres = { nova: false, tanda: '', estat: '', cerca: '' };
  let correusVisibles = 40;
  let tandaTransport = '';
  let flaixPendent = null; // missatge que s'ensenya en el proper pintat (p. ex. després del simulador)

  const nomComplet = (c) => (c.nom + ' ' + c.cognoms).trim();
  const lotsText = (n) => C.lots(n);

  /* ---------- Entrada ---------- */

  const SESSIO = 'cassovall:panell-obert';
  const llegeixSessio = () => {
    try {
      return window.sessionStorage.getItem(SESSIO) === '1';
    } catch (e) {
      return false;
    }
  };
  const desaSessio = () => {
    try {
      window.sessionStorage.setItem(SESSIO, '1');
    } catch (e) {
      /* sense sessionStorage: es torna a demanar «Entra» en recarregar */
    }
  };

  /* ---------- Vista mòbil (només per ensenyar el panell des de l'ordinador) ---------- */

  const VISTA_MOBIL = 'cassovall:vista-mobil';
  const dinsMarc = /(^|[?&])marc=mobil(&|$)/.test(location.search);
  let marcActiu = false;
  const llegeixVistaMobil = () => {
    try {
      return window.localStorage.getItem(VISTA_MOBIL) === '1';
    } catch (e) {
      return false;
    }
  };
  const desaVistaMobil = (on) => {
    try {
      window.localStorage.setItem(VISTA_MOBIL, on ? '1' : '0');
    } catch (e) {
      /* sense localStorage: no es recorda i comença apagat */
    }
  };
  function posaVistaMobil(on) {
    const b = id('vista-mobil');
    const marc = id('marc-mobil');
    if (on === marcActiu) return;
    if (!on) {
      // El hash de dins del marc es manté en apagar l'interruptor
      try {
        const f = marc.querySelector('iframe');
        const h = f && f.contentWindow.location.hash;
        if (h && h !== location.hash) location.hash = h;
      } catch (e) {
        /* sense accés al marc: es queda el hash actual */
      }
      marc.innerHTML = '';
    } else {
      const f = document.createElement('iframe');
      f.title = 'Panell en vista mòbil';
      f.src = location.pathname + '?presentacio&marc=mobil' + location.hash;
      marc.appendChild(f);
    }
    marcActiu = on;
    document.body.classList.toggle('vista-mobil-activa', on);
    b.setAttribute('aria-checked', String(on));
    if (!on) pinta();
  }
  function iniciaVistaMobil() {
    const b = id('vista-mobil');
    if (dinsMarc) {
      document.body.classList.add('dins-marc');
      return;
    }
    b.addEventListener('click', () => {
      const on = !marcActiu;
      desaVistaMobil(on);
      posaVistaMobil(on);
    });
    if (llegeixVistaMobil() && window.matchMedia('(min-width: 700px)').matches) posaVistaMobil(true);
  }

  let dinsApp = false;
  function arrenca() {
    const acces = id('acces');
    if (!M.presentacio()) {
      acces.hidden = false;
      id('acces-text').textContent = 'Aquest panell no és obert.';
      return;
    }
    if (llegeixSessio()) return entra();
    acces.hidden = false;
    id('acces-text').textContent = '';
    const b = id('entra');
    b.hidden = false;
    b.addEventListener('click', () => {
      desaSessio();
      entra();
    });
    b.focus();
  }

  function entra() {
    id('acces').hidden = true;
    id('app').hidden = false;
    dinsApp = true;
    id('app-logo').href = C.ambPresentacio('../');
    if (!C.desaDades()) {
      const a = id('app-avis');
      a.textContent = 'Aquest navegador no deixa desar dades: només es veuen les comandes d’exemple, no les que entrin des de la web.';
      a.hidden = false;
    }
    window.addEventListener('hashchange', pinta);
    iniciaAvisos();
    M.subscriu((info) => {
      if (!dinsApp) return;
      avisaNous(); // l'avís del sistema surt encara que no es repinti (la pestanya pot estar amagada)
      // Un canvi d'una altra pestanya no ha de trepitjar el que s'està escrivint
      if (info.origen === 'extern' && (id('dialeg').open || (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)))) return;
      if (info.origen === 'local' && info.tipus === 'vista') return;
      pinta();
    });
    if (PWA) window.addEventListener('pwa-canvi', () => { if (['instalar', 'configuracio'].includes(ruta().vista)) pinta(); });
    iniciaSimulador();
    iniciaVistaMobil();
    iniciaMenu();
    pinta();
  }

  /* ---------- Menú de tres barres (mòbil, < 700 px; en Lluc, 07/11/2026) ----------
     Obre la barra lateral amb totes les seccions. Es tanca en triar-ne una, amb Esc o tocant fora. Tancada al mòbil, la
     barra és inert (el teclat no hi entra); a l'escriptori la navegació és la de sempre i no es toca. */
  const mobil = window.matchMedia('(max-width: 699px)');
  function posaMenu(obert, { focus = true } = {}) {
    const nav = $('.app-nav');
    const boto = id('menu-obre');
    document.body.classList.toggle('menu-obert', obert);
    boto.setAttribute('aria-expanded', String(obert));
    nav.inert = mobil.matches && !obert;
    if (obert) {
      nav.setAttribute('role', 'dialog');
      nav.setAttribute('aria-modal', 'true');
      if (focus) {
        const actual = $('a[aria-current="page"]', nav) || $('a', nav);
        setTimeout(() => actual && actual.focus(), 30);
      }
    } else {
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      if (focus && mobil.matches) boto.focus();
    }
  }
  function iniciaMenu() {
    const nav = $('.app-nav');
    id('menu-obre').addEventListener('click', () => posaMenu(true));
    id('menu-tanca').addEventListener('click', () => posaMenu(false));
    id('menu-vel').addEventListener('click', () => posaMenu(false));
    nav.addEventListener('click', (e) => { if (e.target.closest('a') && mobil.matches) posaMenu(false, { focus: false }); });
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('menu-obert')) return;
      if (e.key === 'Escape') { e.preventDefault(); posaMenu(false); return; }
      if (e.key !== 'Tab') return;
      // El focus es queda dins de la barra lateral
      const f = $$('a, button', nav).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    const canvi = () => posaMenu(false, { focus: false });
    if (mobil.addEventListener) mobil.addEventListener('change', canvi);
    posaMenu(false, { focus: false });
  }

  /* ---------- Rutes ---------- */

  function ruta() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (h.startsWith('comanda=')) return { vista: 'comandes', comanda: h.slice(8) };
    if (h.startsWith('tanda=')) return { vista: 'tandes', tanda: h.slice(6) };
    // Les vistes dels mòduls poden portar un paràmetre: `#clients=t600000101`, `#factures=CC-1001`
    const amb = /^([a-z][a-z0-9-]*)=(.+)$/.exec(h);
    if (amb && R.vista(amb[1])) return { vista: amb[1], param: amb[2] };
    return { vista: VISTES.includes(h) || R.vista(h) ? h : 'avui' };
  }

  // Les vistes dels mòduls encesos, entre «Transport/Correus» i «Configuració»
  function pintaNavegacio() {
    const nav = $('.app-nav');
    $$('.nav-moduls', nav).forEach((e) => e.remove());
    const configuracio = $('[data-vista="configuracio"]', nav);
    // Les vistes dels mòduls van en una fila a part (a mòbil, una sola línia que es desplaça)
    const vistes = R.vistes();
    if (!vistes.length) return;
    const fila = document.createElement('span');
    fila.className = 'nav-moduls';
    for (const v of vistes) {
      const a = document.createElement('a');
      a.href = '#' + v.id;
      a.dataset.vista = v.id;
      a.dataset.modul = v.modul;
      a.textContent = v.nom;
      fila.appendChild(a);
    }
    nav.insertBefore(fila, configuracio);
  }

  function pinta() {
    if (marcActiu) return; // el panell es veu dins del marc; el marc pinta pel seu compte
    const r = ruta();
    pintaNavegacio();
    $$('.app-baix a').forEach((a) => (a.dataset.vista === r.vista ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $$('.app-nav a').forEach((a) => {
      const actual = a.dataset.vista === r.vista;
      if (actual) {
        a.setAttribute('aria-current', 'page');
        const nav = a.closest('.app-nav');
        const fila = a.parentElement;
        if (fila !== nav) fila.scrollLeft = Math.max(0, a.offsetLeft - 16);
        else nav.scrollLeft = Math.max(0, a.offsetLeft - 16);
      } else a.removeAttribute('aria-current');
    });
    const v = id('vista');
    const propia = { avui, tandes, comandes, transport, correus, configuracio, instalar }[r.vista];
    const fet = r.comanda ? fitxa(r.comanda) : r.tanda ? vistaTanda(r.tanda) : propia ? propia() : vistaDeModul(r.vista, r.param);
    v.innerHTML = fet.html;
    if (fet.despres) fet.despres(v);
    if (flaixPendent) {
      flaix(flaixPendent);
      flaixPendent = null;
    }
  }

  // La vista d'un mòdul: ell posa el contingut (`render(ctx)` torna { html, despres? })
  function vistaDeModul(vistaId, param) {
    const x = R.vista(vistaId);
    let fet = null;
    try {
      fet = x && x.render(R.ctx, param);
    } catch (e) {
      console.error('Mòdul «' + (x && x.modul) + '»: ' + e.message);
    }
    return fet && typeof fet.html === 'string' ? fet : { html: '<h2>Aquesta vista no es pot mostrar</h2>' };
  }

  // Les seccions que els mòduls encesos posen dins d'una vista (`on`: 'tanda', 'comanda', 'comandes', 'avui', 'configuracio')
  function seccionsHTML(on, objecte) {
    return R.seccions(on)
      .map((s) => {
        let h = '';
        try {
          h = s.html(R.ctx, objecte);
        } catch (e) {
          console.error('Mòdul «' + s.modul + '»: ' + e.message);
        }
        return h ? `<div class="seccio-modul" data-modul-seccio="${esc(s.modul)}" data-seccio="${esc(s.id)}">${h}</div>` : '';
      })
      .join('');
  }
  function seccionsDespres(v, on, objecte) {
    for (const s of R.seccions(on)) {
      const el = $(`[data-modul-seccio="${s.modul}"][data-seccio="${s.id}"]`, v);
      if (!el || typeof s.despres !== 'function') continue;
      try {
        s.despres(el, R.ctx, objecte);
      } catch (e) {
        console.error('Mòdul «' + s.modul + '»: ' + e.message);
      }
    }
  }

  function flaix(text) {
    const f = $('#vista .flaix');
    if (f) {
      f.textContent = text;
      f.hidden = false;
    }
  }
  const caixaFlaix = '<p class="flaix" role="status" hidden></p>';

  /* ---------- Textos de les tandes i de les comandes ---------- */

  const dataCurta = C.dataCurta;
  const tandaDeComanda = (c) => (c.tandaNumero ? 'tanda ' + c.tandaNumero : 'a part');
  const barraHTML = (percent, etiqueta) => `<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="${esc(etiqueta)}"><i data-amplada="${percent}"></i></div>`;
  const fixaBarres = (arrel) => $$('[data-amplada]', arrel).forEach((i) => (i.style.width = i.dataset.amplada + '%'));
  const estatTanda = (t) => (t.vencuda ? 'Oberta · data límit passada' : ESTATS[t.estat]);
  const enllacTanda = (t) => '#tanda=' + encodeURIComponent(t.id);
  const passosHTML = (t) => {
    const passos = D.estatsTanda
      .map((e) => `<li${e === t.estat ? ' aria-current="step"' : ''} class="${D.estatsTanda.indexOf(e) < D.estatsTanda.indexOf(t.estat) ? 'fet' : ''}">${ESTATS[e]}</li>`)
      .join('');
    return `<ol class="passos-estat" aria-label="Estat de la tanda ${t.numero}: ${esc(ESTATS[t.estat])}">${passos}</ol>`;
  };

  /* ---------- Avui ---------- */

  /* ---------- Avisos del sistema (mòdul «avisos») ---------- */
  // Quan entra un esdeveniment que té avís (una comanda, una tanda plena…), surt una notificació del sistema.
  // El permís es demana amb un botó (Configuració), mai en carregar. Si el mòdul és apagat, no surt res.
  // A la maqueta només n'hi ha mentre el panell és obert (en una pestanya o a la pantalla d'inici): les comandes
  // arriben pel mateix navegador. A la versió real seria Web Push (servidor).
  let coneguts = null; // ids d'esdeveniments que ja hi eren o que ja han avisat

  function iniciaAvisos() {
    coneguts = new Set(M.esdeveniments().map((ev) => ev.id));
  }

  function avisaNous() {
    if (!coneguts) return;
    const nous = M.esdeveniments().filter((ev) => !coneguts.has(ev.id)).reverse();
    nous.forEach((ev) => coneguts.add(ev.id));
    if (!PWA || !R.actiu('avisos')) return;
    for (const ev of nous) {
      const a = R.avisEsdeveniment(ev);
      if (a) PWA.mostra({ titol: a.titol, cos: a.cos, hash: a.hash, tag: ev.id });
    }
  }

  // La targeta de Configuració que posa el mòdul «avisos» (la declara panell/moduls.js)
  const avisosUI = {
    html() {
      if (!PWA) return '';
      const p = PWA.permis();
      let cos;
      if (p === 'no-suportat') cos = '<p>Aquest navegador no pot mostrar avisos.</p>';
      else if (p === 'denied') cos = '<p>Els avisos estan bloquejats. Els pots tornar a permetre als ajustos del navegador.</p>';
      else if (p === 'granted') cos = '<p>Els avisos estan activats: et sortirà un avís quan entri una comanda o s’ompli una tanda.</p><button type="button" class="boto boto-lleu" data-avisos="prova">Prova un avís</button>';
      else cos = '<p>Quan entri una comanda o s’ompli una tanda, et sortirà un avís al mòbil.</p><button type="button" class="boto" data-avisos="activa">Activa els avisos</button>';
      const ios = p !== 'no-suportat' && PWA.esIOS() && !PWA.instalada() ? '<p class="fila-detall">A l’iPhone només funcionen amb el panell a la pantalla d’inici. <a href="#instalar">Com es fa</a></p>' : '';
      return `<section class="targeta" id="avisos-targeta"><h3>Avisos al mòbil</h3>${cos}${ios}</section>`;
    },
    despres(el) {
      const activa = $('[data-avisos="activa"]', el);
      if (activa) activa.addEventListener('click', async () => { await PWA.demana(); pinta(); });
      const prova = $('[data-avisos="prova"]', el);
      if (prova) prova.addEventListener('click', async () => {
        const fet = await PWA.mostra({ titol: 'Avís de prova', cos: 'Així et sortiran els avisos.', hash: '#avui', tag: 'prova-' + Date.now() });
        flaix(fet ? 'Avís enviat.' : 'No s’ha pogut enviar l’avís.');
      });
    },
  };

  function filaComanda(c, boto) {
    return `<li class="fila">
      <a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}"${boto ? ' tabindex="-1" aria-hidden="true"' : ''}>
        <span class="fila-nom"><strong>${esc(nomComplet(c.client))}</strong>${c.nova ? ' <span class="distintiu">Nova</span>' : ''}</span>
        <span class="fila-detall">${esc(C.producte(c.producte, c.lots))} · ${tandaDeComanda(c)} · ${esc(ESTATS[c.estat])}</span>
      </a>
      ${boto ? `<a class="boto boto-sec" href="#comanda=${encodeURIComponent(c.id)}">Veure<span class="sr-nomes"> la comanda ${esc(COMU.de(nomComplet(c.client)))}</span></a>` : ''}
    </li>`;
  }

  function filaTasca(t) {
    const boto = typeof t.boto.hash === 'string'
      ? `<a class="boto" href="${esc(t.boto.hash)}">${esc(t.boto.text)}</a>`
      : `<button type="button" class="boto" data-tasca="${esc(t.id)}">${esc(t.boto.text)}</button>`;
    // Si la tasca és trucar algú, el telèfon hi és a l'abast (enllaç tel:), al costat del botó que la resol
    const tel = t.tel && /^tel:\+?\d+$/.test(t.tel.href) ? `<a class="boto boto-lleu" href="${esc(t.tel.href)}">${esc(t.tel.text || 'Truca')}</a>` : '';
    return `<li class="tasca tasca-${esc(t.prioritat)}" data-tasca-id="${esc(t.id)}" data-modul="${esc(t.modul)}">
      <span class="fila-text"><span class="fila-nom"><strong>${esc(t.titol)}</strong></span>${t.detall ? `<span class="fila-detall">${esc(t.detall)}</span>` : ''}</span>
      ${tel ? `<span class="accions">${tel}${boto}</span>` : boto}
    </li>`;
  }

  function filaPassat(ev) {
    return `<li class="passat${ev.vist ? '' : ' passat-nou'}">
      <span class="passat-quan">${esc(C.dataHora(ev.data))} · ${esc(ORIGENS[ev.origen] || ev.origen)}${ev.vist ? '' : ' <span class="distintiu">Nou</span>'}</span>
      <span>${esc(R.textEsdeveniment(ev))}</span>
    </li>`;
  }

  function avui() {
    const t = M.tandaActual();
    let tanda = '<p>Encara no hi ha cap tanda oberta.</p>';
    if (t) {
      const o = t.ocupacio;
      // Que la tanda es tanca aviat no és feina (esperar no ho és): es diu aquí, no a «Per fer»
      const quan = BASE.quanEsTanca ? BASE.quanEsTanca(t, avuiISO()) : null;
      tanda = `<a class="targeta targeta-enllac" href="${enllacTanda(t)}">
        <h3>Tanda ${t.numero} · data límit ${dataCurta(t.dataLimit)}</h3>
        ${barraHTML(o.percent, `Lots reservats a la tanda ${t.numero}: ${o.lots} ${de(o.places)}`)}
        <p class="comptador">${o.lots} ${de(o.places)} lots · ${pl(o.lliures, 'en falta #', 'en falten #')}</p>
        ${quan ? `<p class="fila-detall">Es tanca ${esc(quan)}.</p>` : ''}
      </a>`;
    }
    // La llista de feina es calcula cada vegada (R.tasques): surt de les tandes, de les comandes i dels esdeveniments
    const tasques = R.tasques();
    // El que espera algú altre (la carn, la tanda en camí, el comprador que la ve a buscar): a part, amb el botó per quan passi
    const esperes = R.esperes ? R.esperes() : [];
    const passat = M.esdeveniments({ limit: 80 }).filter(R.esdevenimentVisible).slice(0, 8);
    const nous = passat.filter((ev) => !ev.vist).length;
    const html = `<h2>Avui</h2>${caixaFlaix}
      ${t ? tanda : `<section class="targeta">${tanda}</section>`}
      <section id="per-fer">
        <h3>Per fer (${tasques.length})</h3>
        ${tasques.length ? `<ul class="fileres tasques">${tasques.map(filaTasca).join('')}</ul>` : '<p class="buit">Avui no tens res per fer.</p>'}
      </section>
      ${esperes.length ? `<section id="en-espera">
        <h3>En espera (${esperes.length})</h3>
        <p class="fila-detall">No depèn de tu: quan passi, toca el botó.</p>
        <ul class="fileres tasques">${esperes.map(filaTasca).join('')}</ul>
      </section>` : ''}
      <section id="ha-passat">
        <h3>Ha passat</h3>
        ${passat.length ? `<ul class="passats">${passat.map(filaPassat).join('')}</ul>` : '<p class="buit">Encara no ha passat res.</p>'}
        ${nous ? '<button type="button" class="boto boto-lleu" id="passat-vist">Marca-ho tot com a vist</button>' : ''}
      </section>
      ${seccionsHTML('avui')}`;
    return { html, despres: (v) => {
      fixaBarres(v);
      $$('[data-tasca]', v).forEach((b) => b.addEventListener('click', () => {
        const feta = tasques.concat(esperes).find((x) => x.id === b.dataset.tasca);
        if (feta) R.executa(feta, ui);
      }));
      const vist = id('passat-vist');
      if (vist) vist.addEventListener('click', () => M.marcaEsdevenimentsVists());
      seccionsDespres(v, 'avui');
    } };
  }

  /* ---------- Simulador d'esdeveniments (només amb `?presentacio`) ---------- */
  // Per ensenyar la maqueta a la reunió: dispara el que faria el negoci de veritat (una comanda per la web, una tanda
  // plena…) i es veu com reacciona el panell. La llista la fan els mòduls (`esdeveniments.*.simulador`).

  function iniciaSimulador() {
    const b = id('simulador');
    if (!b || !M.presentacio()) return;
    b.hidden = false;
    b.addEventListener('click', obreSimulador);
  }

  function obreSimulador() {
    const sims = R.simulacions();
    // Agrupats per mòdul: són una quinzena de botons i així se saben trobar
    const grups = [];
    for (const s of sims) {
      let g = grups.find((x) => x.modul === s.modul);
      if (!g) grups.push((g = { modul: s.modul, sims: [] }));
      g.sims.push(s);
    }
    const cos = `<p class="fila-detall">Només per ensenyar el panell: fa el mateix que faria el negoci de veritat.</p>
      ${grups.map((g) => `<h3 class="sim-grup">${esc(R.modul(g.modul).nom)}</h3><ul class="simulacions">${g.sims.map((s) => `<li><button type="button" class="boto boto-lleu" data-sim="${esc(s.id)}">${esc(s.text)}</button></li>`).join('')}</ul>`).join('')}`;
    const d = dialeg('Simulador', cos, [{ text: 'Tanca', primari: true }]);
    $$('[data-sim]', d).forEach((b) =>
      b.addEventListener('click', () => {
        const s = R.simulacions().find((x) => x.id === b.dataset.sim);
        d.close();
        if (!s) return;
        let r;
        try {
          r = s.dispara(R.ctx);
        } catch (e) {
          console.error('Simulador «' + s.id + '»: ' + e.message);
          r = { ok: false, text: 'No s’ha pogut fer.' };
        }
        flaixPendent = r.text;
        ui.navega('#avui');
      }),
    );
  }

  /* ---------- Posa-la a la pantalla d'inici ---------- */

  function instalar() {
    const ja = PWA && PWA.instalada();
    const pot = PWA && PWA.instalable();
    const html = `<a class="enrere" href="#configuracio">Configuració</a>
      <h2>Posa-la a la pantalla d’inici</h2>
      ${ja ? '<p class="flaix">Ja la tens a la pantalla d’inici.</p>' : ''}
      <p>Així s’obre com una aplicació, a pantalla completa, i hi tornes d’un toc.</p>
      ${pot ? '<button type="button" class="boto" id="instala">Instal·la-la ara</button>' : ''}
      <section class="targeta"><h3>iPhone</h3><ol class="passos-instal">
        <li>Obre aquesta pàgina amb Safari.</li>
        <li>Toca el botó de compartir: el quadrat amb una fletxa cap amunt.</li>
        <li>Baixa i toca «Afegeix a la pantalla d’inici».</li>
        <li>Toca «Afegeix», a dalt a la dreta.</li>
      </ol></section>
      <section class="targeta"><h3>Android</h3><ol class="passos-instal">
        <li>Obre aquesta pàgina amb Chrome.</li>
        <li>Toca els tres punts de dalt a la dreta.</li>
        <li>Toca «Instal·la l’aplicació» o «Afegeix a la pantalla d’inici».</li>
        <li>Confirma amb «Instal·la».</li>
      </ol></section>
      <p class="buit">A l’iPhone, els avisos només funcionen amb el panell a la pantalla d’inici (cal l’iOS 16.4 o més nou).</p>`;
    return { html, despres: () => {
      const b = id('instala');
      if (b) b.addEventListener('click', () => PWA.installa());
    } };
  }

  /* ---------- Diàlegs ---------- */

  // botons: [{ text, primari, accio(dlg) }]; si accio torna false, el diàleg es queda obert
  function dialeg(titol, cos, botons) {
    const d = id('dialeg');
    d.innerHTML = `<form method="dialog" class="dialeg-form" novalidate>
      <h2 id="dialeg-titol">${esc(titol)}</h2>
      <div class="dialeg-cos">${cos}</div>
      <div class="dialeg-botons">${botons.map((b, i) => `<button type="button" class="boto ${b.primari ? '' : 'boto-lleu'}" data-i="${i}">${esc(b.text)}</button>`).join('')}</div>
    </form>`;
    $$('button[data-i]', d).forEach((b) =>
      b.addEventListener('click', () => {
        const acc = botons[Number(b.dataset.i)].accio;
        if (!acc || acc(d) !== false) d.close();
      }),
    );
    d.addEventListener('close', () => (d.innerHTML = ''), { once: true });
    d.showModal();
    return d;
  }
  const cancela = { text: 'Cancel·la' };

  /* ---------- Tandes ---------- */

  const PAS_TEXT = {
    completa: (num, n) => `Vols tancar la tanda ${num}? S’enviarà un correu a ${n} ${n === 1 ? 'comprador' : 'compradors'} per dir-los que és tancada.`,
    preparacio: (num, n) => `Vols passar la tanda ${num} a «En preparació»? S’enviarà un correu a ${n} ${n === 1 ? 'comprador' : 'compradors'}.`,
    enviada: (num, n) => `Vols marcar la tanda ${num} com a enviada? S’enviarà un correu a ${n} ${n === 1 ? 'comprador' : 'compradors'} per dir-los que és en camí.`,
    entregada: (num, n) => `Vols marcar la tanda ${num} com a entregada? S’enviarà un correu a ${n} ${n === 1 ? 'comprador' : 'compradors'}.`,
  };
  const PAS_SI = { completa: 'Sí, tanca-la', preparacio: 'Sí, passa-la', enviada: 'Sí, és enviada', entregada: 'Sí, és entregada' };

  function tandes() {
    const llista = M.tandes().slice().reverse();
    if (!llista.length) return { html: `<h2>Tandes</h2>${caixaFlaix}<button type="button" class="boto" data-accio="nova">Obre una tanda nova</button><p class="buit">Encara no hi ha cap tanda. Obre’n una per començar a rebre comandes.</p>` };
    const cartes = llista.map((t) => {
      const n = M.comandesDeTanda(t.id).length;
      const o = t.ocupacio;
      return `<a class="targeta tanda targeta-enllac" href="${enllacTanda(t)}">
        <h3>Tanda ${t.numero} · ${esc(estatTanda(t))}</h3>
        <p class="comptador">${o.lots} ${de(o.places)} lots reservats · ${n} ${n === 1 ? 'comprador' : 'compradors'} · data límit ${dataCurta(t.dataLimit)}</p>
        ${barraHTML(o.percent, `Lots reservats a la tanda ${t.numero}: ${o.lots} ${de(o.places)}`)}
      </a>`;
    });
    const html = `<h2>Tandes</h2>${caixaFlaix}<button type="button" class="boto" data-accio="nova">Obre una tanda nova</button><div class="llista-tandes">${cartes.join('')}</div>`;
    return { html, despres: (v) => { fixaBarres(v); $$('[data-accio="nova"]', v).forEach((b) => b.addEventListener('click', obreTandaNova)); } };
  }

  /* ---------- Vista d'una tanda (#tanda=<id>) ---------- */

  const FALTA = {
    'carn-demanada': { text: 'Abans de preparar-la, demana la carn a l’escorxador.', boto: 'Mira què cal demanar', modul: 'escorxador', accio: 'demana' },
    'kg-reals': { text: 'Abans de preparar-la, apunta els kg reals de cada lot.', boto: 'Apunta els kg', modul: 'escorxador', accio: 'kg' },
    etiquetes: { text: 'Abans d’enviar-la, fes les etiquetes dels paquets.', boto: 'Fes les etiquetes', modul: 'enviaments', accio: 'etiquetes' },
  };

  function vistaTanda(tandaId) {
    const t = M.tanda(tandaId);
    const enrere = '<a class="enrere" href="#tandes">Tandes</a>';
    if (!t) return { html: `${enrere}<h2>Tanda</h2><p class="buit">No hem trobat aquesta tanda.</p>` };
    const cs = M.comandesDeTanda(t.id);
    const n = cs.length;
    const o = t.ocupacio;
    // El botó d'estat surt del recorregut (M.estatsPossibles: només el pas que toca, si es pot fer). Si el pas que toca és
    // d'un mòdul (demanar la carn, apuntar els kg, fer les etiquetes), una línia diu què falta i un botó ho fa.
    // Amb paquets o ruta, «Entregada» no es posa a mà: la tanda hi passa sola quan totes les comandes són entregades.
    const pendentsEntrega = M.entregaPendentDeModul(t.id);
    const pas = M.pasTanda(t.id);
    const seg = M.estatsPossibles(t.id)[0] || '';
    const falta = pas && FALTA[pas.id] && R.accio(FALTA[pas.id].modul, FALTA[pas.id].accio) ? FALTA[pas.id] : null;
    const modificable = t.estat !== 'entregada';
    const places = t.estat === 'oberta' || t.estat === 'completa';
    const kg = C.kg(M.lotsQueSurten(t.id) * D.pesLot().kgReals); // el pes del que surt (sense retingudes ni retornades)
    const dl = [
      ['Data límit', dataCurta(t.dataLimit)],
      // La barra va amb la xifra que mesura: sota la línia d'estats es llegia com el progrés de l'entrega (jutge, 02/11)
      ['Lots reservats', `${o.lots} ${de(o.places)}${barraHTML(o.percent, `Lots reservats a la tanda ${t.numero}: ${o.lots} ${de(o.places)}`)}`],
      ['Pes', `${kg} kg`],
      ['Compradors', String(n)],
      ['Import dels lots', esc(D.preuProducte('lot', o.lots).etiqueta)],
    ].map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    const html = `${enrere}
      <h2>Tanda ${t.numero} <span class="estat-tanda">· ${esc(ESTATS[t.estat])}</span></h2>
      ${caixaFlaix}
      ${t.vencuda ? '<p class="avis-tanda no-imprimeix">La data límit ja ha passat: la tanda no admet més comandes.</p>' : ''}
      <section class="targeta tanda no-imprimeix" aria-label="Resum de la tanda ${t.numero}">
        ${passosHTML(t)}
        <dl class="dades dades-resum">${dl}</dl>
        ${pas && pas.id === 'entregada' && pendentsEntrega.length ? `<p class="fila-detall">Passarà sola a «Entregada» quan ${pendentsEntrega.length === 1 ? 'arribi l’última comanda' : 'arribin les ' + pendentsEntrega.length + ' comandes que falten'}.</p>` : ''}
        ${falta ? `<p class="fila-detall">${esc(falta.text)}</p>` : ''}
        <div class="accions">
          ${seg ? `<button type="button" class="boto" data-accio="estat" data-seg="${seg}">Passa a «${ESTATS[seg]}»</button>` : ''}
          ${falta ? `<button type="button" class="boto" data-accio="falta">${esc(falta.boto)}</button>` : ''}
          ${modificable ? '<button type="button" class="boto boto-lleu" data-accio="data">Canvia la data límit</button>' : ''}
          ${places ? '<button type="button" class="boto boto-lleu" data-accio="places">Canvia els lots</button>' : ''}
        </div>
      </section>
      <section class="no-imprimeix"><h3>Comandes de la tanda (${n})</h3>
        ${n ? `<ul class="fileres">${cs.map((c) => filaComanda(c, true)).join('')}</ul>` : '<p class="buit">Aquesta tanda encara no té comandes.</p>'}
      </section>
      ${desviades(cs)}
      <section><h3>Transport</h3>
        <div class="accions"><button type="button" class="boto boto-lleu" id="imprimeix">Imprimeix</button><button type="button" class="boto boto-lleu" id="csv">Baixa-la en Excel (CSV)</button></div>
        ${blocTransport(t.id)}
      </section>
      ${seccionsHTML('tanda', t)}`;
    return { html, despres: (v) => {
      fixaBarres(v);
      seccionsDespres(v, 'tanda', t);
      const on = (acc, fn) => {
        const b = $(`[data-accio="${acc}"]`, v);
        if (b) b.addEventListener('click', () => fn(b));
      };
      on('estat', (b) => canviaEstat(t, b.dataset.seg));
      on('falta', () => R.accio(falta.modul, falta.accio)(R.ctx, { tandaId: t.id }, ui));
      on('data', () => canviaData(t));
      on('places', () => canviaPlaces(t));
      id('imprimeix').addEventListener('click', () => window.print());
      id('csv').addEventListener('click', () => baixaCSV(t.id));
    } };
  }

  // Les comandes que no cabien a la primera tanda oberta i han anat a aquesta (la comanda va sencera a la següent)
  function desviades(cs) {
    const llista = cs.filter((c) => c.desviada);
    if (!llista.length) return '';
    const motiu = (d) => (d.lliures === 0 ? `La tanda ${d.numero} era plena.` : `A la tanda ${d.numero} només ${d.lliures === 1 ? 'hi quedava 1 lot' : 'hi quedaven ' + d.lliures + ' lots'}.`);
    const fila = (c) => `<li class="fila">
      <a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}">
        <span class="fila-nom"><strong>${esc(nomComplet(c.client))}</strong></span>
        <span class="fila-detall">${esc(C.producte(c.producte, c.lots))} · ${esc(motiu(c.desviada))}</span>
      </a>
    </li>`;
    return `<section class="no-imprimeix" id="desviades"><h3>Hi han anat perquè l’anterior no tenia lloc (${llista.length})</h3><ul class="fileres">${llista.map(fila).join('')}</ul></section>`;
  }

  function canviaEstat(t, seg) {
    // Els correus que s'enviaran de veritat: els compta la mateixa funció que els envia (M.correusDeCanvi)
    const n = M.correusDeCanvi(t.id, seg);
    const text = n ? PAS_TEXT[seg](t.numero, n) : PAS_TEXT[seg](t.numero, 0).replace(/ S’enviarà un correu.*$/, '') + (M.comandesDeTanda(t.id).length ? ' No s’enviarà cap correu.' : ' Aquesta tanda no té cap comprador. No s’enviarà cap correu.');
    dialeg('Canvia l’estat', `<p>${esc(text)}</p>`, [
      { text: PAS_SI[seg], primari: true, accio: () => {
        const abans = M.correus().length;
        const r = M.canviaEstatTanda(t.id, seg);
        pinta();
        // Els que s'han enviat de veritat (els de la tanda i els de l'opinió)
        const enviats = M.correus().length - abans;
        if (r.ok) flaix(enviats > 1 ? `Fet. S’han enviat ${enviats} correus. Els pots veure a «Correus».` : enviats === 1 ? 'Fet. S’ha enviat un correu. El pots veure a «Correus».' : 'Fet.');
        else flaix(r.error === 'entrega_pendent' ? 'Encara no es pot: falten comandes per entregar.' : FALTA[r.pas] ? 'Encara no es pot. ' + FALTA[r.pas].text : 'Encara no es pot: la tanda ha canviat. Torna-ho a mirar.');
      } },
      cancela,
    ]);
  }

  const avuiISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + C.z2(d.getMonth() + 1) + '-' + C.z2(d.getDate());
  };
  const afegeixDies = (iso, dies) => {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d) + dies * 86400000).toISOString().slice(0, 10);
  };
  function dataProposada() {
    const dates = M.tandes().map((t) => t.dataLimit).filter(Boolean).sort();
    const darrera = dates.length ? dates[dates.length - 1] : null;
    const base = darrera && darrera > avuiISO() ? darrera : avuiISO();
    return afegeixDies(base, D.tandes.periodeSetmanes * 7);
  }

  function obreTandaNova() {
    const num = M.tandes().reduce((m, t) => Math.max(m, t.numero), 0) + 1;
    const places = M.placesPerTanda();
    const prop = dataProposada();
    const d = dialeg('Obre una tanda nova', `<p id="nova-text"></p>
      <div class="camp-pla"><label for="nova-data">Data límit</label><input type="date" id="nova-data" value="${prop}"></div>
      <p class="error-pla" id="nova-err" role="alert" hidden></p>`, [
      { text: 'Obre-la', primari: true, accio: (dlg) => {
        const val = $('#nova-data', dlg).value;
        const r = M.obrirTanda({ dataLimit: val || undefined });
        if (!r.ok) {
          const e = $('#nova-err', dlg);
          e.textContent = 'Posa una data vàlida.';
          e.hidden = false;
          return false;
        }
        pinta();
      } },
      cancela,
    ]);
    const text = () => ($('#nova-text', d).textContent = `Vols obrir la tanda ${num} ${de(places)} lots, amb data límit el ${dataCurta($('#nova-data', d).value || prop)}?`);
    $('#nova-data', d).addEventListener('input', text);
    text();
  }

  function canviaData(t) {
    dialeg('Canvia la data límit', `<div class="camp-pla"><label for="d-data">Data límit de la tanda ${t.numero}</label><input type="date" id="d-data" value="${esc(t.dataLimit)}"></div><p class="error-pla" id="d-err" role="alert" hidden></p>`, [
      { text: 'Desa', primari: true, accio: (dlg) => {
        const r = M.canviaTanda(t.id, { dataLimit: $('#d-data', dlg).value });
        if (!r.ok) {
          const e = $('#d-err', dlg);
          e.textContent = 'Posa una data vàlida.';
          e.hidden = false;
          return false;
        }
        pinta();
      } },
      cancela,
    ]);
  }

  function canviaPlaces(t) {
    dialeg('Canvia els lots', `<div class="camp-pla"><label for="p-n">Lots de la tanda ${t.numero}</label><input type="number" id="p-n" inputmode="numeric" min="1" max="99" value="${t.places}"></div><p class="error-pla" id="p-err" role="alert" hidden></p>`, [
      { text: 'Desa', primari: true, accio: (dlg) => {
        const n = Number($('#p-n', dlg).value);
        const e = $('#p-err', dlg);
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          e.textContent = 'Posa un número de lots entre 1 i 99.';
          e.hidden = false;
          return false;
        }
        const r = M.canviaTanda(t.id, { places: n });
        if (!r.ok) {
          e.textContent = `${pl(t.ocupacio.lots, 'Ja hi ha # lot reservat', 'Ja hi ha # lots reservats')} a aquesta tanda: no n’hi pots posar menys.`;
          e.hidden = false;
          return false;
        }
        pinta();
      } },
      cancela,
    ]);
  }

  /* ---------- Comandes i fitxa ---------- */

  function comandes() {
    const t = M.tandes().slice().reverse();
    const html = `<h2>Comandes</h2>${caixaFlaix}
      ${seccionsHTML('comandes')}
      <div class="filtres">
        <div class="filtre-parell" role="group" aria-label="Quines comandes">
          <button type="button" class="boto boto-lleu" data-nova="0" aria-pressed="${!filtres.nova}">Totes</button>
          <button type="button" class="boto boto-lleu" data-nova="1" aria-pressed="${filtres.nova}">Noves</button>
        </div>
        <div class="camp-pla"><label for="f-tanda">Tanda</label><select id="f-tanda"><option value="">Totes les tandes</option>${t.map((x) => `<option value="${esc(x.id)}"${filtres.tanda === x.id ? ' selected' : ''}>Tanda ${x.numero}</option>`).join('')}</select></div>
        <div class="camp-pla"><label for="f-estat">Estat</label><select id="f-estat"><option value="">Tots els estats</option>${Object.keys(ESTATS).map((k) => `<option value="${k}"${filtres.estat === k ? ' selected' : ''}>${ESTATS[k]}</option>`).join('')}</select></div>
        <div class="camp-pla ample"><label for="f-cerca">Cerca</label><input type="search" id="f-cerca" placeholder="Busca per nom o telèfon" value="${esc(filtres.cerca)}" autocomplete="off"></div>
      </div>
      <div id="llista-comandes" aria-live="polite"></div>`;
    return { html, despres: (v) => {
      seccionsDespres(v, 'comandes');
      const llista = () => {
        const tot = M.comandes();
        const r = M.comandes({ nova: filtres.nova ? true : undefined, tandaId: filtres.tanda || undefined, estat: filtres.estat || undefined, cerca: filtres.cerca || undefined });
        let h;
        if (!tot.length) h = '<p class="buit">Encara no hi ha cap comanda.</p>';
        else if (!r.length && filtres.cerca && !filtres.nova && !filtres.tanda && !filtres.estat) h = `<p class="buit">No hi ha cap comanda amb "${esc(filtres.cerca)}".</p>`;
        else if (!r.length) h = '<p class="buit">No hi ha comandes amb aquest filtre.</p><button type="button" class="boto boto-lleu" id="treu-filtres">Treu els filtres</button>';
        else h = `<ul class="fileres">${r.map((c) => filaComanda(c, true)).join('')}</ul>`;
        id('llista-comandes').innerHTML = h;
        const treu = id('treu-filtres');
        if (treu) treu.addEventListener('click', () => {
          Object.assign(filtres, { nova: false, tanda: '', estat: '', cerca: '' });
          pinta();
        });
      };
      $$('[data-nova]', v).forEach((b) =>
        b.addEventListener('click', () => {
          filtres.nova = b.dataset.nova === '1';
          $$('[data-nova]', v).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          llista();
        }),
      );
      id('f-tanda').addEventListener('change', (e) => { filtres.tanda = e.target.value; llista(); });
      id('f-estat').addEventListener('change', (e) => { filtres.estat = e.target.value; llista(); });
      id('f-cerca').addEventListener('input', (e) => { filtres.cerca = e.target.value.trim(); llista(); });
      llista();
    } };
  }

  function historialText(h) {
    const quan = C.dataHora(h.data);
    if (h.tipus === 'creada') return `${quan} · Comanda feta`;
    if (h.tipus === 'estat-tanda') {
      const t = M.tanda(h.tandaId);
      return `${quan} · La tanda ${t ? t.numero : ''} passa a «${ESTATS[h.estat] || h.estat}»`;
    }
    if (h.tipus === 'entregada') return `${quan} · Entregada`;
    if (h.tipus === 'pagament') return `${quan} · Pagament: ${(PAG_ESTATS[h.estat] || h.estat).toLowerCase()}`;
    if (h.tipus === 'moguda') {
      const de = M.tanda(h.de);
      const a = M.tanda(h.a);
      return `${quan} · Moguda de la tanda ${de ? de.numero : ''} a la tanda ${a ? a.numero : ''}`;
    }
    return quan;
  }

  function fitxa(comandaId) {
    const c = M.comanda(comandaId);
    const enrere = '<a class="enrere" href="#comandes">Comandes</a>';
    if (!c) return { html: `${enrere}<h2>Comanda</h2><p class="buit">No hem trobat aquesta comanda.</p>` };
    const k = c.client;
    const tel = k.telefon.replace(/[^\d+]/g, '');
    const wa = 'https://wa.me/' + (tel.startsWith('+') ? tel.slice(1) : '34' + tel);
    const env = enviamentTextComanda(c);
    const rebuts = M.correus({ comandaId: c.id, destinatari: 'comprador' }).filter(R.correuVisible);
    const dl = (parelles) => `<dl class="dades">${parelles.filter((p) => p[1] !== '').map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`;
    const lliurament = { 'repartiment-propi': 'El repartim nosaltres', transportista: 'Transportista', recull: 'La recull a la granja' }[c.lliurament] || 'Per acordar';
    const mou = c.tandaId && M.potMoure(c.id).ok;
    // Sense el mòdul de pagaments ningú no la cobraria: la fitxa en dona la sortida
    const senseModulPag = !R.actiu('pagaments') && (c.pagament === 'pendent' || c.pagament === 'fallit');
    const html = `${enrere}
      <h2>${esc(nomComplet(k))}${c.nova ? ' <span class="distintiu">Nova</span>' : ''}</h2>
      ${caixaFlaix}
      <div class="accions">
        <a class="boto" href="tel:${esc(tel)}">Truca</a>
        ${k.email ? `<a class="boto boto-lleu" href="mailto:${esc(k.email)}">Correu</a>` : ''}
        <a class="boto boto-lleu" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>
        ${mou ? '<button type="button" class="boto boto-lleu" id="mou">Mou a una altra tanda</button>' : ''}
      </div>
      <section class="targeta"><h3>Dades</h3>${dl([
        ['Nom', esc(nomComplet(k))],
        ['Telèfon', esc(k.telefon)],
        ['Correu', esc(k.email)],
        ['Adreça', c.lliurament === 'recull' ? '' : esc(adrecaText(k))],
        ['Notes per a l’entrega', esc(k.notes)],
        ['Lliurament', lliurament],
      ])}</section>
      <section class="targeta"><h3>Comanda</h3>${dl([
        ['Comanda', esc(c.id)],
        ['Feta', C.dataHora(c.creada) + (c.origen === 'telefon' ? ' · per telèfon' : '')],
        ['Producte', esc(C.producte(c.producte, c.lots))],
        ['Tanda', c.tandaNumero ? `<a href="#tanda=${encodeURIComponent(c.tandaId)}">Tanda ${c.tandaNumero}</a> · ${esc(ESTATS[c.estat])}` : 'A part, sense tanda'],
        ['Import', esc(C.importLots(c.producte, c.lots))],
        ['Enviament', env ? esc(env) : 'Per acordar'],
        ['Total', esc(C.importTotal(c))],
        ['Pagament', `${esc(PAGAMENTS[c.metodePagament] || c.metodePagament)} · ${esc((PAG_ESTATS[c.pagament] || c.pagament).toLowerCase())}${senseModulPag ? ' <button type="button" class="boto boto-lleu" id="ja-pagat">Ja ha pagat</button>' : ''}`],
        ['Entregada', c.entregada ? esc(C.dataHora(c.entregada)) : ''],
      ])}</section>
      <section class="targeta"><h3>Historial</h3><ul class="historial">${c.historial.map((h) => `<li>${esc(historialText(h))}</li>`).join('')}</ul></section>
      <section class="targeta"><h3>Correus rebuts</h3>${rebuts.length ? `<ul class="fileres">${rebuts.map((m) => filaCorreu(m, false)).join('')}</ul>` : '<p class="buit">Encara no ha rebut cap correu.</p>'}</section>
      ${seccionsHTML('comanda', c)}`;
    return { html, despres: (v) => {
      lligaCorreus(v);
      seccionsDespres(v, 'comanda', c);
      const b = id('mou');
      if (b) b.addEventListener('click', () => mouComanda(c));
      const jp = id('ja-pagat');
      if (jp) jp.addEventListener('click', () => {
        const r = M.setPagament(c.id, 'pagat');
        pinta();
        flaix(r.ok ? 'Fet. La comanda és cobrada.' : 'No s’ha pogut marcar com a cobrada.');
      });
      if (c.nova) M.marcaVista(c.id);
    } };
  }

  function mouComanda(c) {
    const origen = c.tandaId;
    const tandes = M.tandes().filter((t) => !t.tancada && t.id !== origen);
    if (!tandes.length) {
      dialeg('Mou a una altra tanda', '<p>No hi ha cap altra tanda oberta. Obre’n una a Tandes.</p>', [{ text: 'Tanca', primari: true }]);
      return;
    }
    const caben = tandes.filter((t) => t.ocupacio.lliures >= c.places);
    if (!caben.length) {
      const t = tandes[0];
      dialeg('Mou a una altra tanda', `<p>A la tanda ${t.numero} només hi caben ${t.ocupacio.lliures} ${t.ocupacio.lliures === 1 ? 'lot més' : 'lots més'} i aquesta comanda en té ${c.places}.</p>`, [{ text: 'Tanca', primari: true }]);
      return;
    }
    dialeg('Mou a una altra tanda', `<fieldset class="opcions"><legend>A quina tanda la vols moure?</legend>${caben.map((t, i) => `<label><input type="radio" name="desti" value="${esc(t.id)}"${i === 0 ? ' checked' : ''}> Tanda ${t.numero} · data límit ${dataCurta(t.dataLimit)} · ${esc(C.queden(t.ocupacio.lliures))}</label>`).join('')}</fieldset><p class="error-pla" id="m-err" role="alert" hidden></p>`, [
      { text: 'Mou-la', primari: true, accio: (dlg) => {
        const val = $('input[name="desti"]:checked', dlg).value;
        const r = M.movaComanda(c.id, val);
        if (!r.ok) {
          const e = $('#m-err', dlg);
          e.textContent = 'No s’ha pogut moure la comanda: ja no hi ha lloc a aquesta tanda.';
          e.hidden = false;
          return false;
        }
        pinta();
        flaix(`Comanda moguda a la tanda ${r.comanda.tandaNumero}.`);
      } },
      cancela,
    ]);
  }

  /* ---------- Transport ---------- */

  const csvCel = (v) => {
    let s = String(v === undefined || v === null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // protecció contra fórmules en obrir-lo a Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };

  function taulaTransport(titol, llista) {
    const kg = C.kg(llista.lots * D.pesLot().kgReals);
    const files = llista.comandes
      .map((c) => `<tr><td data-label="Nom">${esc(nomComplet(c.client))}</td><td data-label="Adreça">${esc(c.client.adreca)}</td><td data-label="CP">${esc(c.client.cp)}</td><td data-label="Població">${esc(c.client.poblacio)}</td><td data-label="Telèfon">${esc(c.client.telefon)}</td><td data-label="Lots">${c.places}</td><td data-label="Notes">${esc(c.client.notes)}</td></tr>`)
      .join('');
    const n = llista.comandes.length;
    return `<section class="targeta llista-transport"><h3>${titol}</h3>${n
      ? `<table class="taula"><thead><tr><th scope="col">Nom</th><th scope="col">Adreça</th><th scope="col">CP</th><th scope="col">Població</th><th scope="col">Telèfon</th><th scope="col">Lots</th><th scope="col">Notes</th></tr></thead><tbody>${files}</tbody></table>
         <p class="total-llista">Total: ${C.lots(llista.lots)} (${kg} kg) · ${pl(n, 'entrega', 'entregues')}</p>`
      : '<p class="buit">Cap entrega d’aquest tipus.</p>'}</section>`;
  }

  // Les dues llistes d'una tanda (o el text buit); les fan servir Transport i la vista de tanda
  function blocTransport(tandaId) {
    if (!tandaId || !M.comandesDeTanda(tandaId).length) return '<p class="buit">Aquesta tanda encara no té comandes.</p>';
    const ll = M.llistesEntrega(tandaId);
    // Les llistes només porten les que surten (el filtre únic); les retingudes i les retornades, a part i amb el motiu
    const fora = ll.noSurten.length
      ? `<section class="targeta no-imprimeix" id="no-surten"><h3>No surten amb la tanda (${ll.noSurten.length})</h3><ul class="fileres">${ll.noSurten.map((c) => `<li class="fila"><a class="fila-text" href="#comanda=${encodeURIComponent(c.id)}"><span class="fila-nom"><strong>${esc(nomComplet(c.client))}</strong> · ${esc(C.producte(c.producte, c.lots))}</span><span class="fila-detall">${esc(c.motiuNoSurt)}</span></a></li>`).join('')}</ul></section>`
      : '';
    return taulaTransport('Les repartim nosaltres', ll.repartimentPropi) + taulaTransport('Transportista', ll.transportista) + (ll.recull.comandes.length ? taulaTransport('La recullen a la granja', ll.recull) : '') + fora;
  }

  function transport() {
    const tandes = M.tandes().slice().reverse();
    if (!tandaTransport || !M.tanda(tandaTransport)) {
      const act = M.tandaActual();
      tandaTransport = act ? act.id : tandes.length ? tandes[0].id : '';
    }
    const html = `<h2>Transport</h2>
      <div class="filtres">
        <div class="camp-pla"><label for="t-tanda">Tanda</label><select id="t-tanda">${tandes.map((t) => `<option value="${esc(t.id)}"${t.id === tandaTransport ? ' selected' : ''}>Tanda ${t.numero} · ${esc(ESTATS[t.estat])}</option>`).join('')}</select></div>
        <div class="accions"><button type="button" class="boto boto-lleu" id="imprimeix">Imprimeix</button><button type="button" class="boto boto-lleu" id="csv">Baixa-la en Excel (CSV)</button></div>
      </div>
      ${tandaTransport ? `<h3>Tanda ${M.tanda(tandaTransport).numero} · data límit ${dataCurta(M.tanda(tandaTransport).dataLimit)}</h3>` : ''}
      ${blocTransport(tandaTransport)}`;
    return { html, despres: () => {
      const s = id('t-tanda');
      if (s) s.addEventListener('change', () => { tandaTransport = s.value; pinta(); });
      id('imprimeix').addEventListener('click', () => window.print());
      id('csv').addEventListener('click', () => baixaCSV(tandaTransport));
    } };
  }

  function baixaCSV(tandaId) {
    if (!tandaId) return;
    const ll = M.llistesEntrega(tandaId);
    const t = M.tanda(tandaId);
    const cap = ['Entrega', 'Nom', 'Adreça', 'CP', 'Població', 'Telèfon', 'Lots', 'Notes'];
    const files = [];
    [['Les repartim nosaltres', ll.repartimentPropi], ['Transportista', ll.transportista], ['La recullen a la granja', ll.recull]].forEach(([nom, llista]) => {
      llista.comandes.forEach((c) => files.push([nom, nomComplet(c.client), c.client.adreca, c.client.cp, c.client.poblacio, c.client.telefon, c.places, c.client.notes]));
    });
    const text = '﻿' + [cap].concat(files).map((f) => f.map(csvCel).join(';')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `transport-tanda-${t ? t.numero : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Correus ---------- */

  const MOTIUS = { 'comanda-nova': 'Comanda nova', 'canvi-estat-tanda': 'Canvi d’estat de la tanda', entrega: 'Comanda entregada', devolucio: 'Devolució', 'enllac-pagament': 'Enllaç de pagament', 'avis-tanda': 'Tanda nova', moguda: 'Comanda moguda de tanda' };
  const SIGNATURA = `Casa Camp\n${TEL}`;

  // El text el posa PLA-COPY.md §4; el registre només desa plantilla + dades
  function textCorreu(m) {
    const d = m.dades;
    const c = d.comanda;
    const k = c.client;
    const t = d.tanda;
    const prod = C.producte(c.producte, c.lots);
    const parell = { producte: c.producte, lots: c.lots, lliurament: c.lliurament, importEnviament: c.importEnviament, tandaId: m.tandaId };
    const total = C.importTotal(parell);
    const env = C.importEnviament(parell);
    const tipus = c.lliurament === 'repartiment-propi' ? 'el repartim nosaltres' : 'transportista';
    const aPart = !t;
    const adreca = `${k.adreca}, ${k.cp} ${k.poblacio}`;
    const dies = C.diesEntrega();
    const pl = t ? t.places : '';
    const plena = t && t.ocupats >= t.places;
    const dataLimit = t ? C.dataCurta(t.dataLimit) : '';
    const dataComanda = C.dataHora(m.data);
    const lotLiniaTanda = c.producte === 'lot' ? `es tanca quan arriba a ${pl} lots o, com a molt tard, el ${dataLimit}` : `es tanca com a molt tard el ${dataLimit}`;

    switch (m.plantilla) {
      case 'comanda-pastor':
        return {
          assumpte: `Comanda nova: ${nomComplet(k)}, ${prod} (${aPart ? 'a part, sense tanda' : 'tanda ' + t.numero})`,
          cos: [
            `Comanda ${c.id} · ${dataComanda}`,
            '',
            'Comprador',
            nomComplet(k),
            `Telèfon: ${k.telefon}`,
            `Correu: ${k.email}`,
            `Adreça: ${adreca}`,
            `Notes per a l’entrega: ${k.notes || '—'}`,
            '',
            'Comanda',
            `${prod}: ${C.importLots(c.producte, c.lots)}`,
            ...(aPart ? [] : [`Enviament: ${env} (${tipus})`]),
            `Total pagat: ${total}`,
            '',
            aPart ? 'Va a part, sense tanda. Truca-li per quedar el dia.' : `Tanda ${t.numero}: ara té ${t.ocupats} ${de(t.places)} lots. Data límit: ${dataLimit}.`,
            '',
            `Obre la comanda al panell: ${d.enllacPanell || ''}`,
          ].join('\n'),
        };
      case 'comanda-confirmacio': {
        const tandaText = aPart
          ? 'Et trucarem per quedar el dia que te la portem.'
          : plena
            ? `Amb la teva comanda, la tanda ${t.numero} ha quedat plena i tancada. Ara la preparem, i quan surti cap a casa teva t’escriurem amb el dia que t’arriba.`
            : `Va a la tanda ${t.numero}, que ${lotLiniaTanda}. Uns ${dies} dies després que es tanqui, la tens a casa. Quan la comanda surti, t’escriurem amb el dia exacte.`;
        return {
          assumpte: `Comanda pagada · ${c.id}`,
          cos: [`Hola, ${k.nom}:`, '', 'Gràcies per la comanda. La comanda és pagada.', '', `Has demanat: ${prod}`, `Comanda: ${c.id}`, `Total: ${total}`, `T’arriba a: ${adreca}`, '', tandaText, '', 'Si has de canviar alguna cosa, truca’ns.', '', SIGNATURA].join('\n'),
        };
      }
      case 'tanda-completa':
        return {
          assumpte: `La tanda ${t.numero} ja és tancada`,
          cos: [`Hola, ${k.nom}:`, '', 'La tanda on hi ha la teva comanda ja és tancada: no hi entren més comandes. La teva hi és, i aviat la començarem a preparar. T’escriurem quan la comanda surti cap a casa teva.', '', SIGNATURA].join('\n'),
        };
      case 'tanda-preparacio':
        return {
          assumpte: 'Estem preparant la teva comanda',
          cos: [`Hola, ${k.nom}:`, '', `Ja estem preparant les comandes de la tanda ${t.numero}. La teva hi és: ${prod}, comanda ${c.id}.`, '', 'T’escriurem quan surti cap a casa teva.', '', SIGNATURA].join('\n'),
        };
      case 'tanda-enviada': {
        const propi = c.lliurament === 'repartiment-propi';
        return propi
          ? { assumpte: 'Et portem la comanda', cos: [`Hola, ${k.nom}:`, '', `La teva comanda ja és en camí. Te la portem nosaltres mateixos, refrigerada, a ${adreca}.`, '', `Si no hi has de ser, truca’ns al ${TEL} i quedem d’una altra manera.`, '', 'Recorda posar la carn a la nevera en arribar.', '', SIGNATURA].join('\n') }
          : { assumpte: 'La teva comanda és en camí', cos: [`Hola, ${k.nom}:`, '', `La teva comanda ha sortit amb el transportista. T’arriba refrigerada a ${adreca}.`, '', `Si no hi has de ser, truca’ns al ${TEL} com més aviat millor i ho mirem.`, '', 'Recorda posar la carn a la nevera en arribar.', '', SIGNATURA].join('\n') };
      }
      case 'comanda-moguda': {
        const x = d.extra || {};
        const abans = x.de ? `no ha sortit amb la tanda ${x.de}` : 'no ha sortit amb la seva tanda';
        return x.pagada
          ? { assumpte: `La teva comanda va a la tanda ${t.numero}`, cos: [`Hola, ${k.nom}:`, '', `Ja tenim el pagament de la comanda ${c.id}. Com que ${abans}, va a la tanda ${t.numero}, que ${lotLiniaTanda}.`, '', 'T’escriurem quan surti cap a casa teva.', '', SIGNATURA].join('\n') }
          : { assumpte: `La teva comanda va a la tanda ${t.numero}`, cos: [`Hola, ${k.nom}:`, '', `La comanda ${c.id} ${abans}: encara no ens consta el pagament. L’hem passat a la tanda ${t.numero}, que ${lotLiniaTanda}.`, '', `Quan la paguis, sortirà amb aquesta tanda. Si tens cap dubte, truca’ns al ${TEL}.`, '', SIGNATURA].join('\n') };
      }
      case 'tanda-entregada':
        return { assumpte: 'Ja tens la comanda a casa', cos: [`Hola, ${k.nom}:`, '', 'La teva comanda ja s’ha entregat. Si hi ha res que no estigui bé, truca’ns.', '', 'Gràcies per comprar-nos directament.', '', SIGNATURA].join('\n') };
      default:
        // Una plantilla d'un mòdul: el text el posa el mòdul (panell/moduls.js, `correus[].text`)
        return R.textCorreu(m) || { assumpte: m.plantilla, cos: '' };
    }
  }

  function filaCorreu(m, mostraComprador) {
    const x = textCorreu(m);
    const al = m.destinatari === 'pastor' ? 'A tu (avís de comanda)' : `${nomComplet(m.dades.comanda.client)} · ${m.a}`;
    return `<li class="fila">
      <div class="fila-text">
        <p class="fila-detall">${esc(C.dataHora(m.data))} · ${esc(MOTIUS[m.motiu] || m.motiu || '')}</p>
        <p class="fila-nom"><strong>${esc(x.assumpte)}</strong></p>
        <p class="fila-detall">${esc(al)}</p>
      </div>
      <button type="button" class="boto boto-sec" data-correu="${esc(m.id)}">Veure el correu<span class="sr-nomes">: ${esc(x.assumpte)}</span></button>
    </li>`;
  }

  function lligaCorreus(v) {
    $$('[data-correu]', v).forEach((b) =>
      b.addEventListener('click', () => {
        const m = M.correus().find((x) => x.id === b.dataset.correu);
        if (!m) return;
        const x = textCorreu(m);
        dialeg('Correu', `<dl class="dades"><div><dt>A</dt><dd>${esc(m.destinatari === 'pastor' ? 'Tu (avís de comanda)' : m.a)}</dd></div><div><dt>Assumpte</dt><dd>${esc(x.assumpte)}</dd></div></dl><pre class="cos-correu">${esc(x.cos)}</pre>`, [{ text: 'Tanca', primari: true }]);
      }),
    );
  }

  function correus() {
    const tots = M.correus().filter(R.correuVisible);
    const visibles = tots.slice(0, correusVisibles);
    const html = `<h2>Correus</h2>
      ${tots.length ? `<ul class="fileres">${visibles.map((m) => filaCorreu(m, true)).join('')}</ul>${tots.length > visibles.length ? '<button type="button" class="boto boto-lleu" id="mes-correus">Mostra’n més</button>' : ''}` : '<p class="buit">Encara no s’ha enviat cap correu.</p>'}`;
    return { html, despres: (v) => {
      lligaCorreus(v);
      const b = id('mes-correus');
      if (b) b.addEventListener('click', () => { correusVisibles += 40; pinta(); });
    } };
  }

  /* ---------- Configuració ---------- */

  const PENDENTS_TEXT = {
    // Diu el que passa de veritat: els paquets amb l'etiqueta feta encara són a la granja; els altres, amb el transportista
    enviaments: (n, ids) => {
      const granja = ids.filter((x) => (M.lliurament(x) || {}).estat === 'preparat').length;
      const cami = n - granja;
      const parts = [granja ? pl(granja, '# paquet amb l’etiqueta feta, que encara és a la granja', '# paquets amb l’etiqueta feta, que encara són a la granja') : '', cami ? pl(cami, '# paquet amb el transportista, que encara no ha arribat', '# paquets amb el transportista, que encara no han arribat') : ''].filter(Boolean);
      return `Hi ha ${parts.join(' i ')}. Si l’apagues ara, es perdria el seguiment i es donarien per entregats sense saber-ho. Quan hagin arribat, el podràs apagar.`;
    },
    pagaments: (n) => `Hi ha ${pl(n, '# comanda per cobrar', '# comandes per cobrar')} (enllaç sense pagar, cobrament fallit o efectiu). Si l’apagues ara, ningú no les cobraria. Cobra-les, o retorna-les, i el podràs apagar.`,
    ruta: (n) => `Hi ha ${n === 1 ? '1 entrega pròpia' : n + ' entregues pròpies'} d’una tanda que ja ha sortit. Si l’apagues ara, es donarien per entregades sense saber-ho. Quan les hagis portat, el podràs apagar.`,
    escorxador: (n) => `${n === 1 ? 'Una tanda espera' : n + ' tandes esperen'} els kg reals de la carn que ja has demanat. Apunta’ls i el podràs apagar.`,
  };
  function noEsPotApagar(idModul, pendents) {
    const n = (pendents || []).length;
    const cos = PENDENTS_TEXT[idModul] ? PENDENTS_TEXT[idModul](n, pendents || []) : 'Té feina a mig fer. Acaba-la i el podràs apagar.';
    dialeg(`Encara no es pot apagar «${R.modul(idModul).nom}»`, `<p>${esc(cos)}</p>`, [{ text: 'Tanca', primari: true }]);
  }

  function configuracio() {
    const html = `<h2>Configuració</h2>${caixaFlaix}
      <section class="targeta">
        <form id="f-config" novalidate>
          <div class="camp-pla"><label for="c-places">Lots per tanda</label><input type="number" id="c-places" inputmode="numeric" min="1" max="99" value="${M.placesPerTanda()}" aria-describedby="c-err"></div>
          <p class="error-pla" id="c-err" role="alert" hidden></p>
          <button type="submit" class="boto">Desa</button>
        </form>
      </section>
      <section class="targeta" id="moduls">
        <h3>Mòduls</h3>
        <p class="buit">Apaga el que no vulguis: desapareix de tot arreu i no es perd res. Quan l’encenguis, torna.</p>
        <ul class="moduls">${R.llista().map((m) => `<li class="modul" data-modul="${esc(m.id)}">
          <span class="fila-text"><span class="fila-nom"><strong id="modul-nom-${esc(m.id)}">${esc(m.nom)}</strong>${m.pendent ? ' <span class="distintiu distintiu-pendent">Pendent del pastor</span>' : ''}</span><span class="fila-detall">${esc(m.descripcio || '')}</span></span>
          <button type="button" class="interruptor" role="switch" aria-checked="${R.actiu(m.id)}" aria-labelledby="modul-nom-${esc(m.id)}" data-modul-interruptor="${esc(m.id)}"></button>
        </li>`).join('')}</ul>
      </section>
      ${seccionsHTML('configuracio')}
      <section class="targeta"><h3>Web instal·lable</h3><p>Posa el panell a la pantalla d’inici del mòbil.</p><a class="boto boto-lleu" href="#instalar">Com es fa</a></section>
      <section class="targeta"><button type="button" class="boto boto-lleu" id="restableix">Restableix les dades d’exemple</button></section>`;
    return { html, despres: (v) => {
      seccionsDespres(v, 'configuracio');
      $$('[data-modul-interruptor]', v).forEach((b) =>
        b.addEventListener('click', () => {
          const idModul = b.dataset.modulInterruptor;
          const volEncendre = !R.actiu(idModul);
          const r = M.setModul(idModul, volEncendre); // el subscriptor repinta
          if (r.ok) flaix(`${R.modul(idModul).nom}: ${volEncendre ? 'encès' : 'apagat'}.`);
          else if (r.error === 'modul_amb_pendents') noEsPotApagar(idModul, r.pendents);
        }),
      );
      id('f-config').addEventListener('submit', (e) => {
        e.preventDefault();
        const n = Number(id('c-places').value);
        const err = id('c-err');
        if (!Number.isInteger(n) || n < 1 || n > 99) {
          err.textContent = 'Posa un número de lots entre 1 i 99.';
          err.hidden = false;
          id('c-places').setAttribute('aria-invalid', 'true');
          return;
        }
        const r = M.setPlacesPerTanda(n);
        if (!r.ok) {
          err.textContent = 'Hi ha tandes amb més lots reservats que aquest número.';
          err.hidden = false;
          return;
        }
        err.hidden = true;
        id('c-places').removeAttribute('aria-invalid');
        flaix('Desat.');
      });
      id('restableix').addEventListener('click', () =>
        dialeg('Restableix les dades d’exemple', '<p>Es tornaran a posar les tandes i les comandes d’exemple i es perdrà el que s’hagi fet des de llavors.</p>', [
          { text: 'Restableix', primari: true, accio: () => {
            M.restablir();
            pinta();
            flaix('Dades restablertes.');
          } },
          cancela,
        ]),
      );
    } };
  }

  // Imprimeix només una secció d'un mòdul (etiquetes, ruta…): la resta s'amaga mentre dura la impressió (css/panell.css)
  function imprimeix(seccio) {
    const el = $(`.seccio-modul[data-seccio="${seccio}"]`, id('vista'));
    if (!el) return window.print();
    el.classList.add('imprimint');
    document.body.dataset.imprimeix = seccio;
    const acaba = () => {
      el.classList.remove('imprimint');
      delete document.body.dataset.imprimeix;
      window.removeEventListener('afterprint', acaba);
    };
    window.addEventListener('afterprint', acaba);
    window.print();
    // Si el navegador no avisa en acabar (o la impressió és simulada), no deixem la pantalla amagada
    setTimeout(acaba, 1500);
  }

  // Baixa un text com a fitxer (l'Excel de la gestoria)
  function descarrega(nom, text, tipus) {
    const url = URL.createObjectURL(new Blob([text], { type: tipus || 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // El que reben les funcions dels mòduls (tasques, accions, seccions) per tocar la interfície del panell
  const ui = {
    imprimeix,
    descarrega,
    canviaEstat,
    navega: (hash) => {
      if (location.hash === hash) pinta();
      else location.hash = hash;
    },
    flaix,
    dialeg,
    cancela,
    esc,
    repinta: pinta,
  };
  R.ctx.ui = ui;
  R.ctx.avisos = avisosUI;
  // Per a les proves i per als mòduls nous: repintar després de registrar-ne un
  window.CassovallPanell = { repinta: pinta, ui };

  arrenca();
})();
