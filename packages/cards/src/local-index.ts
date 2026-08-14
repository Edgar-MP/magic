import type { CardIndexEntry } from '@magic/shared'
import { indexLegalIn } from '@magic/shared'

/**
 * Índice local de nombres, generado por `scripts/build-card-index.ts` desde el
 * bulk data de Scryfall. Sirve para autocompletar al instante y sin red; las
 * búsquedas con sintaxis (`t:creature c:rg`) siguen yendo a la API.
 *
 * Se carga una sola vez y se queda en memoria (~30k entradas).
 */

let entries: CardIndexEntry[] | null = null
let loading: Promise<CardIndexEntry[]> | null = null

const DEFAULT_URL = '/card-index.json'

export async function loadIndex(url = DEFAULT_URL): Promise<CardIndexEntry[]> {
  if (entries) return entries
  if (loading) return loading

  loading = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`No se pudo cargar el índice: ${response.status}`)
      return response.json() as Promise<CardIndexEntry[]>
    })
    .then((data) => {
      entries = data
      return data
    })
    .finally(() => {
      loading = null
    })

  return loading
}

/** ¿Está ya en memoria? Permite decidir si usar el índice o la API sin esperar. */
export function indexReady(): boolean {
  return entries !== null
}

export interface LocalSearchOptions {
  limit?: number
  /** Filtra por legalidad en un formato: `commander`, `modern`… */
  format?: string
  /** La identidad de color de la carta debe caber en estos colores. */
  identity?: string[]
}

/**
 * Busca por nombre en el índice en memoria. Ordena poniendo delante las que
 * empiezan por el texto buscado, que es lo que uno espera al teclear.
 */
export function searchLocal(query: string, options: LocalSearchOptions = {}): CardIndexEntry[] {
  if (!entries) return []

  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  const { limit = 20, format, identity } = options
  const allowed = identity ? new Set(identity) : null

  const starts: CardIndexEntry[] = []
  const contains: CardIndexEntry[] = []

  for (const entry of entries) {
    if (format && !indexLegalIn(entry, format)) continue
    if (allowed && [...(entry.ci ?? '')].some((c) => !allowed.has(c))) continue

    const name = entry.name.toLowerCase()
    const at = name.indexOf(needle)
    if (at === 0) starts.push(entry)
    else if (at > 0) contains.push(entry)

    if (starts.length >= limit) break
  }

  return [...starts, ...contains].slice(0, limit)
}

/** Sólo para tests: inyecta el índice sin pasar por fetch. */
export function setIndexForTests(data: CardIndexEntry[] | null): void {
  entries = data
}
