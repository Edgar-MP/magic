import type { Card, Color } from './card.js'
import { COLORS, hasType, manaCostOf } from './card.js'
import type { Deck } from './deck.js'
import type { CardLookup } from './formats.js'
import { toLookup } from './formats.js'

export interface DeckStats {
  /** Cartas por valor de maná; la última posición agrupa el 7 o más. */
  curve: { cmc: number; count: number }[]
  /** Cuántas cartas incluyen cada color en su coste. */
  colors: Record<Color, number>
  /** Cartas sin coste de color: incoloras y tierras. */
  colorless: number
  types: { type: string; count: number }[]
  lands: number
  spells: number
  averageCmc: number
}

const TYPES = [
  'Creature',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Planeswalker',
  'Battle',
  'Land',
]

const MAX_CURVE = 7

/**
 * Estadísticas del mazo principal más el comandante. Las tierras quedan fuera
 * de la curva de maná porque la distorsionan (todas serían coste 0).
 */
export function deckStats(
  deck: Pick<Deck, 'entries'>,
  cards: Map<string, Card> | CardLookup,
): DeckStats {
  const lookup = toLookup(cards)

  const curve = Array.from({ length: MAX_CURVE + 1 }, (_, cmc) => ({ cmc, count: 0 }))
  const colors = Object.fromEntries(COLORS.map((c) => [c, 0])) as Record<Color, number>
  const typeCounts = new Map<string, number>()

  let colorless = 0
  let lands = 0
  let spells = 0
  let cmcTotal = 0

  for (const entry of deck.entries) {
    if (entry.board === 'side') continue
    const card = lookup(entry.cardId)
    if (!card) continue

    const isLand = hasType(card, 'Land')
    if (isLand) lands += entry.qty
    else spells += entry.qty

    for (const type of TYPES) {
      if (hasType(card, type)) typeCounts.set(type, (typeCounts.get(type) ?? 0) + entry.qty)
    }

    const cost = manaCostOf(card)
    const costColors = COLORS.filter((c) => cost.includes(c))
    if (costColors.length === 0) colorless += entry.qty
    for (const c of costColors) colors[c] += entry.qty

    if (!isLand) {
      const cmc = Math.min(Math.round(card.cmc ?? 0), MAX_CURVE)
      const bucket = curve[cmc]
      if (bucket) bucket.count += entry.qty
      cmcTotal += (card.cmc ?? 0) * entry.qty
    }
  }

  return {
    curve,
    colors,
    colorless,
    types: TYPES.filter((t) => typeCounts.has(t)).map((t) => ({
      type: t,
      count: typeCounts.get(t) ?? 0,
    })),
    lands,
    spells,
    averageCmc: spells > 0 ? cmcTotal / spells : 0,
  }
}
