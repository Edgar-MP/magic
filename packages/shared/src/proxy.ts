import { z } from 'zod'

/**
 * Variantes de color de marco. Los nombres coinciden con las carpetas del juego
 * de assets (`data/borders/m15/<color>/`), así que sirven de ruta directamente.
 */
export const FRAME_COLORS = [
  'white',
  'blue',
  'black',
  'red',
  'green',
  'gold',
  'colorless',
  'artifact',
  'vehicle',
  'whiteLand',
  'blueLand',
  'blackLand',
  'redLand',
  'greenLand',
  'goldLand',
  'colorlessLand',
] as const
export type FrameColor = (typeof FRAME_COLORS)[number]
export const frameColorSchema = z.enum(FRAME_COLORS)

export const FRAME_SETS = ['m15', '8th', 'old'] as const
export type FrameSetId = (typeof FRAME_SETS)[number]
export const frameSetSchema = z.enum(FRAME_SETS)

/**
 * Cómo se reparten el arte y el marco:
 *  - `regular`: la carta de siempre, con su borde negro y su caja de texto opaca.
 *  - `extendedArt`: la caja de texto es transparente y el arte se ve por detrás.
 *  - `borderless`: el arte llega a los cuatro cantos, sin borde negro.
 *  - `fullArtLand`: la tierra básica sin texto de reglas, con el nombre arriba y
 *    el tipo abajo junto al símbolo de maná, como las básicas modernas.
 */
export const CARD_VARIANTS = ['regular', 'extendedArt', 'borderless', 'fullArtLand'] as const
export type CardVariant = (typeof CARD_VARIANTS)[number]
export const cardVariantSchema = z.enum(CARD_VARIANTS)

export const CARD_VARIANT_LABELS: Record<CardVariant, string> = {
  regular: 'Normal',
  extendedArt: 'Arte extendido',
  borderless: 'Sin bordes',
  fullArtLand: 'Tierra full art',
}

/**
 * Encuadre del arte dentro de su ventana. `x`/`y` son el desplazamiento del
 * centro en fracciones del ancho/alto de la ventana (0 = centrado), y `scale`
 * multiplica el tamaño mínimo que cubre la ventana (1 = justo la cubre).
 */
export const artSchema = z.object({
  /** Clave del blob guardado en Dexie con la imagen que ha subido el usuario. */
  blobId: z.string().optional(),
  /** Alternativa al blob: una URL (por ejemplo el `art_crop` de Scryfall). */
  url: z.string().optional(),
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
})
export type ArtPlacement = z.infer<typeof artSchema>

export const proxyTextSchema = z.object({
  name: z.string().default(''),
  /** Coste de maná en notación de Scryfall: `{2}{W}{U}`. */
  mana: z.string().default(''),
  type: z.string().default(''),
  oracle: z.string().default(''),
  flavor: z.string().default(''),
  /**
   * Etiqueta pequeña en una cajita bajo el nombre. Para poner de qué carta sale
   * el proxy, «PROXY», o lo que haga falta. Vacía no se dibuja.
   */
  note: z.string().default(''),
  /** `3/4`, o vacío si la carta no tiene fuerza/resistencia. */
  pt: z.string().default(''),
  artist: z.string().default(''),
  /** Línea inferior: `M10 • ES 146/249`, o lo que quiera el usuario. */
  info: z.string().default(''),
})
export type ProxyText = z.infer<typeof proxyTextSchema>

export const proxyFlagsSchema = z.object({
  legendary: z.boolean().default(false),
  nyx: z.boolean().default(false),
  /** Sello holográfico de rara/mítica en la parte inferior. */
  stamp: z.boolean().default(false),
  showPt: z.boolean().default(false),
})
export type ProxyFlags = z.infer<typeof proxyFlagsSchema>

/** Una habilidad de lealtad: `+1`, `-3`, `0`… y su texto. */
export const planeswalkerAbilitySchema = z.object({
  cost: z.string().default('+1'),
  text: z.string().default(''),
})
export type PlaneswalkerAbility = z.infer<typeof planeswalkerAbilitySchema>

/**
 * Un capítulo de saga: `chapter` lleva el numeral romano tal cual aparece en
 * la carta real («I», «II», o rangos compartidos como «I, II»), y `text` el
 * efecto de ese capítulo.
 */
export const sagaChapterSchema = z.object({
  chapter: z.string().default('I'),
  text: z.string().default(''),
})
export type SagaChapter = z.infer<typeof sagaChapterSchema>

/**
 * `card` es la plantilla normal (criatura/hechizo/tierra…); `planeswalker`
 * cambia a la caja de habilidades con coste de lealtad; `saga` cambia a la
 * franja lateral con capítulos numerados. No hay más plantillas especiales
 * todavía (class, battle…), pero el campo ya deja sitio.
 */
export const CARD_LAYOUTS = ['card', 'planeswalker', 'saga'] as const
export type CardLayout = (typeof CARD_LAYOUTS)[number]

export const proxyDesignSchema = z.object({
  id: z.string(),
  /** Carta de Scryfall de la que salió, para poder volver a ella. */
  sourceCardId: z.string().optional(),
  layout: z.enum(CARD_LAYOUTS).default('card'),
  frameSet: frameSetSchema.default('m15'),
  variant: cardVariantSchema.default('regular'),
  frameColor: frameColorSchema.default('colorless'),
  /** Segundo color: dibuja el degradado de carta multicolor. */
  secondColor: frameColorSchema.optional(),
  flags: proxyFlagsSchema.default({
    legendary: false,
    nyx: false,
    stamp: false,
    showPt: false,
  }),
  art: artSchema.default({ x: 0, y: 0, scale: 1 }),
  text: proxyTextSchema.default({
    name: '',
    mana: '',
    type: '',
    oracle: '',
    flavor: '',
    note: '',
    pt: '',
    artist: '',
    info: '',
  }),
  /** Símbolo de expansión: URL del SVG (Scryfall lo da por expansión). */
  setSymbol: z.string().optional(),
  /**
   * Marca de agua grande de tierra básica. Las básicas no llevan texto de
   * reglas, llevan este símbolo centrado en la caja de texto.
   */
  basicWatermark: z.enum(['w', 'u', 'b', 'r', 'g', 'c']).optional(),
  /** Sólo si `layout` es `planeswalker`: lealtad inicial. */
  loyalty: z.string().default(''),
  /** Sólo si `layout` es `planeswalker`: sus habilidades, de arriba a abajo. */
  abilities: z.array(planeswalkerAbilitySchema).default([]),
  /** Sólo si `layout` es `saga`: sus capítulos, de arriba a abajo. */
  chapters: z.array(sagaChapterSchema).default([]),
  /**
   * Lo ha tocado una persona, no sólo el volcado automático de la carta. Es lo
   * que permite ir por un mazo entero sabiendo qué queda por hacer.
   */
  edited: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type ProxyDesign = z.infer<typeof proxyDesignSchema>

/** Formato del fichero que se exporta/importa: diseño + arte en base64. */
export const proxyFileSchema = z.object({
  version: z.literal(1),
  design: proxyDesignSchema,
  /** Data URL de la imagen del arte, para que el fichero sea autocontenido. */
  artDataUrl: z.string().optional(),
})
export type ProxyFile = z.infer<typeof proxyFileSchema>
