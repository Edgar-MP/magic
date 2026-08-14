import type { Card } from '@magic/shared'
import { cardSchema } from '@magic/shared'
import { HttpError, RequestQueue } from './queue.js'

const API = 'https://api.scryfall.com'

/** Máximo de identificadores que acepta /cards/collection en una llamada. */
const COLLECTION_BATCH = 75

const queue = new RequestQueue({ minInterval: 100 })

async function get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path, API)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  return queue.run(async () => request<T>(url.toString(), { method: 'GET' }))
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  })

  if (!response.ok) {
    // Scryfall manda un objeto de error con `details` legible.
    let details: string | undefined
    try {
      const body = (await response.json()) as { details?: string }
      details = body.details
    } catch {
      details = undefined
    }
    throw new HttpError(response.status, url, details)
  }

  return (await response.json()) as T
}

interface ScryfallList<T> {
  data: T[]
  has_more: boolean
  next_page?: string
  total_cards?: number
}

/** Parsea con zod pero sin tirar la búsqueda entera si una carta viene rara. */
function parseCards(raw: unknown[]): Card[] {
  const cards: Card[] = []
  for (const item of raw) {
    const parsed = cardSchema.safeParse(item)
    if (parsed.success) cards.push(parsed.data)
    else console.warn('Carta ignorada por el esquema', parsed.error.issues)
  }
  return cards
}

export interface SearchOptions {
  /** `name` | `cmc` | `released` | `rarity` | `color` | `edhrec`… */
  order?: string
  dir?: 'auto' | 'asc' | 'desc'
  /** `cards` agrupa por impresión, `prints` devuelve todas las versiones. */
  unique?: 'cards' | 'art' | 'prints'
  includeExtras?: boolean
  page?: number
}

export interface SearchResult {
  cards: Card[]
  hasMore: boolean
  totalCards: number
}

/**
 * Búsqueda con la sintaxis de Scryfall (`t:creature c:rg cmc<=3`).
 * Un 404 significa "sin resultados", así que devolvemos la lista vacía.
 */
export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  if (query.trim() === '') return { cards: [], hasMore: false, totalCards: 0 }

  try {
    const list = await get<ScryfallList<unknown>>('/cards/search', {
      q: query,
      order: options.order,
      dir: options.dir,
      unique: options.unique,
      include_extras: options.includeExtras ? 'true' : undefined,
      page: options.page ? String(options.page) : undefined,
    })
    return {
      cards: parseCards(list.data),
      hasMore: list.has_more,
      totalCards: list.total_cards ?? list.data.length,
    }
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return { cards: [], hasMore: false, totalCards: 0 }
    }
    throw error
  }
}

/** Carta por nombre exacto, o `undefined` si no existe. */
export async function named(name: string, set?: string): Promise<Card | undefined> {
  try {
    const raw = await get<unknown>('/cards/named', { exact: name, set })
    return cardSchema.parse(raw)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return undefined
    throw error
  }
}

/** Nombre aproximado: lo que hace la barra de búsqueda de Scryfall. */
export async function fuzzy(name: string): Promise<Card | undefined> {
  try {
    const raw = await get<unknown>('/cards/named', { fuzzy: name })
    return cardSchema.parse(raw)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return undefined
    throw error
  }
}

export async function byId(id: string): Promise<Card | undefined> {
  try {
    return cardSchema.parse(await get<unknown>(`/cards/${id}`))
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return undefined
    throw error
  }
}

/** Autocompletado de nombres: hasta 20 sugerencias. */
export async function autocomplete(partial: string): Promise<string[]> {
  if (partial.trim().length < 2) return []
  const list = await get<{ data: string[] }>('/cards/autocomplete', { q: partial })
  return list.data
}

export type CardIdentifier =
  | { id: string }
  | { name: string }
  | { name: string; set: string }
  | { set: string; collector_number: string }

export interface CollectionResult {
  cards: Card[]
  /** Identificadores que Scryfall no ha sabido resolver. */
  notFound: CardIdentifier[]
}

/**
 * Resuelve muchas cartas de golpe. Es la llamada clave para cargar un mazo
 * entero o una lista importada: 100 cartas son 2 peticiones, no 100.
 */
export async function collection(identifiers: CardIdentifier[]): Promise<CollectionResult> {
  const cards: Card[] = []
  const notFound: CardIdentifier[] = []

  for (let i = 0; i < identifiers.length; i += COLLECTION_BATCH) {
    const batch = identifiers.slice(i, i + COLLECTION_BATCH)
    const response = await queue.run(() =>
      request<{ data: unknown[]; not_found: CardIdentifier[] }>(`${API}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch }),
      }),
    )
    cards.push(...parseCards(response.data))
    notFound.push(...(response.not_found ?? []))
  }

  return { cards, notFound }
}

export interface CardSymbol {
  symbol: string
  svg_uri: string
  english: string
  represents_mana: boolean
  appears_in_mana_costs: boolean
  cmc: number
}

/** Los 84 símbolos de maná y demás, con su SVG. */
export async function symbology(): Promise<CardSymbol[]> {
  const list = await get<ScryfallList<CardSymbol>>('/symbology')
  return list.data
}

export interface ScryfallSet {
  code: string
  name: string
  /** SVG del símbolo de expansión, en negro. */
  icon_svg_uri: string
  card_count: number
  released_at?: string
}

/** Símbolo de expansión de un código de set (`2xm`, `ltr`…). */
export async function setIcon(code: string): Promise<string | undefined> {
  try {
    const set = await get<ScryfallSet>(`/sets/${code.toLowerCase()}`)
    return set.icon_svg_uri
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return undefined
    throw error
  }
}

export interface BulkDataEntry {
  type: string
  name: string
  download_uri: string
  updated_at: string
  size?: number
}

export async function bulkData(): Promise<BulkDataEntry[]> {
  const list = await get<ScryfallList<BulkDataEntry>>('/bulk-data')
  return list.data
}
