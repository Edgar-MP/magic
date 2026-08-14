import { useLiveQuery } from 'dexie-react-hooks'
import { db, getCards, loadCards } from '@magic/cards'
import type { Card, Deck, Format, ProxyDesign } from '@magic/shared'
import { emptyDeck } from '@magic/shared'
import { useEffect, useState } from 'react'

/** Acceso a los datos locales. Dexie avisa solo cuando algo cambia. */

export function newId(): string {
  return crypto.randomUUID()
}

export function useDecks(): Deck[] | undefined {
  return useLiveQuery(() => db.decks.orderBy('updatedAt').reverse().toArray(), [])
}

export function useDeck(id: string | undefined): Deck | undefined {
  return useLiveQuery(() => (id ? db.decks.get(id) : undefined), [id])
}

export async function createDeck(name: string, format: Format): Promise<string> {
  const now = Date.now()
  const deck = emptyDeck(newId(), name, format, now)
  await db.decks.add(deck)
  return deck.id
}

export async function saveDeck(deck: Deck): Promise<void> {
  await db.decks.put({ ...deck, updatedAt: Date.now() })
}

export async function deleteDeck(id: string): Promise<void> {
  await db.decks.delete(id)
}

export function useProxies(): ProxyDesign[] | undefined {
  return useLiveQuery(() => db.proxies.orderBy('updatedAt').reverse().toArray(), [])
}

export function useProxy(id: string | undefined): ProxyDesign | undefined {
  return useLiveQuery(() => (id ? db.proxies.get(id) : undefined), [id])
}

export function useCollection() {
  return useLiveQuery(() => db.collection.toArray(), [])
}

export async function setCollectionQty(cardId: string, qty: number): Promise<void> {
  if (qty <= 0) await db.collection.delete(cardId)
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
