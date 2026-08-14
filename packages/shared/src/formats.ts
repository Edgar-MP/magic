import type { Card, Color } from './card.js'
import { canBeCommander, ignoresDeckLimit, isBasicLand } from './card.js'
import type { Board, Deck, Format } from './deck.js'
import { countBoard } from './deck.js'

export type IssueLevel = 'error' | 'warning'

export interface Issue {
  level: IssueLevel
  message: string
  /** Carta a la que apunta el problema, si aplica. */
  cardId?: string
}

/** Reglas de tamaño y copias de los formatos construidos. */
interface ConstructedRules {
  minMain: number
  maxSide: number
  maxCopies: number
}

const CONSTRUCTED: ConstructedRules = { minMain: 60, maxSide: 15, maxCopies: 4 }

/**
 * Qué clave de `legalities` de Scryfall consultar para cada formato nuestro.
 * `casual` no valida nada, así que no aparece.
 */
const LEGALITY_KEY: Partial<Record<Format, string>> = {
  commander: 'commander',
  standard: 'standard',
  pioneer: 'pioneer',
  modern: 'modern',
  legacy: 'legacy',
  vintage: 'vintage',
  pauper: 'pauper',
}

export type CardLookup = (cardId: string) => Card | undefined

/** Acepta un Map o cualquier función de búsqueda. */
export function toLookup(cards: Map<string, Card> | CardLookup): CardLookup {
  return typeof cards === 'function' ? cards : (id) => cards.get(id)
}

/**
 * Valida un mazo contra las reglas de su formato. Devuelve los problemas
 * ordenados con los errores primero. La legalidad carta a carta sale del campo
 * `legalities` de Scryfall, así que las banlists se actualizan solas.
 */
export function validateDeck(
  deck: Pick<Deck, 'format' | 'entries'>,
  cards: Map<string, Card> | CardLookup,
): Issue[] {
  const lookup = toLookup(cards)
  const issues: Issue[] = []

  if (deck.format === 'casual') return issues

  // Cartas que no tenemos en caché: no podemos validarlas, avisamos y seguimos.
  const resolved: { entry: Deck['entries'][number]; card: Card }[] = []
  for (const entry of deck.entries) {
    const card = lookup(entry.cardId)
    if (!card) {
      issues.push({
        level: 'warning',
        message: `Carta ${entry.cardId} no está en la caché, no se ha podido validar`,
        cardId: entry.cardId,
      })
      continue
    }
    resolved.push({ entry, card })
  }

  issues.push(...checkLegality(deck.format, resolved))

  if (deck.format === 'commander') {
    issues.push(...checkCommander(deck, resolved))
  } else {
    issues.push(...checkConstructed(deck, resolved))
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
}

type Resolved = { entry: Deck['entries'][number]; card: Card }

function checkLegality(format: Format, resolved: Resolved[]): Issue[] {
  const key = LEGALITY_KEY[format]
  if (!key) return []

  const issues: Issue[] = []
  for (const { card } of resolved) {
    const legality = card.legalities[key]
    if (legality === 'banned') {
      issues.push({ level: 'error', message: `${card.name} está prohibida`, cardId: card.id })
    } else if (legality === 'not_legal') {
      issues.push({
        level: 'error',
        message: `${card.name} no es legal en el formato`,
        cardId: card.id,
      })
    }
    // `restricted` se comprueba junto al límite de copias.
  }
  return issues
}

/** Copias por nombre de carta, sumando las zonas indicadas. */
function copiesByName(resolved: Resolved[], boards: Board[]): Map<string, { qty: number; card: Card }> {
  const counts = new Map<string, { qty: number; card: Card }>()
  for (const { entry, card } of resolved) {
    if (!boards.includes(entry.board)) continue
    const current = counts.get(card.name)
    if (current) current.qty += entry.qty
    else counts.set(card.name, { qty: entry.qty, card })
  }
  return counts
}

/** Las cartas exentas del límite de copias: básicas y las que lo dicen en su texto. */
function unlimited(card: Card): boolean {
  return isBasicLand(card) || ignoresDeckLimit(card)
}

function checkConstructed(
  deck: Pick<Deck, 'format' | 'entries'>,
  resolved: Resolved[],
): Issue[] {
  const issues: Issue[] = []
  const { minMain, maxSide, maxCopies } = CONSTRUCTED

  const main = countBoard(deck, 'main')
  if (main < minMain) {
    issues.push({
      level: 'error',
      message: `El mazo principal tiene ${main} cartas, el mínimo es ${minMain}`,
    })
  }

  const side = countBoard(deck, 'side')
  if (side > maxSide) {
    issues.push({
      level: 'error',
      message: `La banda tiene ${side} cartas, el máximo es ${maxSide}`,
    })
  }

  const command = countBoard(deck, 'command')
  if (command > 0) {
    issues.push({
      level: 'warning',
      message: 'Este formato no tiene zona de mando; esas cartas se ignoran',
    })
  }

  const legalityKey = LEGALITY_KEY[deck.format]
  for (const [name, { qty, card }] of copiesByName(resolved, ['main', 'side'])) {
    if (unlimited(card)) continue

    const restricted = legalityKey ? card.legalities[legalityKey] === 'restricted' : false
    const limit = restricted ? 1 : maxCopies
    if (qty > limit) {
      issues.push({
        level: 'error',
        message: restricted
          ? `${name}: ${qty} copias, es restringida (máximo 1)`
          : `${name}: ${qty} copias, el máximo es ${limit}`,
        cardId: card.id,
      })
    }
  }

  return issues
}

function checkCommander(
  deck: Pick<Deck, 'format' | 'entries'>,
  resolved: Resolved[],
): Issue[] {
  const issues: Issue[] = []

  const commanders = resolved.filter((r) => r.entry.board === 'command')

  if (commanders.length === 0) {
    issues.push({ level: 'error', message: 'Falta el comandante' })
  }
  if (commanders.length > 2) {
    issues.push({
      level: 'error',
      message: `Hay ${commanders.length} cartas en la zona de mando, el máximo es 2 (compañero o trasfondo)`,
    })
  }
  for (const { entry, card } of commanders) {
    if (entry.qty !== 1) {
      issues.push({
        level: 'error',
        message: `${card.name}: la zona de mando lleva 1 copia de cada carta`,
        cardId: card.id,
      })
    }
    if (!canBeCommander(card)) {
      issues.push({
        level: 'error',
        message: `${card.name} no puede ser comandante`,
        cardId: card.id,
      })
    }
  }

  const total = countBoard(deck, 'main') + countBoard(deck, 'command')
  if (total !== 100) {
    issues.push({
      level: 'error',
      message: `El mazo tiene ${total} cartas contando el comandante, deben ser exactamente 100`,
    })
  }

  // Singleton: una copia de cada carta en todo el mazo.
  for (const [name, { qty, card }] of copiesByName(resolved, ['main', 'command'])) {
    if (unlimited(card)) continue
    if (qty > 1) {
      issues.push({
        level: 'error',
        message: `${name}: ${qty} copias, Commander es singleton`,
        cardId: card.id,
      })
    }
  }

  // Identidad de color: ninguna carta puede salirse de la del comandante.
  if (commanders.length > 0) {
    const allowed = new Set<Color>()
    for (const { card } of commanders) for (const c of card.color_identity) allowed.add(c)

    for (const { entry, card } of resolved) {
      if (entry.board === 'side') continue
      const outside = card.color_identity.filter((c) => !allowed.has(c))
      if (outside.length > 0) {
        issues.push({
          level: 'error',
          message: `${card.name} está fuera de la identidad de color del comandante (${outside.join('')})`,
          cardId: card.id,
        })
      }
    }
  }

  return issues
}

/** Identidad de color combinada de las cartas de la zona de mando. */
export function commanderIdentity(
  deck: Pick<Deck, 'entries'>,
  cards: Map<string, Card> | CardLookup,
): Color[] {
  const lookup = toLookup(cards)
  const identity = new Set<Color>()
  for (const entry of deck.entries) {
    if (entry.board !== 'command') continue
    for (const c of lookup(entry.cardId)?.color_identity ?? []) identity.add(c)
  }
  return [...identity]
}
