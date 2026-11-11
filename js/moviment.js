/* Casa Camp — moviment (criteri general del 04/11/2026, CLAUDE.md §«Criteri general de moviment»).
   Es carrega després de comu.js i abans de compra.js i home.js, que només hi fan les crides de `window.Moviment`.
   Idees: A trams de la tanda · B els teus lots · C mitja o sencera · D preguntes · E i F xifres del full ·
          I fotos, J títols i K la resta d'elements entren un sol cop, curt i suau (07/11/2026). Sense rebot
          enlloc (07/11/2026). La H (confirmació) és ara a js/pagament.js. Quiets: hero (en Lluc hi passarà una
          inspiració), capçalera i franja.
   Tempo: la variable CSS --tempo (css/moviment.css) multiplica totes les durades d'aquí. */
(function () {
  'use strict';

  /* ---------- Paràmetres ---------- */
  // Sense rebot (en Lluc, 07/11/2026): el valor nou entra i s'atura al seu lloc, sense passar de llarg.
  const T = {              // ms amb tempo 1,0
    balanca: 420,          // el valor nou entra des de sota (o des de l'altra posició) i s'atura
    suau: 360,             // una xifra que només canvia: menys recorregut
    suauPx: 7,             // recorregut de la xifra suau
    desplega: 320,         // resposta d'una pregunta
    entraTram: 45,         // entre trams en entrar (només la barra de la tanda)
    tram: 180,             // color d'un tram (també a moviment.css)
    entrada: 70,           // entre elements que entren alhora en fer scroll
  };
  const CORBA = 'cubic-bezier(.2,.8,.2,1)'; // la del full de compra
  const ENTRADA_FRANJA = 'visible'; // 'visible' = s'omple quan entra a la pantalla; 'carrega' = en carregar (però el hero és 100svh: no es veuria)

  const arrel = document.documentElement;
  const redu = window.matchMedia('(prefers-reduced-motion: reduce)');

  const tempo = () => {
    const v = parseFloat(getComputedStyle(arrel).getPropertyValue('--tempo'));
    return isNaN(v) ? 1 : v;
  };
  const quiet = () => redu.matches || tempo() <= 0;

  // Res no es mou fins que el comprador toca alguna cosa: ni en carregar ni quan el text es repinta sol.
  let tocat = false;
  ['pointerdown', 'keydown'].forEach((t) => addEventListener(t, () => { tocat = true; }, { capture: true, passive: true }));
  let silencis = 0;
  const silenci = (fn) => { silencis++; try { fn(); } finally { silencis--; } };
  const permes = () => tocat && !silencis && !quiet();

  /* ---------- «Balança», ara sense rebot ---------- */
  // El valor nou entra des d'`entra` (p. ex. '100%' o els px que hi ha entre dues posicions) i s'atura a `final`,
  // amb la corba del full: frena en arribar i no passa de llarg (en Lluc, 07/11/2026).
  function balanca(el, { eix = 'Y', entra = '100%', final = '0px', fade = true, pseudo } = {}) {
    if (quiet()) return;
    const tr = (v) => `translate${eix}(${v})`;
    const d = T.balanca * tempo();
    const o = pseudo ? { pseudoElement: pseudo } : {};
    el.animate([{ transform: tr(entra) }, { transform: tr(final) }], Object.assign({ duration: d, easing: CORBA }, o));
    if (fade) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.35, easing: 'linear' });
  }

  // Només la xifra: menys recorregut, sense rebot.
  function suau(el) {
    if (quiet()) return;
    const d = T.suau * tempo();
    el.animate([{ transform: `translateY(${T.suauPx}px)` }, { transform: 'translateY(0)' }], { duration: d, easing: CORBA });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.4, easing: 'linear' });
  }

  /* ---------- Text que canvia (E, F, C, B) ----------
     mode 'balanca': tot l'element entra amb la balança. mode 'suau': només hi ha moviment a les xifres que han canviat. */
  const XIFRA = /\d+(?:[.,]\d+)?/g;

  function marcaXifres(arrel2, vell) {
    const antics = vell.match(XIFRA) || [];
    const nous = (arrel2.textContent.match(XIFRA) || []).length;
    const trobats = [];
    let k = 0;
    const nodes = [];
    const w = document.createTreeWalker(arrel2, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => {
      const txt = n.nodeValue;
      const re = new RegExp(XIFRA.source, 'g');
      const frag = document.createDocumentFragment();
      let m;
      let fins = 0;
      let canvia = false;
      while ((m = re.exec(txt))) {
        const i = k++;
        const igual = antics.length === nous ? antics[i] === m[0] : antics.includes(m[0]);
        if (igual) continue;
        frag.append(txt.slice(fins, m.index));
        const s = document.createElement('span');
        s.className = 'mv-x';
        s.textContent = m[0];
        frag.append(s);
        trobats.push(s);
        fins = m.index + m[0].length;
        canvia = true;
      }
      if (canvia) {
        frag.append(txt.slice(fins));
        n.replaceWith(frag);
      }
    });
    return trobats;
  }

  // El text d'un botó no es pot moure sol sense moure el botó: va dins d'un <span>.
  function destiText(el) {
    if (!el.matches('button')) return el;
    let s = el.querySelector(':scope > .mv-text');
    if (!s) {
      s = document.createElement('span');
      s.className = 'mv-text';
      s.textContent = el.textContent;
      el.replaceChildren(s);
    }
    return s;
  }

  function text(el, valor, mode) {
    const nou = String(valor);
    if (el.textContent === nou) return;
    const vell = el.textContent;
    const diana = destiText(el);
    diana.textContent = nou;
    if (!permes()) return;
    if (mode === 'balanca') balanca(diana);
    else marcaXifres(diana, vell).forEach(suau);
  }

  // El mateix amb HTML (el resum del full porta un <span>); només s'hi mouen les xifres.
  function html(el, nou) {
    const vell = el.textContent;
    el.innerHTML = nou;
    if (vell === el.textContent || !permes()) return;
    marcaXifres(el, vell).forEach(suau);
  }

  /* ---------- A i B · La barra de la tanda en trams ---------- */
  const estats = new WeakMap();

  function pinta(barra) {
    const e = estats.get(barra);
    const tr = barra.children;
    for (let i = 0; i < tr.length; i++) {
      const reservat = e.vist && i < e.reservats;
      const teu = e.vist && !reservat && i >= e.reservats && i < e.reservats + e.teus;
      tr[i].classList.toggle('on', reservat);
      tr[i].classList.toggle('teu', teu);
    }
  }

  function mostra(barra) {
    const e = estats.get(barra);
    if (e.vist) return;
    e.vist = true;
    if (!quiet()) {
      barra.classList.add('mv-entra');
      setTimeout(() => barra.classList.remove('mv-entra'), (e.places * T.entraTram + T.tram) * tempo() + 60);
    }
    pinta(barra);
  }

  // Dibuixa la barra: `places` trams, `reservats` plens. L'entrada (els trams s'encenen un darrere l'altre) passa un sol
  // cop, quan la barra és a la pantalla.
  function tanda(barra, { places, reservats }) {
    let e = estats.get(barra);
    if (!e || barra.children.length !== places) {
      barra.classList.add('mv-trams');
      barra.replaceChildren(...Array.from({ length: places }, (_, i) => {
        const t = document.createElement('i');
        t.style.setProperty('--i', i);
        return t;
      }));
      e = e || { vist: false, teus: 0 };
      estats.set(barra, e);
    }
    e.places = places;
    e.reservats = reservats;
    if (!e.vist) {
      if (quiet() || !('IntersectionObserver' in window) || (barra.id === 'fr-barra' && ENTRADA_FRANJA === 'carrega')) {
        mostra(barra);
      } else if (!e.obs) {
        e.obs = new IntersectionObserver((entrades) => {
          if (entrades.some((x) => x.isIntersecting)) {
            e.obs.disconnect();
            mostra(barra);
          }
        }, { threshold: 0.6 });
        e.obs.observe(barra);
      }
    }
    pinta(barra);
  }

  // B · Els teus lots, en granat, al costat dels reservats. Si no hi caben, no hi són (van tots junts a la següent).
  // Cada tram nou entra amb la balança, tots alhora; els que marxen només fonen el color.
  function teus(barra, n) {
    const e = estats.get(barra);
    if (!e) return;
    const lliures = e.places - e.reservats;
    const abans = e.teus;
    e.teus = n <= lliures ? n : 0;
    pinta(barra);
    if (!e.vist || !permes()) return;
    for (let i = e.reservats + abans; i < e.reservats + e.teus; i++) balanca(barra.children[i]);
  }

  /* ---------- D · Preguntes ---------- */
  function desplega(d) {
    const p = d.querySelector('p');
    if (!p) { d.open = !d.open; return; }
    const obre = !d.open || d.classList.contains('mv-tanca');
    let ara = null;
    if (d._mv) {
      ara = p.offsetHeight; // on era quan l'usuari ha tornat a tocar
      d._mv.cancel();
      d._mv = null;
    }
    if (obre) {
      d.classList.remove('mv-tanca');
      d.open = true;
    } else {
      d.classList.add('mv-tanca');
    }
    const h = p.offsetHeight;
    const mb = getComputedStyle(p).marginBottom;
    const des = ara !== null ? ara : obre ? 0 : h;
    const fins = obre ? h : 0;
    p.style.overflow = 'hidden';
    const a = p.animate(
      [{ height: `${des}px`, marginBottom: des === 0 ? '0px' : mb }, { height: `${fins}px`, marginBottom: fins === 0 ? '0px' : mb }],
      { duration: T.desplega * tempo(), easing: CORBA }
    );
    d._mv = a;
    a.onfinish = () => {
      p.style.overflow = '';
      d._mv = null;
      if (!obre) { d.open = false; d.classList.remove('mv-tanca'); }
    };
    a.oncancel = () => { p.style.overflow = ''; };
  }

  document.addEventListener('click', (ev) => {
    const s = ev.target.closest && ev.target.closest('.faq summary');
    if (!s || !s.parentElement.matches('details') || quiet()) return;
    ev.preventDefault();
    desplega(s.parentElement);
  });

  /* ---------- I · Fotos, J · títols i K · la resta: entren un sol cop, curt i suau (en Lluc, 07/11/2026) ----------
     Substitueix les fotos i els títols lligats a l'scroll («no m'agrada com es desfan», «massa exagerades, es triga
     molt a veure les imatges»). Quan un element entra a la pantalla:
       · foto: es fon i passa del 103 % al 100 % (450 ms);
       · títol: les línies pugen (450 ms, 50 ms entre línies);
       · la resta (textos, peces, caixes, preguntes, peu): pugen 10 px i es fonen (400 ms).
     Els que entren alhora ho fan un darrere l'altre (T.entrada ms). Si un element ja és a dalt (s'hi ha saltat amb un
     enllaç o s'ha recarregat a mitja pàgina), queda vist i quiet. El hero, la capçalera i la franja no es mouen. Amb
     moviment reduït o sense IntersectionObserver no es marca res: tot queda visible. L'estil és a moviment.css. */
  const FOTOS = '.qs-foto, .lot .l-foto, .canals .l-foto';
  const TITOLS = '#qui-titol, #lot-titol, #canals-titol, #segell-titol, #faq-titol';
  const ENTREN = [
    '.qs-text > p',
    '.l-cap > p', '.l-llista > li', '.l-nota', '.l-caixa', '.l-info > div',
    '.segell ul > li',
    '.faq details', '.faq-final',
    '.peu > *',
  ].join(', ');

  function partLinies(h) {
    // Només els espais normals: el no separable («5 kg») manté les dues parts juntes.
    const parts = h.textContent.split(/([ \t\n\r]+)/);
    h.textContent = '';
    parts.forEach((w) => {
      if (!w) return;
      if (/^[ \t\n\r]+$/.test(w)) { h.appendChild(document.createTextNode(w)); return; }
      const caixa = document.createElement('span');
      caixa.className = 'mv-linia';
      const s = document.createElement('span');
      s.textContent = w;
      caixa.appendChild(s);
      h.appendChild(caixa);
    });
  }

  function entrades() {
    if (quiet() || !('IntersectionObserver' in window)) return;
    const fotos = [...document.querySelectorAll(FOTOS)];
    const titols = [...document.querySelectorAll(TITOLS)];
    const resta = [...document.querySelectorAll(ENTREN)];

    titols.forEach(partLinies);
    // Cada paraula sap a quina línia és (--l): les de la mateixa línia pugen alhora.
    const numera = () => titols.forEach((h) => {
      let dalt = null;
      let l = -1;
      h.querySelectorAll('.mv-linia').forEach((c) => {
        if (c.offsetTop !== dalt) { dalt = c.offsetTop; l++; }
        c.firstChild.style.setProperty('--l', l);
      });
    });
    numera();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(numera);
    addEventListener('resize', numera, { passive: true });

    fotos.forEach((f) => f.classList.add('mv-foto'));
    titols.forEach((h) => h.classList.add('mv-titol'));
    resta.forEach((e) => e.classList.add('mv-apareix'));

    const obs = new IntersectionObserver((llista) => {
      let k = 0;
      llista
        .filter((e) => e.isIntersecting || e.boundingClientRect.bottom <= 0)
        .sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .forEach((e) => {
          const ja = !e.isIntersecting; // ja és a dalt: es mostra sense moviment
          if (ja) e.target.classList.add('mv-quiet');
          else if (e.target.classList.contains('mv-apareix')) e.target.style.setProperty('--d', Math.min(k++, 6));
          e.target.classList.add('mv-dins');
          obs.unobserve(e.target);
        });
    }, { threshold: 0 });
    [...fotos, ...titols, ...resta].forEach((e) => obs.observe(e));
  }
  entrades();

  window.Moviment = { text, html, tanda, teus, silenci, tempo, balanca, CORBA };
})();
