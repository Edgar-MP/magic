/**
 * Descarga los assets del renderizador: marcos, tipografías y símbolos.
 *
 *   pnpm assets
 *
 * Van a `packages/renderer/assets/`, que está en .gitignore. Son recreaciones
 * de material con copyright de WotC (marcos, Beleren) y Adobe (MPlantin), así
 * que no se versionan en el repo: cada uno se los baja para su uso personal.
 *
 * Fuentes:
 *  - Marcos y tipografías: github.com/fiahdrgn473/CardConjurer, a 2010×2814 px
 *    (unos 800 dpi al tamaño de una carta). Sólo se cogen ficheros de `img/` y
 *    `fonts/`, no su código.
 *  - Símbolos de maná: los SVG oficiales de Scryfall (svgs.scryfall.io), que son
 *    vectoriales y a todo color.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'packages/renderer/assets')

const REPO = 'fiahdrgn473/CardConjurer'
const BRANCH = 'HEAD'
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`

const CONCURRENCY = 6
const USER_AGENT = 'magic-assets/0.1 (uso personal)'

/** Letras de color con las que CardConjurer nombra los ficheros. */
const COLOR_LETTERS = ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'C', 'V'] as const

/**
 * Lista explícita de lo que hace falta, en vez del árbol entero del repo
 * (11.600 ficheros). Cada entrada es `[ruta en el repo, ruta local]`.
 */
function manifest(): [string, string][] {
  const files: [string, string][] = []
  const add = (repoPath: string, local = repoPath.replace(/^img\/frames\//, '')) =>
    files.push([repoPath, local])

  const regular = 'img/frames/m15/regular'

  // Marcos de criatura/hechizo, por color.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'V']) {
    add(`${regular}/m15Frame${c}.png`)
  }
  add(`${regular}/eldrazi.png`)

  // Marcos de tierra: mismo esquema pero con otra textura.
  for (const c of ['w', 'u', 'b', 'r', 'g', 'm', 'l']) {
    add(`${regular}/l${c}.png`)
  }

  // Máscaras: recortan una zona del marco (título, tipo, caja de texto…) para
  // poder mezclar dos colores o pintar sólo una parte.
  for (const mask of ['Pinline', 'PinlineSuper', 'Title', 'Type', 'Rules', 'Frame', 'Border']) {
    add(`${regular}/m15Mask${mask}.png`)
  }

  // Cajas de fuerza/resistencia.
  for (const c of COLOR_LETTERS) {
    if (c === 'L') continue // no hay PT de tierra
    add(`${regular}/m15PT${c}.png`)
  }

  // Corona de legendaria.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'C']) {
    add(`img/frames/m15/crowns/m15Crown${c}.png`)
  }
  add('img/frames/m15/crowns/m15MaskLegendCrown.png')
  add('img/frames/m15/crowns/m15MaskLegendCrownPinline.png')
  add('img/black.png', 'm15/crowns/borderCover.png')

  // Marcos de Nyx (encantamientos legendarios de Theros).
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A']) {
    add(`img/frames/m15/nyx/m15Frame${c}Nyx.png`)
  }

  // Sello holográfico de rara/mítica.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'C']) {
    add(`img/frames/m15/holoStamps/m15HoloStamp${c}.png`)
  }

  // Marcas de agua de las tierras básicas.
  for (const c of ['w', 'u', 'b', 'r', 'g', 'c']) {
    add(`img/frames/m15/basics/${c}.png`)
  }

  // Variante de arte extendido: misma carta con la caja de texto transparente.
  for (const c of ['w', 'u', 'b', 'r', 'g', 'm', 'a', 'l']) {
    add(`img/frames/m15/clearTextbox/${c}.png`)
  }

  // Variante sin bordes (full art): el arte llega a los cuatro cantos.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A', 'L', 'C']) {
    add(`img/frames/m15/borderless/m15GenericShowcaseFrame${c}.png`)
  }
  for (const c of ['w', 'u', 'b', 'r', 'g', 'm', 'a', 'l', 'c']) {
    add(`img/frames/m15/borderless/pt/${c}.png`)
  }

  // Tierras básicas full art (estilo de 2022 en adelante): el arte ocupa todo
  // menos una franja arriba para el nombre y otra abajo para el tipo.
  for (const c of ['w', 'u', 'b', 'r', 'g', 'm', 'l']) {
    files.push([`img/frames/textless/2022/${c}.png`, `textless2022/${c}.png`])
  }
  // El círculo con el símbolo de maná que va abajo a la izquierda.
  for (const c of ['w', 'u', 'b', 'r', 'g', 'c']) {
    files.push([`img/frames/textless/2022/s${c}.png`, `textless2022/s${c}.png`])
  }

  // Reverso clásico de Magic.
  add('img/frames/cardbacks/cardback.png', 'cardbacks/cardback.png')

  // Planeswalker: marco por color (sólo siete, no hay tierra ni vehículo) y
  // las insignias de lealtad (+/−/neutral) que van pegadas a cada habilidad.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M', 'A']) {
    files.push([
      `data/images/cardImages/planeswalker/planeswalkerFrame${c}.png`,
      `planeswalker/planeswalkerFrame${c}.png`,
    ])
  }
  for (const pip of ['Plus', 'Minus', 'Neutral']) {
    files.push([
      `data/images/cardImages/planeswalker/planeswalker${pip}.png`,
      `planeswalker/planeswalker${pip}.png`,
    ])
  }

  // Saga: marco por color (sólo cinco, sin oro/artefacto propios: usa
  // Multicolored como comodín) y la insignia de capítulo que va en la franja.
  for (const c of ['W', 'U', 'B', 'R', 'G', 'M']) {
    files.push([`data/images/cardImages/saga/sagaFrame${c}.png`, `saga/sagaFrame${c}.png`])
  }
  files.push(['data/images/cardImages/saga/sagaChapter.png', 'saga/sagaChapter.png'])

  // Tipografías: Beleren para títulos y tipos, MPlantin para el texto de reglas.
  for (const font of [
    'beleren-b.ttf',
    'beleren-bsc.ttf',
    'mplantin.ttf',
    'mplantin-i.ttf',
    'matrix.ttf',
    'matrix-b.ttf',
  ]) {
    files.push([`fonts/${font}`, `fonts/${font}`])
  }

  return files
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function fetchTo(url: string, target: string): Promise<'ok' | 'skip'> {
  if (await exists(target)) return 'skip'

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) throw new Error(`${response.status} en ${url}`)

  const body = Buffer.from(await response.arrayBuffer())
  // La API raw de GitHub responde 200 con "404: Not Found" si la ruta no existe.
  if (body.length < 32 && body.toString('utf8').startsWith('404')) {
    throw new Error(`no existe: ${url}`)
  }

  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
  return 'ok'
}

/** Ejecuta `worker` sobre los items con un número fijo de tareas en paralelo. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<unknown>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      if (item !== undefined) await worker(item)
    }
  })
  await Promise.all(runners)
}

interface Progress {
  done: number
  skipped: number
  failed: string[]
}

function report(label: string, { done, skipped, failed }: Progress): void {
  console.log(`${label}: ${done} descargados, ${skipped} ya estaban, ${failed.length} fallidos`)
  for (const f of failed.slice(0, 10)) console.error(`  ${f}`)
}

async function fetchFrames(): Promise<Progress> {
  const files = manifest()
  console.log(`Marcos y tipografías: ${files.length} ficheros desde ${REPO}`)

  const progress: Progress = { done: 0, skipped: 0, failed: [] }
  await pool(files, CONCURRENCY, async ([repoPath, local]) => {
    const url = `${RAW}/${repoPath.split('/').map(encodeURIComponent).join('/')}`
    try {
      const result = await fetchTo(url, join(outDir, local))
      if (result === 'skip') progress.skipped += 1
      else progress.done += 1
    } catch (error) {
      progress.failed.push(`${repoPath} → ${(error as Error).message}`)
    }
    const total = progress.done + progress.skipped + progress.failed.length
    process.stdout.write(`  ${total}/${files.length}\r`)
  })
  process.stdout.write('\n')

  return progress
}

/** `{W/U}` → `W-U`, `{T}` → `T`: un nombre de fichero por símbolo. */
function symbolFileName(symbol: string): string {
  return `${symbol.replace(/[{}]/g, '').replace(/\//g, '-')}.svg`
}

async function fetchSymbols(): Promise<Progress> {
  const response = await fetch('https://api.scryfall.com/symbology', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`/symbology devolvió ${response.status}`)

  const list = (await response.json()) as { data: { symbol: string; svg_uri: string }[] }
  console.log(`Símbolos de maná: ${list.data.length} SVG desde Scryfall`)

  const progress: Progress = { done: 0, skipped: 0, failed: [] }
  await pool(list.data, CONCURRENCY, async (symbol) => {
    const target = join(outDir, 'symbols', symbolFileName(symbol.symbol))
    try {
      const result = await fetchTo(symbol.svg_uri, target)
      if (result === 'skip') progress.skipped += 1
      else progress.done += 1
    } catch (error) {
      progress.failed.push(`${symbol.symbol} → ${(error as Error).message}`)
    }
  })

  return progress
}

async function main(): Promise<void> {
  console.log(`Destino: ${outDir}\n`)

  const frames = await fetchFrames()
  report('Marcos y tipografías', frames)

  const symbols = await fetchSymbols()
  report('Símbolos', symbols)

  if (frames.failed.length > 0 || symbols.failed.length > 0) process.exit(1)
  console.log('\nListo.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
