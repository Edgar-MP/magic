import { z } from 'zod'
import { deckEntrySchema, formatSchema } from './deck.js'
import { proxyDesignSchema } from './proxy.js'

/**
 * Contrato de la sincronización, compartido por el navegador y el servidor.
 *
 * Las marcas de tiempo viajan como milisegundos desde época: son números en
 * IndexedDB y en JSON, y así no hay que fiarse de cómo cada extremo formatea una
 * fecha.
 *
 * Los conflictos se resuelven con **el último que escribe gana**, comparando
 * `updatedAt`. No hay fusión: si editas el mismo mazo en dos sitios a la vez,
 * sobrevive el que se guardó después. Para un usuario con varios dispositivos es
 * suficiente; que no espere nadie otra cosa.
 */

export const syncDeckSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  format: formatSchema,
  entries: z.array(deckEntrySchema),
  notes: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullish(),
})
export type SyncDeck = z.infer<typeof syncDeckSchema>

export const syncCollectionItemSchema = z.object({
  cardId: z.string().min(1),
  qty: z.number().int().nonnegative(),
  foil: z.number().int().nonnegative().nullish(),
  updatedAt: z.number(),
  deletedAt: z.number().nullish(),
})
export type SyncCollectionItem = z.infer<typeof syncCollectionItemSchema>

export const syncProxySchema = z.object({
  id: z.string().uuid(),
  design: proxyDesignSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullish(),
})
export type SyncProxy = z.infer<typeof syncProxySchema>

export const syncPushSchema = z.object({
  decks: z.array(syncDeckSchema).default([]),
  collection: z.array(syncCollectionItemSchema).default([]),
  proxies: z.array(syncProxySchema).default([]),
})
export type SyncPush = z.infer<typeof syncPushSchema>

/**
 * Qué pasó con cada registro enviado:
 *  - `applied`: escrito.
 *  - `stale`: el servidor tenía una versión más nueva; el cliente debe traérsela.
 *  - `rejected`: el id es de otro usuario. No debería pasar nunca.
 */
export const syncResultSchema = z.object({
  entity: z.enum(['deck', 'collection', 'proxy']),
  id: z.string(),
  status: z.enum(['applied', 'stale', 'rejected']),
  reason: z.string().optional(),
})
export type SyncResult = z.infer<typeof syncResultSchema>

export const syncPushResponseSchema = z.object({
  results: z.array(syncResultSchema),
  /** Reloj del servidor al terminar; sirve de cursor para el siguiente pull. */
  serverTime: z.number(),
})
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>

export const syncPullResponseSchema = z.object({
  decks: z.array(syncDeckSchema),
  collection: z.array(syncCollectionItemSchema),
  proxies: z.array(syncProxySchema),
  /**
   * Cursor para la siguiente llamada. Es la hora del servidor, no la del
   * cliente: los relojes no coinciden y con el del cliente se perderían cambios.
   */
  serverTime: z.number(),
  /** Ilustraciones que el servidor tiene de este usuario, para saber qué falta. */
  artIds: z.array(z.string()),
})
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>

export const artUploadResponseSchema = z.object({
  id: z.string().uuid(),
  size: z.number(),
  /** Cuánto le queda al usuario, en bytes. */
  remaining: z.number(),
})
export type ArtUploadResponse = z.infer<typeof artUploadResponseSchema>
