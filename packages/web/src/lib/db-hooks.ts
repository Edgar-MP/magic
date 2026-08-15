import { useLiveQuery } from 'dexie-react-hooks'
import {
  createBackFace as createBackFaceDb,
  db,
  getCards,
  getDeck,
  getProxy,
  listCollection,
  listDecks,
  listProxies,
  loadCards,
  removeBackFace as removeBackFaceDb,
  softDeleteCollectionItem,
  softDeleteDeck,
  softDeleteProxy,
} from '@magic/cards'
import type { Card, Format } from '@magic/shared'
import { emptyDeck } from '@magic/shared'
import type { StoredDeck, StoredProxy } from '@magic/cards'
import { useEffect, useState } from 'react'

/** Acceso a los datos locales. Dexie avisa solo cuando algo cambia. */

export function newId(): string {
  return crypto.randomUUID()
}

export function useDecks(): StoredDeck[] | undefined {
  return useLiveQuery(() => listDecks(), [])
}

export function useDeck(id: string | undefined): StoredDeck | undefined {
  return useLiveQuery(() => (id ? getDeck(id) : undefined), [id])
}

export async function createDeck(name: string, format: Format): Promise<string> {
  const now = Date.now()
  const deck = emptyDeck(newId(), name, format, now)
  await db.decks.add(deck)
  return deck.id
}

export async function saveDeck(deck: StoredDeck): Promise<void> {
  await db.decks.put({ ...deck, updatedAt: Date.now() })
}

/**
 * Los borrados son lógicos: el registro se queda marcado para que la
 * sincronización pueda contárselo a los demás dispositivos.
 */
export async function deleteDeck(id: string): Promise<void> {
  await softDeleteDeck(id)
}

export function useProxies(): StoredProxy[] | undefined {
  return useLiveQuery(() => listProxies(), [])
}

export function useProxy(id: string | undefined): StoredProxy | undefined {
  return useLiveQuery(() => (id ? getProxy(id) : undefined), [id])
}

export async function deleteProxy(id: string): Promise<void> {
  await softDeleteProxy(id)
}

/** Crea el dorso de un proxy y devuelve su id, listo para navegar a editarlo. */
export async function createBackFace(frontId: string): Promise<string> {
  const back = await createBackFaceDb(frontId)
  return back.id
}

/** Quita el dorso de un proxy: lo borra y desvincula el frente. */
export async function removeBackFace(frontId: string): Promise<void> {
  await removeBackFaceDb(frontId)
}

export function useCollection() {
  return useLiveQuery(() => listCollection(), [])
}

export async function setCollectionQty(cardId: string, qty: number): Promise<void> {
  if (qty <= 0) await softDeleteCollectionItem(cardId)
  else await db.collection.put({ cardId, qty, updatedAt: Date.now() })
}

/**
 * Carga las cartas de una lista de ids: primero de la caché local y, si falta
 * alguna, pidiéndolas a Scryfall en lotes. Devuelve un mapa vacío mientras carga.
 */
export function useCardMap(ids: string[]): { cards: Map<string, Card>; loading: boolean } {
  const key = ids.join(',')
  const [cards, setCards] = useState<Map<string, Card>>(new Map())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (ids.length === 0) {
      setCards(new Map())
      return
    }

    let cancelled = false
    setLoading(true)

    // Lo que ya está en caché se pinta enseguida; el resto llega detrás.
    getCards(ids)
      .then(({ cards: cached }) => {
        if (!cancelled) setCards(new Map(cached))
        return loadCards(ids)
      })
      .then((complete) => {
        if (!cancelled) setCards(new Map(complete))
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // `key` resume la lista: así no se relanza en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { cards, loading }
}
