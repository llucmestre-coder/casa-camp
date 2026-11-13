# Casa Camp · maqueta de la web

Això és una **maqueta navegable**, no una web viva. Serveix per veure com seria la web de Casa Camp i com
treballaria el pastor amb les comandes. Tot passa dins del navegador de qui l'obre: no hi ha servidor, no es cobra res
i no s'envia cap correu.

Són HTML, CSS i JavaScript sense cap pas de compilació. S'obre amb qualsevol servidor estàtic (per exemple
`python -m http.server 8740` des d'aquesta carpeta) o pujant la carpeta tal qual a un allotjament estàtic.

## Què és de debò i què no

- **Les xifres de les tandes i les comandes del panell són inventades.** «19 de 26 lots», «hi queden 7 lots», «la tanda
  anterior ja és tancada» i les setze comandes del panell surten d'unes dades d'exemple. Els noms són fictis i els
  correus acaben en `.invalid`, que no pot ser de ningú.
- **Les xifres de preu són de mostra**: `000 €` el lot, `000 €/kg`, `000 €` les canals i `00 €` l'enviament fora de les rodalies.
- **Els correus que surten al panell no s'envien.** Són una vista prèvia del que enviaria la versió real.
- **Sense l'enllaç de presentació no es desa res.** Si algú obre la web normal i arriba al pas de pagar, no pot pagar:
  veu el telèfon (646 455 128) per fer la comanda. El panell tampoc no deixa entrar («Aquest panell no és obert»).
- Cap pàgina no s'ha d'indexar: totes porten `noindex` i `robots.txt` ho prohibeix.

## Com presentar-la

1. **Obre l'enllaç amb `?presentacio` al final.** Per exemple `https://…/?presentacio`. Aquest paràmetre activa el
   mode de presentació en aquell navegador i s'hi queda desat: no cal posar-lo a cada pàgina.
2. **Si algú ha obert alguna vegada l'enllaç amb `?presentacio=0`, el mode s'ha apagat.** Cal tornar a obrir
   l'enllaç amb `?presentacio` per activar-lo.
3. **Abans de la reunió, restableix les dades.** Entra al panell (`/panell/`, botó «Entra»), vés a «Configuració» i
   prem **«Restableix les dades d'exemple»**. Torna les tandes i les comandes a l'estat de partida i esborra les
   comandes de proves anteriors. No toca el mode de presentació.
4. **Per provar la compra amb targeta**, fes servir la targeta de prova `4242 4242 4242 4242`, amb qualsevol
   caducitat futura (per exemple `12/30`) i qualsevol CVC de tres xifres (`123`). Apple Pay i Google Pay surten com
   a botons, però a la maqueta només fan de mostra.
   - `4000 0000 0000 0002` simula una targeta rebutjada pel banc.
   - `4000 0000 0000 9995` també és rebutjada.
   - `4000 0000 0000 0119` simula un pagament que no es pot confirmar.
5. **El panell es veu en una pestanya a part.** Si fas una comanda a la home, apareix al panell al moment, destacada
   com a nova, sense recarregar.
6. **Les dades es desen al navegador concret on s'ha fet la prova.** Una comanda feta al mòbil no es veu a
   l'ordinador. Per això el panell s'ha d'obrir al mateix navegador on es fa la comanda.

## Com canviar les dades (`js/dades.js`)

Gairebé tot el que pot canviar és en un sol fitxer, `js/dades.js`, i es pot editar amb qualsevol editor de text.
Cada bloc té un comentari al damunt. Després de canviar-lo, recarrega la pàgina amb força (Ctrl + F5). Si ja hi havia
dades desades al navegador, prem «Restableix les dades d'exemple» al panell perquè s'apliquin.

| Què | On, a `dades.js` | Com |
|---|---|---|
| Nom i lloc del negoci | `negoci.nom`, `negoci.lloc` | Text. |
| Telèfon | `contacte.telefons` | Llista de números, en format `646 455 128`. |
| Preu del lot | `lot.preu` i `lot.preuMostra` | Posa el preu en euros (`preu: 45`) i `preuMostra: false`. Mentre `preuMostra` sigui `true`, la web ensenya `000 €`. El preu per kg es calcula sol. |
| Preu de la mitja canal i de la canal | `productes['mitja-canal']` i `productes.canal` | Igual: `preu` i `preuMostra: false`. |
| Peces del lot | `peces` | Una línia per peça, amb nom i `grams`. La suma és el pes real; el lot es diu «de 5 kg» per `lot.kg`. |
| Places per tanda | `tandes.places` | Ara 26. |
| Temps entre dues dates límit | `tandes.periodeSetmanes` | Setmanes. Quan sigui definitiu, posa `periodePendent: false`. |
| Dies fins a l'entrega | `diesEntrega` | `dies: N` i `mostra: false`. Mentre sigui de mostra, la web diu «uns 00 dies». |
| Zona d'enviament gratuït | `enviament.rodalies` | `cps` és la llista de codis postals on el pastor reparteix ell mateix. Afegeix-hi cada codi entre cometes. `nom` és com es diu la zona. |
| Enviament fora d'aquesta zona | `enviament.resta` | `import` en euros i `mostra: false`. De moment és `00 €`. Si en algun moment hi ha més d'una tarifa, caldrà tocar `costEnviament(cp)`, al mateix fitxer. |
| Transportista | `enviament.transportista.nom` | No surt a la web pública; només és una referència interna. |
| Formes de pagament | `pagament.metodes` | Targeta, Apple Pay i Google Pay. |
| Correu del pastor | `correus.pastor` | L'adreça on arriba l'avís de cada comanda. Ara és un marcador (`[CORREU DEL NEGOCI]`). |
| Adreça de la web (`urlBase`) | `panell.urlBase` | Domini sencer, sense barra final (`https://exemple.cat`). El correu al pastor hi afegeix `/panell/` i la comanda. |

Quatre coses no són a `dades.js`, i s'han de canviar a mà als fitxers HTML:

- **El telèfon** també és escrit directament a `index.html` (preguntes, peu, avís sense JavaScript i dades
  estructurades), a `404.html` i a `avis-legal.html`. Cerca `646` i canvia'l a tots.
- **Els textos de la web** (hero, «Som a Casa Camp», preguntes) són a `index.html`. La frase de les rodalies diu
  «rodalies de Sort» i s'ha de posar al dia amb els pobles reals.
- **El correu**, quan n'hi hagi un, s'ha d'afegir també al peu de `index.html` i a les tres pàgines legals.
- **El logo** és `assets/logo.png`; el favicon, a `assets/favicon.ico` i `assets/favicon-32.png`.

## Fotos pendents (`FOTO REAL PENDENT`)

Les tres fotos de la home són de stock (Unsplash, llicència lliure) i es poden substituir per les del pastor. Al codi
cada una porta el comentari `<!-- FOTO REAL PENDENT: … -->`; es troben amb una cerca d'aquest text.

| Foto | On és | Fitxers | Què hi ha d'anar | Mida i format |
|---|---|---|---|---|
| Portada | Hero de `index.html` | `assets/fotos/hero.webp` (ara, una foto provisional de 2048 px), `hero-1600.webp` (1600 px) i `hero-mobil.webp` (vertical) | Les vaques o la finca, amb espai per al text a l'esquerra | Horitzontal, 2400 × 1245 px, WebP. El mòbil, una versió vertical de 747 × 1245 px |
| Som a Casa Camp | Secció «Som a Casa Camp» | `assets/fotos/qui.webp` | La finca o les vaques a la pastura | 1400 × 933 px (3:2), WebP |
| El lot | Secció «Què hi ha en un lot» | `assets/fotos/lot.webp` | El lot obert, amb les sis peces (picada, hamburguesa, filet, estofat, xurrasco i entrecot) | 1400 × 951 px, WebP |

Per substituir-les, desa la foto nova amb el mateix nom i mida, mantén l'atribut `alt` (descriu-hi el que es veu de
debò) i treu el comentari `FOTO REAL PENDENT`. La del lot, ara, no concorda del tot amb les peces reals: és
la que més convé canviar. Quan hi sigui la foto real del lot obert es pot decidir si hi tornen les marques per peça.

## Pàgines

| Pàgina | Què és |
|---|---|
| `index.html` | La home: qui som, el lot, les canals, el segell ecològic i les preguntes. El botó «Demana el teu lot» de la fitxa porta a la pàgina de compra. |
| `panell/` | El panell del pastor: tandes, comandes, transport, correus i configuració. Només s'obre amb el mode de presentació. |
| `avis-legal.html`, `privacitat.html`, `galetes.html` | Esquelets legals. Falten les dades del titular (raó social, NIF i adreça) i quatre dades més que es marquen `[PENDENT]`. |
| `404.html` | Pàgina d'error. |

## Què faria falta per fer-ne la versió real

- Una passarel·la de pagament (targeta, Apple Pay i Google Pay) amb el compte de Casa Camp.
- Un servidor, amb base de dades, per desar les comandes de debò i protegir el panell amb accés.
- El servei de correu, per als avisos al pastor i als compradors.
- L'API del transportista, per generar etiquetes i números de seguiment.
- Els avisos per WhatsApp, si es volen.

## Llicències

La lletra, Schibsted Grotesk, és de llicència OFL (`assets/fonts/OFL.txt`) i va allotjada a la mateixa web. No es
carrega res de fora en obrir-la.
