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
 * Un nivel de Class: `cost` es el coste de maná de mejora para subir a ESTE
 * nivel (notación de Scryfall, `{2}{U}`), vacío en el nivel 1 porque ese usa
 * el coste normal de la carta (`text.mana`). `typeLine` no es una línea de
 * tipo de verdad — en una Class real (comprobado contra Scryfall, p.ej.
 * «Wizard Class») el tipo se queda igual en todos los niveles («Enchantment —
 * Class»); lo que cambia por nivel es la etiqueta de la barra divisoria
 * («Level 2», «Level 3»), así que aquí guarda esa etiqueta (vacío en el nivel
 * 1, que no lleva barra). `text` es el efecto de ese nivel.
 */
export const classLevelSchema = z.object({
  cost: z.string().default(''),
  typeLine: z.string().default(''),
  text: z.string().default(''),
})
export type ClassLevel = z.infer<typeof classLevelSchema>

/**
 * Hechizo de aventura: el recuadro superpuesto sobre el marco normal de una
 * criatura (o cualquier otro layout base) con un segundo hechizo más pequeño,
 * como las de Throne of Eldraine. No es un `layout` aparte — convive con
 * `card` (o el que toque) mediante este campo opcional. Mismos nombres de
 * campo que `proxyTextSchema` para el hechizo principal.
 */
export const adventureSchema = z.object({
  name: z.string().default(''),
  /** Coste de maná en notación de Scryfall: `{1}{R}`. */
  mana: z.string().default(''),
  type: z.string().default(''),
  oracle: z.string().default(''),
})
export type Adventure = z.infer<typeof adventureSchema>

/**
 * `card` es la plantilla normal (criatura/hechizo/tierra…); `planeswalker`
 * cambia a la caja de habilidades con coste de lealtad; `saga` cambia a la
 * franja lateral con capítulos numerados; `battle` es la plantilla apaisada
 * de casillas de defensa (sólo la cara frontal: la trasera es una carta
 * normal aparte y se deja para una tarea futura de doble cara). No hay más
 * plantillas especiales todavía, pero el campo ya deja sitio. `class` cambia
 * a la franja de niveles apilados verticalmente (Baldur's Gate): cada nivel
 * salvo el primero se activa pagando su coste de mejora, en orden.
 */
export const CARD_LAYOUTS = ['card', 'planeswalker', 'saga', 'battle', 'class'] as const
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
  /** Sólo si `layout` es `class`: sus niveles, de arriba a abajo. */
  levels: z.array(classLevelSchema).default([]),
  /** Sólo si `layout` es `battle`: sus casillas de defensa iniciales. */
  defense: z.string().default(''),
  /**
   * Doble cara (Transform/DFC): si no es `null`, el `id` de OTRO proxy de la
   * misma colección que es el dorso de este. El dorso es un `ProxyDesign`
   * completo, con el `layout` que le toque (normal, planeswalker…) — no hay un
   * layout `'transform'` especial, el par frente/dorso vive un nivel por
   * encima de eso.
   */
  backFaceId: z.string().nullable().default(null),
  /**
   * Marca que ESTE proxy es el dorso de otro. Sirve para ocultarlo de los
   * listados normales de «mis proxies» y no dejar que se edite/borre como si
   * fuera una carta independiente y suelta.
   */
  isBackFace: z.boolean().default(false),
  /**
   * Hechizo de aventura, si esta carta tiene uno (una criatura con un hechizo
   * más pequeño superpuesto, tipo Throne of Eldraine). `null` si no tiene.
   */
  adventure: adventureSchema.nullable().default(null),
  /**
   * Split (Fire // Ice, Life // Death): si no es `null`, el `id` de OTRO proxy
   * de la misma colección que es la otra mitad de este hechizo. A diferencia
   * de `adventure` (un mini-hechizo superpuesto sobre el marco de una
   * criatura), en Split las dos mitades son hechizos COMPLETOS e
   * independientes del mismo tamaño — por eso se modela igual que
   * `backFaceId`, como un vínculo entre dos `ProxyDesign` normales, cada uno
   * con su propio `layout`. Lo que cambia frente al doble cara es sólo la
   * composición: las dos mitades se ven a la vez, lado a lado y rotadas 90°,
   * en la MISMA cara física (ver `renderSplit` en el renderizador), no una
   * detrás de otra.
   */
  splitPartnerId: z.string().nullable().default(null),
  /**
   * Marca que ESTE proxy es la segunda mitad de una Split. Igual que
   * `isBackFace`: lo oculta de los listados de «mis proxies» y evita que se
   * trate como una carta suelta.
   */
  isSplitPartner: z.boolean().default(false),
  /**
   * Flip (Kamigawa clásico: Erayo, Soratami Ascendant // Erayo's Essence): si
   * no es `null`, el `id` de OTRO proxy de la misma colección que es la otra
   * cara de esta. Igual que `splitPartnerId`/`backFaceId`: dos `ProxyDesign`
   * completos e independientes enlazados. La diferencia frente a Split es sólo
   * de composición, no de datos: en Flip las dos caras comparten la MISMA
   * mitad física de la carta cada una (arriba en su orientación normal, abajo
   * la otra cara rotada 180°, ver `renderFlip`), no lado a lado rotadas 90°.
   */
  flipPartnerId: z.string().nullable().default(null),
  /**
   * Marca que ESTE proxy es la otra cara de una Flip. Igual que
   * `isSplitPartner`: lo oculta de los listados de «mis proxies» y evita que
   * se trate como una carta suelta.
   */
  isFlipPartner: z.boolean().default(false),
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
