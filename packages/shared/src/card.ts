import { z } from 'zod'

/**
 * Subconjunto del objeto Card de Scryfall que usamos. Deliberadamente laxo con
 * los campos que Scryfall marca como opcionales o que sólo existen en algunos
 * layouts (una tierra no tiene `mana_cost` propio, una criatura de doble cara
 * no tiene `oracle_text` en la raíz, etc.).
 */

export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const
export type Color = (typeof COLORS)[number]

export const colorSchema = z.enum(COLORS)

export const legalitySchema = z.enum(['legal', 'not_legal', 'restricted', 'banned'])
export type Legality = z.infer<typeof legalitySchema>

export const imageUrisSchema = z.object({
  small: z.string().optional(),
  normal: z.string().optional(),
  large: z.string().optional(),
  png: z.string().optional(),
  art_crop: z.string().optional(),
  border_crop: z.string().optional(),
})
export type ImageUris = z.infer<typeof imageUrisSchema>

/** Una cara de una carta multi-cara (transform, modal_dfc, flip…). */
export const cardFaceSchema = z.object({
  name: z.string(),
  mana_cost: z.string().optional(),
  type_line: z.string().optional(),
  oracle_text: z.string().optional(),
  flavor_text: z.string().optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
  /** Casillas de defensa iniciales de una Battle (sólo su cara frontal). */
  defense: z.string().optional(),
  colors: z.array(colorSchema).optional(),
  artist: z.string().optional(),
  image_uris: imageUrisSchema.optional(),
})
export type CardFace = z.infer<typeof cardFaceSchema>

export const cardSchema = z.object({
  id: z.string(),
  oracle_id: z.string().optional(),
  name: z.string(),
  lang: z.string().optional(),
  layout: z.string(),
  /** '1993' | '1997' | '2003' | '2015' | 'future' */
  frame: z.string().optional(),
  border_color: z.string().optional(),
  mana_cost: z.string().optional(),
  cmc: z.number().optional(),
  type_line: z.string().optional(),
  oracle_text: z.string().optional(),
  flavor_text: z.string().optional(),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
  /** Casillas de defensa de una Battle. Scryfall lo da a nivel de carta o de cara. */
  defense: z.string().optional(),
  colors: z.array(colorSchema).optional(),
  color_identity: z.array(colorSchema).default([]),
  keywords: z.array(z.string()).optional(),
  legalities: z.record(z.string(), legalitySchema).default({}),
  reserved: z.boolean().optional(),
  set: z.string(),
  set_name: z.string().optional(),
  collector_number: z.string().optional(),
  rarity: z.string().optional(),
  artist: z.string().optional(),
  image_uris: imageUrisSchema.optional(),
  card_faces: z.array(cardFaceSchema).optional(),
  /** Sólo lo usamos para detectar "puede haber cualquier número" en el texto. */
  produced_mana: z.array(z.string()).optional(),
  scryfall_uri: z.string().optional(),
})
export type Card = z.infer<typeof cardSchema>

/**
 * Versión recortada que va al índice local para el autocompletado offline.
 *
 * Está apretada a propósito: son 35.000 entradas y el fichero se baja entero.
 * El bloque `legalities` completo de Scryfall se lleva 17 de los 24 MB, así que
 * aquí sólo van los formatos que validamos y sólo cuando la carta es legal,
 * como una cadena separada por espacios. Total: 7 MB, 1,6 comprimido.
 */
export const cardIndexEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  set: z.string(),
  mana_cost: z.string().optional(),
  cmc: z.number().optional(),
  type_line: z.string().optional(),
  /** Identidad de color como cadena: `WU`. */
  ci: z.string().optional(),
  /** Formatos en los que es legal: `commander modern legacy`. */
  legal: z.string().optional(),
  /** Formatos en los que está restringida (Vintage). */
  restricted: z.string().optional(),
})
export type CardIndexEntry = z.infer<typeof cardIndexEntrySchema>

/** ¿Es legal en ese formato según el índice local? */
export function indexLegalIn(entry: CardIndexEntry, format: string): boolean {
  // Los espacios de los extremos evitan que `legacy` case dentro de otro nombre.
  return ` ${entry.legal ?? ''} `.includes(` ${format} `)
}

// --- Utilidades sobre cartas -------------------------------------------------

const BASIC_LANDS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'])

/** El nombre del lado principal, sin la parte de después de `//`. */
export function frontName(card: Pick<Card, 'name'>): string {
  const [front] = card.name.split(' // ')
  return front ?? card.name
}

export function isBasicLand(card: Pick<Card, 'name' | 'type_line'>): boolean {
  if (BASIC_LANDS.has(frontName(card))) return true
  // Snow-Covered Plains y similares.
  return /\bBasic\b.*\bLand\b/.test(card.type_line ?? '')
}

export function hasType(card: Pick<Card, 'type_line'>, type: string): boolean {
  return new RegExp(`\\b${type}\\b`, 'i').test(card.type_line ?? '')
}

export function isLegendary(card: Pick<Card, 'type_line'>): boolean {
  return hasType(card, 'Legendary')
}

/**
 * Cartas cuyo texto las exime del límite de copias ("A deck can have any number
 * of cards named…"): Relentless Rats, Shadowborn Apostle, Dragon's Approach…
 */
export function ignoresDeckLimit(card: Pick<Card, 'oracle_text'>): boolean {
  return /A deck can have any number of cards named/i.test(card.oracle_text ?? '')
}

/**
 * Puede ser comandante: criatura legendaria, o cualquier carta con "can be your
 * commander" en el texto (los Background y los planeswalkers tipo Commander).
 */
export function canBeCommander(card: Pick<Card, 'type_line' | 'oracle_text'>): boolean {
  if (/can be your commander/i.test(card.oracle_text ?? '')) return true
  return isLegendary(card) && hasType(card, 'Creature')
}

/** El coste de maná del lado que lo tenga, para cartas de doble cara. */
export function manaCostOf(card: Pick<Card, 'mana_cost' | 'card_faces'>): string {
  if (card.mana_cost) return card.mana_cost
  return card.card_faces?.[0]?.mana_cost ?? ''
}
