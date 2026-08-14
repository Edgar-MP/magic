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

/**
 * Contabilidad de la sincronización. Vive aquí y no en `@magic/shared` porque es
 * un detalle de cómo se guarda en este navegador, no del modelo de una carta.
 */
export interface SyncMeta {
  /**
   * Borrado lógico. Un borrado que no deja rastro no se puede propagar: el otro
   * dispositivo volvería a subir el registro creyendo que es nuevo.
   */
  deletedAt?: number
  /**
   * Cuándo se subió por última vez. Está pendiente lo que cumple
   * `updatedAt > (syncedAt ?? 0)`, así que no hace falta una tabla de salida y
   * varios cambios seguidos se agrupan solos.
   */
  syncedAt?: number
}

export type StoredDeck = Deck & SyncMeta
export type StoredProxy = ProxyDesign & SyncMeta

/** Cuántas copias tiene el usuario de una impresión concreta. */
export interface CollectionItem extends SyncMeta {
  cardId: string
  qty: number
  /** Copias en foil, informativo. */
  foil?: number
  updatedAt: number
}

/** Blob guardado (imagen de arte subida, render cacheado). */
export interface StoredBlob extends SyncMeta {
  id: string
  blob: Blob
  mime: string
  createdAt: number
}

const MONTH = 30 * 24 * 60 * 60 * 1000

/** Ajustes sueltos que no merecen tabla propia, como el cursor de sincronización. */
export interface MetaEntry {
  key: string
  value: unknown
}

export class MagicDB extends Dexie {
  cards!: EntityTable<CachedCard, 'id'>
  decks!: EntityTable<StoredDeck, 'id'>
  collection!: EntityTable<CollectionItem, 'cardId'>
  proxies!: EntityTable<StoredProxy, 'id'>
  blobs!: EntityTable<StoredBlob, 'id'>
  meta!: EntityTable<MetaEntry, 'key'>

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

    // Los índices de la sincronización. Los campos nuevos no hacen falta
    // rellenarlos: ausente significa «ni borrado ni subido nunca», que es justo
    // lo que queremos para lo que ya había.
    this.version(3).stores({
      cards: 'id, name, oracle_id, set, cachedAt',
      decks: 'id, name, format, updatedAt, syncedAt',
      collection: 'cardId, updatedAt, syncedAt',
      proxies: 'id, sourceCardId, updatedAt, syncedAt',
      blobs: 'id, createdAt, syncedAt',
    })

    // Cursor de la sincronización y demás ajustes sueltos.
    this.version(4).stores({
      cards: 'id, name, oracle_id, set, cachedAt',
      decks: 'id, name, format, updatedAt, syncedAt',
      collection: 'cardId, updatedAt, syncedAt',
      proxies: 'id, sourceCardId, updatedAt, syncedAt',
      blobs: 'id, createdAt, syncedAt',
      meta: 'key',
    })

    // Red de seguridad para lo que no pase por la migración: un fichero .json
    // exportado con una versión antigua, o una pestaña que no se ha recargado.
    this.proxies.hook('reading', (proxy) => normalizeProxy(proxy))
  }
}

/**
 * Lo borrado se queda en la tabla, así que **todas** las lecturas tienen que
 * filtrarlo. Se hace en JS y no con un índice porque IndexedDB no indexa
 * `undefined`: un `where('deletedAt').equals(null)` no devolvería nada.
 */
export function isAlive(record: SyncMeta): boolean {
  return record.deletedAt == null
}

/** Mazos vivos, del más reciente al más antiguo. */
export async function listDecks(): Promise<StoredDeck[]> {
  const decks = await db.decks.orderBy('updatedAt').reverse().toArray()
  return decks.filter(isAlive)
}

export async function getDeck(id: string): Promise<StoredDeck | undefined> {
  const deck = await db.decks.get(id)
  return deck && isAlive(deck) ? deck : undefined
}

export async function listProxies(): Promise<StoredProxy[]> {
  const proxies = await db.proxies.orderBy('updatedAt').reverse().toArray()
  return proxies.filter(isAlive)
}

export async function getProxy(id: string): Promise<StoredProxy | undefined> {
  const proxy = await db.proxies.get(id)
  return proxy && isAlive(proxy) ? proxy : undefined
}

export async function listCollection(): Promise<CollectionItem[]> {
  const items = await db.collection.toArray()
  return items.filter(isAlive)
}

/**
 * Marca el registro como borrado en vez de quitarlo, y le sube el `updatedAt`
 * para que la sincronización lo mande.
 */
export async function softDeleteDeck(id: string): Promise<void> {
  const now = Date.now()
  await db.decks.update(id, { deletedAt: now, updatedAt: now })
}

export async function softDeleteProxy(id: string): Promise<void> {
  const now = Date.now()
  await db.proxies.update(id, { deletedAt: now, updatedAt: now })
}

export async function softDeleteCollectionItem(cardId: string): Promise<void> {
  const now = Date.now()
  await db.collection.update(cardId, { deletedAt: now, updatedAt: now })
}

/**
 * Completa un proxy con los valores por defecto del esquema. Devuelve el mismo
 * objeto si ya estaba completo, para no crear basura en cada lectura.
 */
export function normalizeProxy(proxy: ProxyDesign): ProxyDesign {
  // El hook de lectura de Dexie también se dispara cuando no hay registro (un
  // `get` de un id que no existe), así que aquí llega `undefined`.
  if (proxy == null) return proxy

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
  // Sólo cuentan los proxies vivos: la gracia de esto es liberar el espacio de
  // los que se han borrado. La copia del servidor no se recoge, así que allí
  // queda basura hasta que se implemente su propia limpieza.
  const used = new Set(
    (await listProxies()).map((p) => p.art.blobId).filter((id): id is string => !!id),
  )
  const all = await db.blobs.toCollection().primaryKeys()
  const orphans = all.filter((id) => !used.has(id))
  if (orphans.length > 0) await db.blobs.bulkDelete(orphans)
  return orphans.length
}
