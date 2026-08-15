import type {
  SyncCollectionItem,
  SyncDeck,
  SyncProxy,
  SyncPullResponse,
  SyncPush,
  SyncPushResponse,
} from '@magic/shared'
import { db, isAlive, type CollectionItem, type StoredDeck, type StoredProxy } from '../db.js'
import { readCursor, writeCursor } from './state.js'

/**
 * Sincronización local-first.
 *
 * IndexedDB manda: se sube lo que ha cambiado aquí, se baja lo que ha cambiado
 * allí y, cuando los dos han tocado lo mismo, gana el que tenga el `updatedAt`
 * más alto. No hay fusión.
 *
 * Un registro está pendiente si `updatedAt > (syncedAt ?? 0)`. Después de subir
 * se marca `syncedAt`, así que un cambio repetido no se manda dos veces.
 */

/** Lo que el motor necesita del exterior, para poder probarlo sin red. */
export interface SyncTransport {
  push(body: SyncPush): Promise<SyncPushResponse>
  pull(since: number): Promise<SyncPullResponse>
  uploadArt(id: string, blob: Blob): Promise<void>
  downloadArt(id: string): Promise<Blob | undefined>
}

export interface SyncReport {
  pushed: { decks: number; collection: number; proxies: number }
  pulled: { decks: number; collection: number; proxies: number }
  artUploaded: number
  artDownloaded: number
  /** Rechazos y demás avisos que merece la pena enseñar. */
  problems: string[]
}

const pending = <T extends { updatedAt: number; syncedAt?: number }>(rows: T[]): T[] =>
  rows.filter((row) => row.updatedAt > (row.syncedAt ?? 0))

// --- Subida ------------------------------------------------------------------

function deckToWire(deck: StoredDeck): SyncDeck {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    entries: deck.entries,
    ...(deck.notes !== undefined ? { notes: deck.notes } : {}),
    ...(deck.shareToken !== undefined ? { shareToken: deck.shareToken } : {}),
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    deletedAt: deck.deletedAt ?? null,
  }
}

function itemToWire(item: CollectionItem): SyncCollectionItem {
  return {
    cardId: item.cardId,
    qty: item.qty,
    foil: item.foil ?? null,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt ?? null,
  }
}

function proxyToWire(proxy: StoredProxy): SyncProxy {
  // `syncedAt` y `deletedAt` son contabilidad local: el diseño que viaja es el
  // que entiende el renderizador, sin añadidos.
  const { syncedAt: _syncedAt, deletedAt, ...design } = proxy
  return {
    id: proxy.id,
    design,
    createdAt: proxy.createdAt,
    updatedAt: proxy.updatedAt,
    deletedAt: deletedAt ?? null,
  }
}

// --- Bajada ------------------------------------------------------------------

/**
 * Aplica un registro del servidor si es más nuevo que el local. Devuelve si
 * escribió, para poder contar.
 */
async function applyIfNewer<T extends { updatedAt: number }>(
  local: (T & { syncedAt?: number }) | undefined,
  remote: { updatedAt: number },
  write: () => Promise<unknown>,
): Promise<boolean> {
  if (local && local.updatedAt > remote.updatedAt) return false
  await write()
  return true
}

export interface SyncOptions {
  userId: string
  transport: SyncTransport
}

export async function runSync({ userId, transport }: SyncOptions): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: { decks: 0, collection: 0, proxies: 0 },
    pulled: { decks: 0, collection: 0, proxies: 0 },
    artUploaded: 0,
    artDownloaded: 0,
    problems: [],
  }

  const cursor = await readCursor(userId)

  // 1. Subir lo pendiente.
  const [decks, collection, proxies] = await Promise.all([
    db.decks.toArray(),
    db.collection.toArray(),
    db.proxies.toArray(),
  ])

  const pendingDecks = pending(decks)
  const pendingItems = pending(collection)
  const pendingProxies = pending(proxies)

  // Las ilustraciones van antes que los proxies que las usan: si el proxy
  // llegara primero, el otro dispositivo se lo encontraría sin imagen.
  const referenced = new Set(
    pendingProxies.map((p) => p.art.blobId).filter((id): id is string => !!id),
  )
  for (const id of referenced) {
    const blob = await db.blobs.get(id)
    if (!blob || blob.syncedAt !== undefined) continue
    try {
      await transport.uploadArt(id, blob.blob)
      await db.blobs.update(id, { syncedAt: Date.now() })
      report.artUploaded += 1
    } catch (error) {
      report.problems.push(`no se pudo subir una ilustración: ${(error as Error).message}`)
    }
  }

  if (pendingDecks.length > 0 || pendingItems.length > 0 || pendingProxies.length > 0) {
    const response = await transport.push({
      decks: pendingDecks.map(deckToWire),
      collection: pendingItems.map(itemToWire),
      proxies: pendingProxies.map(proxyToWire),
    })

    const byId = new Map(response.results.map((r) => [`${r.entity}:${r.id}`, r]))

    // Se marca la **versión que se subió**, no la hora de ahora. Con la hora
    // actual, un cambio hecho mientras la petición estaba en vuelo quedaría
    // marcado como subido sin haberse enviado, y se perdería.
    //
    // Y sólo lo que el servidor aceptó: lo `stale` se queda pendiente y lo
    // arregla la bajada de justo después.
    for (const deck of pendingDecks) {
      if (byId.get(`deck:${deck.id}`)?.status !== 'applied') continue
      await db.decks.update(deck.id, { syncedAt: deck.updatedAt })
      report.pushed.decks += 1
    }
    for (const item of pendingItems) {
      if (byId.get(`collection:${item.cardId}`)?.status !== 'applied') continue
      await db.collection.update(item.cardId, { syncedAt: item.updatedAt })
      report.pushed.collection += 1
    }
    for (const proxy of pendingProxies) {
      if (byId.get(`proxy:${proxy.id}`)?.status !== 'applied') continue
      await db.proxies.update(proxy.id, { syncedAt: proxy.updatedAt })
      report.pushed.proxies += 1
    }

    for (const result of response.results) {
      if (result.status === 'rejected') {
        report.problems.push(`el servidor rechazó ${result.entity} ${result.id}: ${result.reason}`)
      }
    }
  }

  // 2. Bajar lo que haya cambiado allí.
  const remote = await transport.pull(cursor.serverTime)

  for (const deck of remote.decks) {
    const local = await db.decks.get(deck.id)
    const written = await applyIfNewer(local, deck, () =>
      db.decks.put({
        id: deck.id,
        name: deck.name,
        format: deck.format,
        entries: deck.entries,
        ...(deck.notes !== undefined && deck.notes !== null ? { notes: deck.notes } : {}),
        ...(deck.shareToken !== undefined && deck.shareToken !== null
          ? { shareToken: deck.shareToken }
          : {}),
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
        ...(deck.deletedAt ? { deletedAt: deck.deletedAt } : {}),
        // Viene del servidor, así que ya está sincronizado.
        syncedAt: deck.updatedAt,
      }),
    )
    if (written) report.pulled.decks += 1
  }

  for (const item of remote.collection) {
    const local = await db.collection.get(item.cardId)
    const written = await applyIfNewer(local, item, () =>
      db.collection.put({
        cardId: item.cardId,
        qty: item.qty,
        ...(item.foil !== undefined && item.foil !== null ? { foil: item.foil } : {}),
        updatedAt: item.updatedAt,
        ...(item.deletedAt ? { deletedAt: item.deletedAt } : {}),
        syncedAt: item.updatedAt,
      }),
    )
    if (written) report.pulled.collection += 1
  }

  for (const proxy of remote.proxies) {
    const local = await db.proxies.get(proxy.id)
    const written = await applyIfNewer(local, proxy, () =>
      db.proxies.put({
        ...proxy.design,
        id: proxy.id,
        createdAt: proxy.createdAt,
        updatedAt: proxy.updatedAt,
        ...(proxy.deletedAt ? { deletedAt: proxy.deletedAt } : {}),
        syncedAt: proxy.updatedAt,
      }),
    )
    if (written) report.pulled.proxies += 1
  }

  // 3. Traerse las ilustraciones de los proxies que hayan llegado y falten.
  const needed = new Set(
    (await db.proxies.toArray())
      .filter(isAlive)
      .map((p) => p.art.blobId)
      .filter((id): id is string => !!id),
  )

  for (const id of needed) {
    if (!remote.artIds.includes(id)) continue
    if (await db.blobs.get(id)) continue

    try {
      const blob = await transport.downloadArt(id)
      if (!blob) continue
      await db.blobs.put({
        id,
        blob,
        mime: blob.type,
        createdAt: Date.now(),
        // Está en el servidor: no hay que volver a subirla.
        syncedAt: Date.now(),
      })
      report.artDownloaded += 1
    } catch (error) {
      report.problems.push(`no se pudo bajar una ilustración: ${(error as Error).message}`)
    }
  }

  await writeCursor({ serverTime: remote.serverTime, lastRunAt: Date.now(), userId })

  return report
}

/** Cuántos cambios hay sin subir, para poder enseñarlo. */
export async function countPending(): Promise<number> {
  const [decks, collection, proxies] = await Promise.all([
    db.decks.toArray(),
    db.collection.toArray(),
    db.proxies.toArray(),
  ])
  return pending(decks).length + pending(collection).length + pending(proxies).length
}
