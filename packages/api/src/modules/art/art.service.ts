import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { prisma } from '../../db/client.js'
import type { Env } from '../../env.js'

/**
 * Ilustraciones subidas por la gente.
 *
 * Los ficheros van al volumen y no a Postgres: son varios MB cada uno y no hay
 * nada que consultar dentro. La fila sólo guarda el tamaño y el tipo; **la ruta
 * se deriva** del usuario y del id, porque una ruta guardada en la base de datos
 * es una ruta que alguien puede intentar manipular.
 */

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

/** `<DATA_DIR>/art/<userId>/<id>`; los dos son UUID, así que no hay que escapar. */
export function artPath(env: Env, userId: string, id: string): string {
  return join(env.DATA_DIR, 'art', userId, id)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}

export type UploadError =
  | { kind: 'bad-id' }
  | { kind: 'bad-mime'; mime: string }
  | { kind: 'too-large'; size: number; limit: number }
  | { kind: 'quota'; used: number; limit: number }

export interface UploadOk {
  id: string
  size: number
  remaining: number
}

/** Cuánto espacio ocupan ya las ilustraciones de un usuario. */
export async function usedBytes(userId: string): Promise<number> {
  const result = await prisma.artBlob.aggregate({
    where: { userId },
    _sum: { size: true },
  })
  return result._sum.size ?? 0
}

export async function uploadArt(
  env: Env,
  userId: string,
  id: string,
  mime: string,
  bytes: Uint8Array,
): Promise<UploadOk | UploadError> {
  if (!isUuid(id)) return { kind: 'bad-id' }
  if (!ALLOWED_MIME.has(mime)) return { kind: 'bad-mime', mime }
  if (bytes.byteLength > env.MAX_ART_BYTES) {
    return { kind: 'too-large', size: bytes.byteLength, limit: env.MAX_ART_BYTES }
  }

  const existing = await prisma.artBlob.findUnique({
    where: { id },
    select: { userId: true, size: true },
  })

  // Un id ajeno se trata como si no existiera: ni se sobrescribe ni se filtra
  // que ese id ya está cogido.
  if (existing && existing.userId !== userId) return { kind: 'bad-id' }

  // Al reemplazar, lo que ya ocupaba no cuenta dos veces.
  const used = (await usedBytes(userId)) - (existing?.size ?? 0)
  if (used + bytes.byteLength > env.MAX_ART_BYTES_PER_USER) {
    return { kind: 'quota', used, limit: env.MAX_ART_BYTES_PER_USER }
  }

  const path = artPath(env, userId, id)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)

  await prisma.artBlob.upsert({
    where: { id },
    create: { id, userId, mime, size: bytes.byteLength },
    update: { mime, size: bytes.byteLength },
  })

  return {
    id,
    size: bytes.byteLength,
    remaining: Math.max(0, env.MAX_ART_BYTES_PER_USER - (used + bytes.byteLength)),
  }
}

export interface ArtFile {
  mime: string
  size: number
  body: ReadableStream
}

/** Devuelve la ilustración sólo si es de este usuario. */
export async function readArt(
  env: Env,
  userId: string,
  id: string,
): Promise<ArtFile | undefined> {
  if (!isUuid(id)) return undefined

  const blob = await prisma.artBlob.findUnique({ where: { id } })
  if (!blob || blob.userId !== userId) return undefined

  const path = artPath(env, userId, id)
  try {
    // El tamaño se lee del disco: si la fila y el fichero no coinciden, manda el
    // fichero, que es lo que se va a enviar.
    const info = await stat(path)
    return {
      mime: blob.mime,
      size: info.size,
      body: Readable.toWeb(createReadStream(path)) as ReadableStream,
    }
  } catch {
    // Fila sin fichero: pasa si el volumen se recreó. Mejor un 404 que un 500.
    return undefined
  }
}
