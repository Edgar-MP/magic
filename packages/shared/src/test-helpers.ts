import type { Card, Color, Legality } from './card.js'
import type { Board, Deck, Format } from './deck.js'

let counter = 0

/** Carta mínima para tests: sólo hay que dar lo que importa en cada caso. */
export function makeCard(partial: Partial<Card> & { name: string }): Card {
  counter += 1
  return {
    id: partial.id ?? `card-${counter}`,
    layout: 'normal',
    set: 'tst',
    color_identity: [],
    legalities: {},
    ...partial,
  }
}

export function legalEverywhere(...formats: string[]): Record<string, Legality> {
  return Object.fromEntries(formats.map((f) => [f, 'legal' as Legality]))
}

export function creature(name: string, identity: Color[] = [], extra: Partial<Card> = {}): Card {
  return makeCard({
    name,
    type_line: 'Creature — Human',
    color_identity: identity,
    legalities: legalEverywhere('commander', 'modern', 'standard', 'legacy', 'vintage'),
    cmc: 2,
    mana_cost: '{1}{W}',
    ...extra,
  })
}

export function basic(name = 'Island', identity: Color[] = ['U']): Card {
  return makeCard({
    name,
    type_line: 'Basic Land — Island',
    color_identity: identity,
    legalities: legalEverywhere('commander', 'modern', 'standard', 'legacy', 'vintage', 'pauper'),
    cmc: 0,
  })
}

export function makeDeck(
  format: Format,
  entries: { card: Card; qty?: number; board?: Board }[],
): { deck: Deck; cards: Map<string, Card> } {
  const cards = new Map<string, Card>()
  for (const e of entries) cards.set(e.card.id, e.card)

  return {
    deck: {
      id: 'deck-1',
      name: 'Test',
      format,
      entries: entries.map((e) => ({
        cardId: e.card.id,
        qty: e.qty ?? 1,
        board: e.board ?? 'main',
      })),
      createdAt: 0,
      updatedAt: 0,
    },
    cards,
  }
}

/** Rellena hasta `total` cartas del mazo principal con básicas distintas. */
export function padWithBasics(
  entries: { card: Card; qty?: number; board?: Board }[],
  total: number,
): { card: Card; qty?: number; board?: Board }[] {
  const current = entries
    .filter((e) => e.board !== 'side')
    .reduce((sum, e) => sum + (e.qty ?? 1), 0)
  const missing = total - current
  if (missing <= 0) return entries
  return [...entries, { card: basic(), qty: missing }]
}
