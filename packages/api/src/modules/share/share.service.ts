import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import type { DeckEntry, ProxyDesign } from '@magic/shared'
import { prisma } from '../../db/client.js'
import type { Env } from '../../env.js'
import { artPath, isUuid } from '../art/art.service.js'

/**
 * Vista pública de un mazo compartido: sin sesión, localizado sólo por el
 * `shareToken`. El servidor sigue tratando `entries`/`design` como JSON
 * opaco, igual que en la sincronización.
 */

export interface SharedProxy {
  id: string
  design: ProxyDesign
}

export interface SharedDeck {
  deck: { name: string; format: string; entries: DeckEntry[] }
  proxies: SharedProxy[]
}

/** Busca el mazo por token y los proxies que referencia. `undefined` si no existe. */
export async function findSharedDeck(token: string): Promise<SharedDeck | undefined> {
  const deck = await prisma.deck.findUnique({
    where: { shareToken: token },
  })
  if (!deck || deck.deletedAt) return undefined

  const entries = deck.entries as DeckEntry[]
  const proxyIds = entries.map((e) => e.proxyId).filter((id): id is string => !!id)

  const proxies =
    proxyIds.length === 0
      ? []
      : await prisma.proxy.findMany({
          where: { userId: deck.userId, id: { in: proxyIds }, deletedAt: null },
        })

  return {
    deck: { name: deck.name, format: deck.format, entries },
    proxies: proxies.map((p) => ({ id: p.id, design: p.design as ProxyDesign })),
  }
}

export interface SharedArtFile {
  mime: string
  size: number
  body: ReadableStream
}

/**
 * Sirve una ilustración de un mazo compartido, comprobando doble: el blob
 * pertenece al dueño del mazo del token, Y ese blobId aparece de verdad en el
 * `art.blobId` de alguno de los proxies de ESE mazo. Así el token no sirve de
 * llave universal a cualquier imagen del dueño por fuerza bruta del id.
 */
export async function readSharedArt(
  env: Env,
  token: string,
  blobId: string,
): Promise<SharedArtFile | undefined> {
  if (!isUuid(blobId)) return undefined

  const shared = await findSharedDeck(token)
  if (!shared) return undefined

  const usedByDeck = shared.proxies.some((p) => p.design.art.blobId === blobId)
  if (!usedByDeck) return undefined

  const deck = await prisma.deck.findUnique({ where: { shareToken: token }, select: { userId: true } })
  if (!deck) return undefined

  const blob = await prisma.artBlob.findUnique({ where: { id: blobId } })
  if (!blob || blob.userId !== deck.userId) return undefined

  const path = artPath(env, deck.userId, blobId)
  try {
    const info = await stat(path)
    return {
      mime: blob.mime,
      size: info.size,
      body: Readable.toWeb(createReadStream(path)) as ReadableStream,
    }
  } catch {
    return undefined
  }
}
