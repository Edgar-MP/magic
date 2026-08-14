/**
 * Genera el índice local de cartas desde el bulk data de Scryfall.
 *
 *   pnpm cards:index
 *
 * Descarga `oracle_cards` (~25 MB comprimidos, una entrada por carta única), se
 * queda con los campos que necesita el autocompletado y escribe
 * `packages/web/public/card-index.json`. El fichero no se versiona: se regenera
 * cuando salga una expansión nueva.
 *
 * El bulk viene en JSONL comprimido con gzip, así que se procesa línea a línea
 * en streaming en vez de cargar los 150 MB descomprimidos de golpe.
 */
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'scripts/.cache')
const cachePath = join(cacheDir, 'oracle-cards.jsonl.gz')
const outPath = join(root, 'packages/web/public/card-index.json')

const USER_AGENT = 'magic-deckbuilder/0.1 (uso personal)'
/** Si el bulk descargado tiene menos de un día, no lo volvemos a bajar. */
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000

interface BulkCard {
  id: string
  name: string
  mana_cost?: string
  cmc?: number
  type_line?: string
  colors?: string[]
  color_identity?: string[]
  legalities?: Record<string, string>
  set: string
  lang?: string
  layout?: string
  card_faces?: { mana_cost?: string }[]
}

async function fresh(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    return Date.now() - info.mtimeMs < MAX_CACHE_AGE
  } catch {
    return false
  }
}

async function downloadBulk(): Promise<void> {
  console.log('Consultando /bulk-data…')
  const response = await fetch('https://api.scryfall.com/bulk-data', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`bulk-data devolvió ${response.status}`)

  const list = (await response.json()) as {
    data: {
      type: string
      jsonl_download_uri?: string
      download_uri?: string
      compressed_size?: number
      updated_at: string
    }[]
  }
  const oracle = list.data.find((entry) => entry.type === 'oracle_cards')
  if (!oracle) throw new Error('No hay entrada oracle_cards en /bulk-data')

  const uri = oracle.jsonl_download_uri ?? oracle.download_uri
  if (!uri) throw new Error('La entrada oracle_cards no trae URL de descarga')

  const mb = oracle.compressed_size ? (oracle.compressed_size / 1e6).toFixed(1) : '?'
  console.log(`Descargando oracle_cards (${mb} MB, actualizado ${oracle.updated_at})…`)

  const file = await fetch(uri, { headers: { 'User-Agent': USER_AGENT } })
  if (!file.ok || !file.body) throw new Error(`La descarga devolvió ${file.status}`)

  await mkdir(cacheDir, { recursive: true })
  await pipeline(Readable.fromWeb(file.body), createWriteStream(cachePath))
}

/** El coste de maná del lado frontal, para las cartas de doble cara. */
function costOf(card: BulkCard): string | undefined {
  return card.mana_cost || card.card_faces?.[0]?.mana_cost || undefined
}

/** Layouts que no son cartas jugables y sólo ensucian el buscador. */
const SKIP_LAYOUTS = new Set(['art_series', 'token', 'double_faced_token', 'emblem', 'scheme'])

/** Formatos que valida la aplicación; el resto no hace falta en el índice. */
const FORMATS = ['commander', 'standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper']

interface IndexEntry {
  id: string
  name: string
  set: string
  mana_cost?: string
  cmc?: number
  type_line?: string
  ci?: string
  legal?: string
  restricted?: string
}

async function buildIndex(): Promise<IndexEntry[]> {
  const lines = createInterface({
    input: createReadStream(cachePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  })

  const index: IndexEntry[] = []
  let seen = 0
  let broken = 0

  for await (const line of lines) {
    const text = line.trim()
    // El JSONL de Scryfall es una carta por línea, pero toleramos un array
    // envuelto en corchetes por si vuelven al formato antiguo.
    if (text === '' || text === '[' || text === ']') continue

    let card: BulkCard
    try {
      card = JSON.parse(text.replace(/,$/, '')) as BulkCard
    } catch {
      broken += 1
      continue
    }

    seen += 1
    if ((card.lang ?? 'en') !== 'en') continue
    if (card.layout && SKIP_LAYOUTS.has(card.layout)) continue

    const cost = costOf(card)
    const legalities = card.legalities ?? {}
    const legal = FORMATS.filter((f) => legalities[f] === 'legal')
    const restricted = FORMATS.filter((f) => legalities[f] === 'restricted')
    const ci = (card.color_identity ?? []).join('')

    index.push({
      id: card.id,
      name: card.name,
      set: card.set,
      ...(cost ? { mana_cost: cost } : {}),
      ...(card.cmc !== undefined ? { cmc: card.cmc } : {}),
      ...(card.type_line ? { type_line: card.type_line } : {}),
      ...(ci ? { ci } : {}),
      ...(legal.length > 0 ? { legal: legal.join(' ') } : {}),
      ...(restricted.length > 0 ? { restricted: restricted.join(' ') } : {}),
    })
  }

  if (broken > 0) console.warn(`${broken} líneas ilegibles, ignoradas`)
  console.log(`${seen} cartas leídas, ${index.length} en el índice`)

  return index.sort((a, b) => a.name.localeCompare(b.name))
}

async function main(): Promise<void> {
  if (await fresh(cachePath)) {
    console.log('Reutilizando el bulk en caché (menos de 24 h).')
  } else {
    await downloadBulk()
  }

  console.log('Recortando…')
  const index = await buildIndex()

  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(index))

  const size = (await stat(outPath)).size
  console.log(`→ ${outPath} (${(size / 1e6).toFixed(1)} MB)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
