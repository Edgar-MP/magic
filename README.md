# Magic — constructor de mazos y creador de proxies

Dos herramientas en una web: construir mazos con los datos de Scryfall y crear
cartas proxy reconstruyendo la carta completa con tu propia ilustración. Todo se
guarda en el navegador (IndexedDB): no hay cuentas ni servidor.

## Puesta en marcha

```bash
pnpm install
pnpm assets        # marcos, tipografías y símbolos (~63 MB, una sola vez)
pnpm cards:index   # índice de cartas para el autocompletado offline (~7 MB)
pnpm dev           # http://localhost:5173
```

Los dos comandos del medio son opcionales pero conviene ejecutarlos:

- **Sin `pnpm assets`** el editor de proxies no puede dibujar nada y avisa de
  ello. El deck builder funciona igual.
- **Sin `pnpm cards:index`** el buscador no autocompleta al teclear, pero al
  pulsar Enter sigue buscando en la API de Scryfall.

## Cuentas y sincronización

**Entrar es opcional.** Sin cuenta todo funciona igual que siempre, guardado en
este navegador. Con cuenta, los mazos, la colección, los proxies y sus
ilustraciones se guardan en el servidor y los tienes en cualquier dispositivo.

Sigue siendo local-first: IndexedDB es la fuente de verdad, así que funciona sin
conexión y sincroniza cuando puede (al entrar, al volver la conexión o a mano).
Los conflictos se resuelven con **el último que escribe gana**, comparando
`updatedAt`; no hay fusión.

Para desarrollar con la base de datos:

```bash
pnpm db:up        # Postgres en el 5463
pnpm db:migrate   # aplica el esquema
pnpm dev:server   # API en el 3000
pnpm dev          # web en el 5173
pnpm test:api     # tests de integración (necesitan el Postgres de arriba)
```

## Desplegar

```bash
docker build -t magic .
```

Un solo contenedor sirve la web, los marcos y la API, y aplica las migraciones al
arrancar. Los pasos de Dokploy, las variables y las copias de seguridad están en
[docs/despliegue.md](docs/despliegue.md).

## Qué hay dentro

```
packages/
  shared/     tipos, esquemas zod, reglas de formato, parser de listas
  cards/      cliente de Scryfall (con cola de peticiones) y caché en Dexie
  renderer/   motor que compone las cartas capa a capa sobre un canvas
  web/        aplicación React + Vite
  api/        servidor Hono: cuentas, sincronización y la web compilada
scripts/
  fetch-assets.ts      descarga marcos, tipografías y símbolos
  build-card-index.ts   genera el índice local desde el bulk data
  render-samples.ts     renderiza cartas reales a PNG para calibrar
```

### Mazos

Formatos con validación: Commander (100 cartas, singleton, identidad de color
del comandante), Standard, Pioneer, Modern, Legacy, Vintage y Pauper (60 + 15,
máximo 4 copias, restringidas) y Casual sin validar. La legalidad carta a carta
sale del campo `legalities` de Scryfall, así que las banlists se actualizan
solas.

Importa y exporta listas en texto plano: formatos de Arena, MTGO (`SB:`) y
Moxfield/Archidekt (`*CMDR*`, cabeceras).

### Proxies

Se reconstruye la carta entera con el marco moderno (M15): nombre, coste de
maná, línea de tipo, texto de reglas con símbolos en línea y cursivas,
ambientación, fuerza/resistencia, corona de legendaria, marco de Nyx, sello
holográfico y símbolo de expansión. El texto de reglas se autoajusta: busca por
bisección el cuerpo de letra más grande con el que el bloque cabe en la caja; el
nombre y el tipo se comprimen y, si no basta, se reducen.

Cuatro variantes:

| Variante | Qué hace |
| --- | --- |
| Normal | La carta de siempre, borde negro y caja de texto opaca. |
| Arte extendido | La caja de texto es transparente y el arte se ve por detrás. |
| Sin bordes | El arte llega a los cuatro cantos. Sin corona de legendaria. |
| Tierra full art | Básica sin texto de reglas: nombre arriba, tipo abajo con el círculo de maná y el símbolo de expansión. |

La ilustración se encuadra **sobre la propia carta**: arrastrar la mueve y la
rueda hace zoom.

Hay además una etiqueta libre que sale en una cajita bajo el nombre, encima de la
ilustración, para anotar de qué carta sale el proxy o marcarlo como tal. Vacía no
se dibuja.

### Proxies de un mazo

Desde un mazo, la pestaña «Proxies» abre la cuadrícula de todos sus proxies:
crea de una vez los que falten, marca cuáles has retocado ya y lleva la cuenta
(«7 de 100 editadas»), con un filtro para ver sólo las que quedan. El flujo
pensado es importar una lista y ir cambiando ilustraciones hasta acabar.

Todas las medidas del marco están en coordenadas normalizadas
(`packages/renderer/src/frames.ts`), así que la misma composición sirve para la
vista previa de 750 px y para el PNG de impresión de 2010 × 2814 px (unos 800
dpi al tamaño de una carta).

### Impresión

PDF A4 o Carta con rejilla 3 × 3 a **63 × 88 mm exactos** y marcas de corte. Se
puede imprimir un mazo entero de una vez: usa el proxy de cada carta si lo tiene
y la imagen oficial de Scryfall si no.

Reverso opcional, con el clásico de Magic por defecto o una imagen propia:

- **A doble cara**: detrás de cada hoja va su hoja de reversos, espejada en
  horizontal para que al imprimir a doble cara girando por el lado largo cada
  reverso caiga detrás de su carta.
- **Una hoja de reversos**: nueve reversos en una hoja aparte, para recortar.

> Al imprimir, pon la escala al 100 % y desactiva «ajustar a la página». Si no,
> las cartas saldrán del tamaño equivocado.

## Comprobar que funciona

```bash
pnpm test        # reglas de formato, parser de listas, maquetación, render
pnpm typecheck
pnpm build
```

Los tests de render (`packages/renderer/src/render.test.ts`) componen cartas de
verdad y comprueban píxeles concretos, así que un descuadre de la geometría
salta solo. Se saltan si no has ejecutado `pnpm assets`.

Para calibrar a ojo contra cartas reales:

```bash
npx tsx scripts/render-samples.ts "Lightning Bolt" "Atraxa, Praetors' Voice"
# → scripts/.cache/samples/*.png
```

La única prueba que importa de verdad para imprimir: genera el PDF, imprímelo y
**mide una carta con una regla**. Deben ser 63 × 88 mm.

## Sobre los assets

Los marcos y las tipografías (Beleren, MPlantin) son material con copyright de
Wizards of the Coast y Adobe. **No están en el repositorio**: `pnpm assets` se
los baja a `packages/renderer/assets/`, que está en `.gitignore`. Los símbolos
de maná son los SVG oficiales de Scryfall.

Esto es para hacerse proxies de uso personal y jugar con ellos. No vale para
vender nada ni para pasar por cartas auténticas.

## Fuera de alcance por ahora

Cartas de doble cara, planeswalkers, sagas, aventuras y arte completo: el juego
de marcos que descargamos no las cubre. Tampoco hay precios ni sincronización
entre dispositivos; lo segundo se podría añadir con un backend sin tocar el
diseño local-first.
