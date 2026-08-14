import Dexie, { type EntityTable } from 'dexie'
import type { Card, Deck, ProxyDesign } from '@magic/shared'
import { proxyDesignSchema } from '@magic/shared'

/** Carta en caché, con la marca de tiempo para poder caducarla. */
export interface CachedCard {
  id: string
  name: string
  oracle_id?: string
  set: string
  cachedAt: number
  card: Card
}

/** Cuántas copias tiene el usuario de una impresión concreta. */
export interface CollectionItem {
  cardId: string
  qty: number
  /** Copias en foil, informativo. */
  foil?: number
  updatedAt: number
}

/** Blob guardado (imagen de arte subida, render cacheado). */
export interface StoredBlob {
  id: string
  blob: Blob
  mime: string
  createdAt: number
}

const MONTH = 30 * 24 * 60 * 60 * 1000

export class MagicDB extends Dexie {
  cards!: EntityTable<CachedCard, 'id'>
  decks!: EntityTable<Deck, 'id'>
  collection!: EntityTable<CollectionItem, 'cardId'>
  proxies!: EntityTable<ProxyDesign, 'id'>
  blobs!: EntityTable<StoredBlob, 'id'>

  constructor(name = 'magic') {
    super(name)

    this.version(1).stores({
      cards: 'id, name, oracle_id, set, cachedAt',
      decks: 'id, name, format, updatedAt',
      collection: 'cardId, updatedAt',
      proxies: 'id, sourceCardId, updatedAt',
      blobs: 'id, createdAt',
    })

    // Los proxies guardados antes de que existieran las variantes, la marca de
    // editado y la etiqueta no traen esos campos. Se rellenan con sus valores
    // por defecto en vez de dejar que el renderizador se encuentre un `undefined`.
    this.version(2).upgrade((tx) =>
      tx
        .table<ProxyDesign>('proxies')
        .toCollection()
        .modify((proxy, ref) => {
          ref.value = normalizeProxy(proxy)
        }),
    )

    // Red de seguridad para lo que no pase por la migración: un fichero .json
    // exportado con una versión antigua, o una pestaña que no se ha recargado.
    this.proxies.hook('reading', (proxy) => normalizeProxy(proxy))
  }
}

/**
 * Completa un proxy con los valores por defecto del esquema. Devuelve el mismo
 * objeto si ya estaba completo, para no crear basura en cada lectura.
 */
export function normalizeProxy(proxy: ProxyDesign): ProxyDesign {
  if (proxy.variant !== undefined && proxy.edited !== undefined && proxy.text?.note !== undefined) {
    return proxy
  }

  const parsed = proxyDesignSchema.safeParse(proxy)
  if (parsed.success) return parsed.data

  // Ni con los valores por defecto encaja: al menos que no rompa el render.
  return {
    ...proxy,
    variant: proxy.variant ?? 'regular',
    edited: proxy.edited ?? false,
    text: { ...proxy.text, note: proxy.text?.note ?? '' },
  }
}

export const db = new MagicDB()

// --- Caché de cartas ---------------------------------------------------------

export async function putCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return
  const now = Date.now()
  await db.cards.bulkPut(
    cards.map((card) => ({
      id: card.id,
      name: card.name,
      ...(card.oracle_id ? { oracle_id: card.oracle_id } : {}),
      set: card.set,
      cachedAt: now,
      card,
    })),
  )
}

export async function getCard(id: string): Promise<Card | undefined> {
  return (await db.cards.get(id))?.card
}

/** Lee de la caché las que estén y devuelve también qué ids faltan. */
export async function getCards(ids: string[]): Promise<{ cards: Map<string, Card>; missing: string[] }> {
  const rows = await db.cards.bulkGet(ids)
  const cards = new Map<string, Card>()
  const missing: string[] = []

  ids.forEach((id, i) => {
    const row = rows[i]
    if (row) cards.set(id, row.card)
    else missing.push(id)
  })

  return { cards, missing }
}

/** Borra las cartas que llevan más de un mes sin tocarse. */
export async function pruneCardCache(maxAge = MONTH): Promise<number> {
  return db.cards.where('cachedAt').below(Date.now() - maxAge).delete()
}

// --- Blobs -------------------------------------------------------------------

export async function putBlob(id: string, blob: Blob): Promise<string> {
  await db.blobs.put({ id, blob, mime: blob.type, createdAt: Date.now() })
  return id
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await db.blobs.get(id))?.blob
}

/**
 * Borra los blobs que ya no referencia ningún proxy. Merece la pena porque las
 * fotos de arte son lo más pesado que guardamos.
 */
export async function pruneOrphanBlobs(): Promise<number> {
  const used = new Set(
    (await db.proxies.toArray()).map((p) => p.art.blobId).filter((id): id is string => !!id),
  )
  const all = await db.blobs.toCollection().primaryKeys()
  const orphans = all.filter((id) => !used.has(id))
  if (orphans.length > 0) await db.blobs.bulkDelete(orphans)
  return orphans.length
}
