/* Casa Camp — interruptor «Vista mòbil» de la web (en Lluc, 07/11/2026), com el del panell: per ensenyar des de
   l'ordinador com es veu la web al mòbil. Només amb `?presentacio` (un comprador no el veu mai), només a pantalles
   amples (≥ 861 px; per sota hi ha la barra del mòbil) i mai dins del marc. En encendre'l, la web es carrega en un
   marc de 390 × 844 i s'hi pot navegar, comprar i pagar. Es recorda en aquest navegador. */
(function () {
  'use strict';

  const M = window.CassovallMagatzem;
  const CLAU = 'casacamp:vista-mobil-web';
  const ample = window.matchMedia('(min-width: 861px)');
  let dinsMarc = false;
  try { dinsMarc = window.self !== window.top; } catch (e) { dinsMarc = true; }
  if (dinsMarc || !M || !M.presentacio()) return;

  const llegeix = () => { try { return localStorage.getItem(CLAU) === '1'; } catch (e) { return false; } };
  const desa = (on) => { try { localStorage.setItem(CLAU, on ? '1' : '0'); } catch (e) { /* no es recorda */ } };

  const boto = document.createElement('button');
  boto.type = 'button';
  boto.className = 'vista-mobil-web';
  boto.setAttribute('role', 'switch');
  boto.setAttribute('aria-checked', 'false');
  boto.textContent = 'Vista mòbil';
  const marc = document.createElement('div');
  marc.className = 'marc-mobil-web';
  marc.hidden = true;
  document.body.append(marc, boto);

  let actiu = false;
  function posa(on) {
    if (on === actiu) return;
    actiu = on;
    if (on) {
      const f = document.createElement('iframe');
      f.title = 'La web en vista mòbil';
      f.src = location.pathname + (location.search || '?presentacio') + location.hash;
      marc.replaceChildren(f);
      marc.hidden = false;
    } else {
      marc.replaceChildren();
      marc.hidden = true;
    }
    document.body.classList.toggle('vista-mobil-web-activa', on);
    boto.setAttribute('aria-checked', String(on));
  }

  boto.addEventListener('click', () => { const on = !actiu; desa(on); posa(on); });
  const mira = () => { if (!ample.matches) posa(false); else if (llegeix()) posa(true); };
  if (ample.addEventListener) ample.addEventListener('change', mira);
  mira();
})();
