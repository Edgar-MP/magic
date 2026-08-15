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

    // `backFaceId`/`isBackFace` (doble cara) son opcionales con su valor por
    // defecto: no hace falta ni tocar los índices ni recorrer la tabla, un
    // proxy antiguo simplemente no tiene dorso.
    this.version(5).stores({
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

/**
 * Proxies «normales», para listados de mis proxies o para elegir cartas de un
 * mazo. Los dorsos de doble cara, las mitades de Split y las caras de Flip no
 * cuentan como proxies sueltos: sólo se llega a ellos desde su frente/pareja.
 */
export async function listProxies(): Promise<StoredProxy[]> {
  const proxies = await db.proxies.orderBy('updatedAt').reverse().toArray()
  return proxies.filter((p) => isAlive(p) && !p.isBackFace && !p.isSplitPartner && !p.isFlipPartner)
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

/**
 * Borra un proxy y, si es un frente con dorso, borra también el dorso
 * vinculado; si es un dorso, desvincula el frente que apuntaba a él para que
 * no se quede con un `backFaceId` colgando de un registro borrado. Lo mismo
 * para `splitPartnerId`/`isSplitPartner` y `flipPartnerId`/`isFlipPartner`, en
 * paralelo y de forma independiente (una carta podría en teoría tener dorso Y
 * mitad de Split Y cara de Flip a la vez, aunque no se dé en ninguna carta
 * real).
 */
export async function softDeleteProxy(id: string): Promise<void> {
  const now = Date.now()
  const proxy = await db.proxies.get(id)

  await db.proxies.update(id, { deletedAt: now, updatedAt: now })

  if (proxy?.backFaceId) {
    await db.proxies.update(proxy.backFaceId, { deletedAt: now, updatedAt: now })
  }

  if (proxy?.isBackFace) {
    // No hay índice por `backFaceId` (son pocos y no merece la pena): se busca
    // a mano el frente que apunta a este dorso.
    const front = await db.proxies.filter((p) => p.backFaceId === id).first()
    if (front) await db.proxies.update(front.id, { backFaceId: null, updatedAt: now })
  }

  if (proxy?.splitPartnerId) {
    await db.proxies.update(proxy.splitPartnerId, { deletedAt: now, updatedAt: now })
  }

  if (proxy?.isSplitPartner) {
    // Igual que con el dorso: no hay índice por `splitPartnerId`, se busca a
    // mano la otra mitad que apunta a esta.
    const partner = await db.proxies.filter((p) => p.splitPartnerId === id).first()
    if (partner) await db.proxies.update(partner.id, { splitPartnerId: null, updatedAt: now })
  }

  if (proxy?.flipPartnerId) {
    await db.proxies.update(proxy.flipPartnerId, { deletedAt: now, updatedAt: now })
  }

  if (proxy?.isFlipPartner) {
    // Igual que con Split: no hay índice por `flipPartnerId`, se busca a mano
    // la otra cara que apunta a esta.
    const partner = await db.proxies.filter((p) => p.flipPartnerId === id).first()
    if (partner) await db.proxies.update(partner.id, { flipPartnerId: null, updatedAt: now })
  }
}

export async function softDeleteCollectionItem(cardId: string): Promise<void> {
  const now = Date.now()
  await db.collection.update(cardId, { deletedAt: now, updatedAt: now })
}

/**
 * Crea el dorso de un proxy existente: un `ProxyDesign` nuevo, en blanco salvo
 * el color de marco (para que arranque coherente con el frente), marcado
 * `isBackFace`, y vincula su id en el `backFaceId` del frente. Devuelve el
 * dorso creado.
 */
export async function createBackFace(frontId: string): Promise<StoredProxy> {
  const front = await getProxy(frontId)
  if (!front) throw new Error(`No existe el proxy ${frontId}`)
  if (front.backFaceId) throw new Error('Este proxy ya tiene un dorso')

  const now = Date.now()
  const base = proxyDesignSchema.parse({
    id: crypto.randomUUID(),
    frameColor: front.frameColor,
    createdAt: now,
    updatedAt: now,
  })
  const back: StoredProxy = {
    ...base,
    isBackFace: true,
    text: { ...base.text, name: front.text.name ? `${front.text.name} (dorso)` : '' },
  }

  await db.proxies.add(back)
  await db.proxies.update(frontId, { backFaceId: back.id, updatedAt: now })
  return back
}

/**
 * Quita el dorso de un proxy: lo borra (borrado lógico, igual que cualquier
 * otro proxy) y limpia el `backFaceId` del frente.
 */
export async function removeBackFace(frontId: string): Promise<void> {
  const front = await getProxy(frontId)
  if (!front?.backFaceId) return

  const now = Date.now()
  await db.proxies.update(front.backFaceId, { deletedAt: now, updatedAt: now })
  await db.proxies.update(frontId, { backFaceId: null, updatedAt: now })
}

/**
 * Crea la otra mitad de una Split existente: un `ProxyDesign` nuevo, en
 * blanco salvo el color de marco (igual que `createBackFace`), marcado
 * `isSplitPartner`, y vincula su id en el `splitPartnerId` de la primera
 * mitad. Devuelve la mitad creada.
 */
export async function createSplitPartner(firstId: string): Promise<StoredProxy> {
  const first = await getProxy(firstId)
  if (!first) throw new Error(`No existe el proxy ${firstId}`)
  if (first.splitPartnerId) throw new Error('Este proxy ya tiene otra mitad')

  const now = Date.now()
  const base = proxyDesignSchema.parse({
    id: crypto.randomUUID(),
    frameColor: first.frameColor,
    createdAt: now,
    updatedAt: now,
  })
  const partner: StoredProxy = {
    ...base,
    isSplitPartner: true,
    text: { ...base.text, name: first.text.name ? `${first.text.name} (mitad)` : '' },
  }

  await db.proxies.add(partner)
  await db.proxies.update(firstId, { splitPartnerId: partner.id, updatedAt: now })
  return partner
}

/**
 * Quita la otra mitad de una Split: la borra (borrado lógico) y limpia el
 * `splitPartnerId` de la primera mitad.
 */
export async function removeSplitPartner(firstId: string): Promise<void> {
  const first = await getProxy(firstId)
  if (!first?.splitPartnerId) return

  const now = Date.now()
  await db.proxies.update(first.splitPartnerId, { deletedAt: now, updatedAt: now })
  await db.proxies.update(firstId, { splitPartnerId: null, updatedAt: now })
}

/**
 * Crea la otra cara de una Flip existente: un `ProxyDesign` nuevo, en blanco
 * salvo el color de marco (igual que `createBackFace`/`createSplitPartner`),
 * marcado `isFlipPartner`, y vincula su id en el `flipPartnerId` de la
 * primera cara. Devuelve la cara creada.
 */
export async function createFlipPartner(firstId: string): Promise<StoredProxy> {
  const first = await getProxy(firstId)
  if (!first) throw new Error(`No existe el proxy ${firstId}`)
  if (first.flipPartnerId) throw new Error('Este proxy ya tiene otra cara')

  const now = Date.now()
  const base = proxyDesignSchema.parse({
    id: crypto.randomUUID(),
    frameColor: first.frameColor,
    createdAt: now,
    updatedAt: now,
  })
  const partner: StoredProxy = {
    ...base,
    isFlipPartner: true,
    text: { ...base.text, name: first.text.name ? `${first.text.name} (cara)` : '' },
  }

  await db.proxies.add(partner)
  await db.proxies.update(firstId, { flipPartnerId: partner.id, updatedAt: now })
  return partner
}

/**
 * Quita la otra cara de una Flip: la borra (borrado lógico) y limpia el
 * `flipPartnerId` de la primera cara.
 */
export async function removeFlipPartner(firstId: string): Promise<void> {
  const first = await getProxy(firstId)
  if (!first?.flipPartnerId) return

  const now = Date.now()
  await db.proxies.update(first.flipPartnerId, { deletedAt: now, updatedAt: now })
  await db.proxies.update(firstId, { flipPartnerId: null, updatedAt: now })
}

/**
 * Completa un proxy con los valores por defecto del esquema. Devuelve el mismo
 * objeto si ya estaba completo, para no crear basura en cada lectura.
 */
export function normalizeProxy(proxy: ProxyDesign): ProxyDesign {
  // El hook de lectura de Dexie también se dispara cuando no hay registro (un
  // `get` de un id que no existe), así que aquí llega `undefined`.
  if (proxy == null) return proxy

  if (
    proxy.variant !== undefined &&
    proxy.edited !== undefined &&
    proxy.text?.note !== undefined &&
    proxy.backFaceId !== undefined &&
    proxy.isBackFace !== undefined &&
    proxy.splitPartnerId !== undefined &&
    proxy.isSplitPartner !== undefined &&
    proxy.flipPartnerId !== undefined &&
    proxy.isFlipPartner !== undefined
  ) {
    return proxy
  }

  const parsed = proxyDesignSchema.safeParse(proxy)
  // `proxy` puede traer campos que no son del esquema (los de `SyncMeta`,
  // como `deletedAt`/`syncedAt`): zod los quitaría al parsear, así que se
  // mezcla sobre el original en vez de sustituirlo entero.
  if (parsed.success) return { ...proxy, ...parsed.data }

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
