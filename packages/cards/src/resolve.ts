import type { Board, Card, DeckEntry, ParsedDecklist } from '@magic/shared'
import { getCards, putCards } from './db.js'
import { collection, type CardIdentifier } from './scryfall.js'

/**
 * Carga cartas por id tirando primero de la caché local y pidiendo a Scryfall
 * sólo las que falten (en lotes de 75). Las nuevas quedan cacheadas.
 */
export async function loadCards(ids: string[]): Promise<Map<string, Card>> {
  const unique = [...new Set(ids)]
  const { cards, missing } = await getCards(unique)
  if (missing.length === 0) return cards

  const { cards: fetched } = await collection(missing.map((id) => ({ id })))
  await putCards(fetched)
  for (const card of fetched) cards.set(card.id, card)
  return cards
}

export interface ResolvedDecklist {
  entries: DeckEntry[]
  /** Líneas cuyo nombre no existe en Scryfall. */
  notFound: { qty: number; name: string; board: Board }[]
  /** Líneas que no se pudieron ni parsear, tal cual las devolvió el parser. */
  invalid: ParsedDecklist['errors']
}

/**
 * Convierte una lista parseada en entradas de mazo, resolviendo los nombres
 * contra Scryfall de una sola tacada. Si la línea trae expansión y número, pide
 * esa impresión concreta; si no, la que Scryfall considere por defecto.
 */
export async function resolveDecklist(parsed: ParsedDecklist): Promise<ResolvedDecklist> {
  const identifiers: CardIdentifier[] = parsed.lines.map((line) => {
    if (line.set && line.collectorNumber) {
      return { set: line.set, collector_number: line.collectorNumber }
    }
    if (line.set) return { name: line.name, set: line.set }
    return { name: line.name }
  })

  const { cards } = await collection(identifiers)
  await putCards(cards)

  // Scryfall no garantiza el orden ni devuelve el identificador de vuelta, así
  // que emparejamos por nombre (comparando en minúsculas y sin la cara trasera).
  const byName = new Map<string, Card>()
  for (const card of cards) {
    byName.set(nameKey(card.name), card)
    const front = card.name.split(' // ')[0]
    if (front) byName.set(nameKey(front), card)
  }

  const entries: DeckEntry[] = []
  const notFound: ResolvedDecklist['notFound'] = []

  for (const line of parsed.lines) {
    const card = byName.get(nameKey(line.name))
    if (!card) {
      notFound.push({ qty: line.qty, name: line.name, board: line.board })
      continue
    }
    // Dos líneas pueden apuntar a la misma impresión (main y side): se suman.
    const existing = entries.find((e) => e.cardId === card.id && e.board === line.board)
    if (existing) existing.qty += line.qty
    else entries.push({ cardId: card.id, qty: line.qty, board: line.board })
  }

  return { entries, notFound, invalid: parsed.errors }
}

function nameKey(name: string): string {
  return name.trim().toLowerCase()
}
