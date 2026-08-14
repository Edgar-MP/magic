import type {
  SyncPullResponse,
  SyncPush,
  SyncPushResponse,
  SyncResult,
} from '@magic/shared'
import { prisma } from '../../db/client.js'

/**
 * Sincronización en dos direcciones.
 *
 * Cada consulta lleva su `userId` escrito a mano en el `where`. Podría hacerse
 * con una extensión de Prisma que lo inyecte, pero con cuatro tablas y consultas
 * triviales un `where` explícito es más difícil de romper que una extensión con
 * agujeros (agregaciones, relaciones anidadas). El test de aislamiento lo
 * respalda.
 */

const toDate = (ms: number) => new Date(ms)
const toMs = (date: Date) => date.getTime()
const nullableDate = (ms: number | null | undefined) => (ms == null ? null : new Date(ms))

/**
 * ¿Lo que llega es más viejo que lo que ya hay? Entonces no se escribe y se
 * responde `stale` para que el cliente se traiga la versión buena.
 */
function isStale(incoming: number, existing: Date | undefined): boolean {
  return existing !== undefined && incoming < existing.getTime()
}

export async function pushSync(userId: string, input: SyncPush): Promise<SyncPushResponse> {
  const results: SyncResult[] = []

  // Una transacción por entidad y no una para todo: un mazo que falle no debe
  // tirar la subida de las otras cincuenta cartas.
  for (const deck of input.decks) {
    const existing = await prisma.deck.findUnique({
      where: { id: deck.id },
      select: { userId: true, updatedAt: true },
    })

    if (existing && existing.userId !== userId) {
      results.push({ entity: 'deck', id: deck.id, status: 'rejected', reason: 'de otro usuario' })
      continue
    }
    if (isStale(deck.updatedAt, existing?.updatedAt)) {
      results.push({ entity: 'deck', id: deck.id, status: 'stale' })
      continue
    }

    const data = {
      userId,
      name: deck.name,
      format: deck.format,
      entries: deck.entries,
      notes: deck.notes ?? null,
      createdAt: toDate(deck.createdAt),
      updatedAt: toDate(deck.updatedAt),
      deletedAt: nullableDate(deck.deletedAt),
      serverUpdatedAt: new Date(),
    }

    await prisma.deck.upsert({ where: { id: deck.id }, create: { id: deck.id, ...data }, update: data })
    results.push({ entity: 'deck', id: deck.id, status: 'applied' })
  }

  for (const item of input.collection) {
    const key = { userId_cardId: { userId, cardId: item.cardId } }
    const existing = await prisma.collectionItem.findUnique({
      where: key,
      select: { updatedAt: true },
    })

    if (isStale(item.updatedAt, existing?.updatedAt)) {
      results.push({ entity: 'collection', id: item.cardId, status: 'stale' })
      continue
    }

    const data = {
      qty: item.qty,
      foil: item.foil ?? null,
      updatedAt: toDate(item.updatedAt),
      deletedAt: nullableDate(item.deletedAt),
      serverUpdatedAt: new Date(),
    }

    await prisma.collectionItem.upsert({
      where: key,
      create: { userId, cardId: item.cardId, ...data },
      update: data,
    })
    results.push({ entity: 'collection', id: item.cardId, status: 'applied' })
  }

  for (const proxy of input.proxies) {
    const existing = await prisma.proxy.findUnique({
      where: { id: proxy.id },
      select: { userId: true, updatedAt: true },
    })

    if (existing && existing.userId !== userId) {
      results.push({ entity: 'proxy', id: proxy.id, status: 'rejected', reason: 'de otro usuario' })
      continue
    }
    if (isStale(proxy.updatedAt, existing?.updatedAt)) {
      results.push({ entity: 'proxy', id: proxy.id, status: 'stale' })
      continue
    }

    const data = {
      userId,
      design: proxy.design,
      // Se saca del propio diseño: así saber qué ilustraciones están en uso es
      // una consulta y no hay que abrir el JSON.
      artBlobId: proxy.design.art.blobId ?? null,
      createdAt: toDate(proxy.createdAt),
      updatedAt: toDate(proxy.updatedAt),
      deletedAt: nullableDate(proxy.deletedAt),
      serverUpdatedAt: new Date(),
    }

    await prisma.proxy.upsert({
      where: { id: proxy.id },
      create: { id: proxy.id, ...data },
      update: data,
    })
    results.push({ entity: 'proxy', id: proxy.id, status: 'applied' })
  }

  return { results, serverTime: Date.now() }
}

/**
 * Todo lo que ha cambiado para este usuario desde `since`, incluidas las lápidas
 * (los registros con `deletedAt`), que es lo que propaga un borrado.
 */
export async function pullSync(userId: string, since: number): Promise<SyncPullResponse> {
  // Se lee el reloj antes de consultar: si se leyera después, algo escrito
  // durante la consulta quedaría por debajo del cursor y no se traería nunca.
  const serverTime = Date.now()
  const after = { gt: new Date(since) }

  const [decks, collection, proxies, artBlobs] = await Promise.all([
    prisma.deck.findMany({ where: { userId, serverUpdatedAt: after } }),
    prisma.collectionItem.findMany({ where: { userId, serverUpdatedAt: after } }),
    prisma.proxy.findMany({ where: { userId, serverUpdatedAt: after } }),
    prisma.artBlob.findMany({ where: { userId }, select: { id: true } }),
  ])

  return {
    decks: decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      format: deck.format as SyncPullResponse['decks'][number]['format'],
      entries: deck.entries as SyncPullResponse['decks'][number]['entries'],
      ...(deck.notes !== null ? { notes: deck.notes } : {}),
      createdAt: toMs(deck.createdAt),
      updatedAt: toMs(deck.updatedAt),
      deletedAt: deck.deletedAt ? toMs(deck.deletedAt) : null,
    })),
    collection: collection.map((item) => ({
      cardId: item.cardId,
      qty: item.qty,
      foil: item.foil,
      updatedAt: toMs(item.updatedAt),
      deletedAt: item.deletedAt ? toMs(item.deletedAt) : null,
    })),
    proxies: proxies.map((proxy) => ({
      id: proxy.id,
      design: proxy.design as SyncPullResponse['proxies'][number]['design'],
      createdAt: toMs(proxy.createdAt),
      updatedAt: toMs(proxy.updatedAt),
      deletedAt: proxy.deletedAt ? toMs(proxy.deletedAt) : null,
    })),
    serverTime,
    artIds: artBlobs.map((blob) => blob.id),
  }
}
