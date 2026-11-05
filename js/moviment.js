/* Casa Camp — moviment (criteri general del 04/11/2026, CLAUDE.md §«Criteri general de moviment»).
   Es carrega després de comu.js i abans de compra.js i home.js, que només hi fan les crides de `window.Moviment`.
   Idees: A trams de la tanda · B els teus lots · C mitja o sencera · D preguntes · E i F xifres del full ·
          H confirmació. (Cap hero, capçalera, Qui som, segell ni peu. La barra del mòbil no té barra: es queda.)
   Tempo: la variable CSS --tempo (css/moviment.css) multiplica totes les durades d'aquí. */
(function () {
  'use strict';

  /* ---------- Paràmetres ---------- */
  const REBOT = 3;         // px que el valor nou passa de llarg com a molt (criteri general: en px, no en %)
  const TORNADA = 1;       // px del segon vaivé (el 6/16 del primer, com a la demostració)
  const T = {              // ms amb tempo 1,0
    balanca: 520,          // «Balança»: el valor nou entra, passa de llarg i s'atura
    suau: 360,             // una xifra que només canvia: menys recorregut i sense rebot
    suauPx: 7,             // recorregut de la xifra suau
    desplega: 320,         // resposta d'una pregunta
    canvi: 320,            // pas del pagament → confirmació
    canviPx: 40,
    entraTram: 45,         // entre trams en entrar (només la barra de la tanda)
    tram: 180,             // color d'un tram (també a moviment.css)
  };
  const CORBA = 'cubic-bezier(.2,.8,.2,1)'; // la del full de compra
  const VAIVE = 'cubic-bezier(.45,0,.55,1)';
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

  /* ---------- «Balança» ---------- */
  // El valor nou entra des d'`entra` (p. ex. '100%' o els px que hi ha entre dues posicions), passa de llarg REBOT px
  // a la meitat, en torna TORNADA al 78 % i s'atura. Sempre en px.
  // `sentit` és el sentit del recorregut (−1 = cap amunt/esquerra): el rebot va cap a on va el valor.
  function balanca(el, { eix = 'Y', entra = '100%', final = '0px', sentit = -1, fade = true, pseudo } = {}) {
    if (quiet()) return;
    const tr = (v) => `translate${eix}(${v})`;
    const al = (px) => (final === '0px' ? `${px}px` : `calc(${final} + ${px}px)`);
    const d = T.balanca * tempo();
    const o = pseudo ? { pseudoElement: pseudo } : {};
    el.animate(
      [
        { transform: tr(entra), offset: 0, easing: CORBA },
        { transform: tr(al(REBOT * sentit)), offset: 0.5, easing: VAIVE },
        { transform: tr(al(-TORNADA * sentit)), offset: 0.78, easing: VAIVE },
        { transform: tr(final), offset: 1 },
      ],
      Object.assign({ duration: d }, o)
    );
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

  /* ---------- C · La càpsula de Mitja canal / Canal sencera ---------- */
  document.addEventListener('change', (ev) => {
    const r = ev.target;
    if (!r.matches || !r.matches('.c-mida input') || !permes()) return;
    const fila = r.closest('.c-mida');
    const etiq = fila.querySelectorAll('label');
    const dist = etiq[1].offsetLeft - etiq[0].offsetLeft;
    const cap = r.value === 'canal';
    // De l'altra posició a la d'ara, passant de llarg REBOT px
    balanca(fila, { eix: 'X', entra: cap ? '0px' : `${dist}px`, final: cap ? `${dist}px` : '0px', sentit: cap ? 1 : -1, fade: false, pseudo: '::before' });
  });

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

  /* ---------- H · Del pagament a la confirmació ---------- */
  // El pagament marxa cap a l'esquerra i la confirmació entra per la dreta, alhora. `alFinal` fa el canvi de debò
  // (reiniciar el formulari i deixar només la confirmació); sense moviment es crida de seguida.
  function confirmacio(cos, sortint, entrant, alFinal) {
    if (quiet()) { alFinal(); return; }
    const full = cos.closest('.full');
    const cap = full.querySelector('.full-cap');
    const dalt = Math.max(0, full.scrollTop + (cap ? cap.offsetHeight : 0) - cos.offsetTop);
    cos.style.overflow = 'hidden';
    entrant.style.cssText = `position:absolute;left:0;right:0;top:${dalt}px`;
    cos.append(entrant);
    sortint.inert = true;
    sortint.setAttribute('aria-hidden', 'true');
    const d = T.canvi * tempo();
    const opt = { duration: d, easing: CORBA };
    const a = sortint.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(-${T.canviPx}px)`, opacity: 0 }], Object.assign({ fill: 'forwards' }, opt));
    entrant.animate([{ transform: `translateX(${T.canviPx}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], opt);
    a.onfinish = () => {
      a.cancel();
      cos.style.overflow = '';
      entrant.style.cssText = '';
      sortint.inert = false;
      sortint.removeAttribute('aria-hidden');
      alFinal();
    };
  }

  window.Moviment = { text, html, tanda, teus, silenci, confirmacio, tempo };
})();
