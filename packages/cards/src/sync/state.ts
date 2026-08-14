import { db } from '../db.js'

/**
 * Cursor de la sincronización: hasta dónde se ha traído del servidor.
 *
 * Se guarda en la propia base local, en la tabla de metadatos, para que sobreviva
 * a recargas y sea por navegador (que es lo que representa).
 */

const CURSOR = 'syncCursor'

export interface SyncCursor {
  /** Hora del **servidor** de la última vez que se trajo algo. */
  serverTime: number
  /** Hora local del último intento, sólo para enseñarla. */
  lastRunAt: number
  /** Usuario al que corresponde: al cambiar de cuenta el cursor no vale. */
  userId: string
}

export async function readCursor(userId: string): Promise<SyncCursor> {
  const stored = (await db.meta.get(CURSOR))?.value as SyncCursor | undefined

  // Otra cuenta en el mismo navegador arranca de cero: si se reutilizara el
  // cursor, no se traería nada de la cuenta nueva.
  if (!stored || stored.userId !== userId) {
    return { serverTime: 0, lastRunAt: 0, userId }
  }
  return stored
}

export async function writeCursor(cursor: SyncCursor): Promise<void> {
  await db.meta.put({ key: CURSOR, value: cursor })
}

export async function clearCursor(): Promise<void> {
  await db.meta.delete(CURSOR)
}
