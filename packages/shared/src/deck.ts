import { z } from 'zod'

export const FORMATS = [
  'commander',
  'standard',
  'pioneer',
  'modern',
  'legacy',
  'vintage',
  'pauper',
  'casual',
] as const
export type Format = (typeof FORMATS)[number]

export const formatSchema = z.enum(FORMATS)

export const FORMAT_LABELS: Record<Format, string> = {
  commander: 'Commander',
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  legacy: 'Legacy',
  vintage: 'Vintage',
  pauper: 'Pauper',
  casual: 'Casual (sin validar)',
}

/** En qué zona del mazo está la carta. */
export const boardSchema = z.enum(['main', 'side', 'command'])
export type Board = z.infer<typeof boardSchema>

export const deckEntrySchema = z.object({
  /** id de impresión de Scryfall: identifica la ilustración concreta. */
  cardId: z.string(),
  qty: z.number().int().positive(),
  board: boardSchema.default('main'),
  /** Proxy asociado, si el usuario ha hecho uno para esta carta del mazo. */
  proxyId: z.string().optional(),
})
export type DeckEntry = z.infer<typeof deckEntrySchema>

export const deckSchema = z.object({
  id: z.string(),
  name: z.string(),
  format: formatSchema,
  entries: z.array(deckEntrySchema).default([]),
  notes: z.string().optional(),
  /** Token público para el enlace de «compartir mazo». Ausente = no compartido. */
  shareToken: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Deck = z.infer<typeof deckSchema>

export function emptyDeck(id: string, name: string, format: Format, now: number): Deck {
  return { id, name, format, entries: [], createdAt: now, updatedAt: now }
}

export function countBoard(deck: Pick<Deck, 'entries'>, board: Board): number {
  return deck.entries
    .filter((e) => e.board === board)
    .reduce((total, e) => total + e.qty, 0)
}

/** Total de cartas físicas del mazo, sin contar la banda. */
export function deckSize(deck: Pick<Deck, 'entries'>): number {
  return countBoard(deck, 'main') + countBoard(deck, 'command')
}
