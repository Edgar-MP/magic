import type { CardVariant, FrameColor } from '@magic/shared'

/**
 * Geometría de los marcos, en coordenadas normalizadas: todo son fracciones del
 * ancho y el alto de la carta, así que el renderizador funciona igual a 750 px
 * de vista previa que a 2010 px para imprimir.
 *
 * Los números vienen de las definiciones de CardConjurer (`js/frames/packM15*.js`),
 * que es la misma fuente de la que salen las imágenes de los marcos. Se
 * verificaron contra el juego de marcos antiguo: el título a 0.0381 del alto son
 * 40 px en un lienzo de 1050, exactamente lo que decía aquella versión.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type HorizontalAlign = 'left' | 'center' | 'right'

export interface TextBox extends Box {
  /** Tamaño de fuente como fracción del alto de la carta. */
  size: number
  font: FontRole
  align?: HorizontalAlign
  /** Una sola línea: se comprime en horizontal en vez de partir. */
  oneLine?: boolean
  /** Centrado vertical dentro de la caja en vez de anclado arriba. */
  middle?: boolean
  color?: string
}

export type FontRole = 'title' | 'titleSmallCaps' | 'body' | 'bodyItalic'

export interface FrameSet {
  id: string
  name: string
  /** Proporción del lienzo de trabajo: ancho / alto. */
  aspect: number
  art: Box
  setSymbol: Box & { align: HorizontalAlign }
  watermark: Box
  /** Caja de la imagen de fuerza/resistencia (el marco, no el texto). */
  ptFrame: Box
  crown: Box
  crownBorderCover: Box
  holoStamp: Box
  /** Marca de agua de tierra básica. */
  basicWatermark: Box
  /** Cajita de la etiqueta libre, justo debajo del nombre. */
  note: TextBox
  text: {
    mana: TextBox
    title: TextBox
    type: TextBox
    rules: TextBox
    pt: TextBox
    /** Línea de artista e info inferior. */
    info: TextBox
  }
}

/**
 * Marco moderno (M15, de 2015 en adelante). Es el único juego completo que
 * cubrimos por ahora; añadir otro es añadir otra entrada aquí más sus imágenes.
 */
export const M15: FrameSet = {
  id: 'm15',
  name: 'Moderno (M15)',
  aspect: 2010 / 2814,

  art: { x: 0.0767, y: 0.1129, width: 0.8476, height: 0.4429 },
  setSymbol: { x: 0.9213, y: 0.591, width: 0.12, height: 0.041, align: 'right' },
  watermark: { x: 0.5, y: 0.7762, width: 0.75, height: 0.2305 },
  ptFrame: { x: 0.7573, y: 0.8848, width: 0.188, height: 0.0733 },
  crown: { x: 0.0274, y: 0.0191, width: 0.9454, height: 0.1667 },
  crownBorderCover: { x: 0.0394, y: 0.0277, width: 0.9214, height: 0.0177 },
  holoStamp: { x: 0.436, y: 0.9034, width: 0.128, height: 0.0458 },
  basicWatermark: { x: 0.3267, y: 0.6491, width: 0.3474, height: 0.2496 },

  // Cae sobre la franja alta de la ilustración, entre el título y el arte.
  // Cae sobre la franja alta de la ilustración, entre el título y el arte.
  note: {
    x: 0.0854,
    y: 0.1216,
    width: 0.8292,
    height: 0.0295,
    size: 0.0207,
    font: 'body',
    align: 'center',
    oneLine: true,
    middle: true,
  },

  text: {
    // El coste va alineado a la derecha, pegado al borde del título.
    mana: {
      x: 0.0854,
      y: 0.0613,
      width: 0.8438,
      height: 0.0338,
      size: 0.0338,
      font: 'title',
      align: 'right',
      oneLine: true,
    },
    title: {
      x: 0.0854,
      y: 0.0522,
      width: 0.8292,
      height: 0.0543,
      size: 0.0381,
      font: 'title',
      oneLine: true,
      middle: true,
    },
    type: {
      x: 0.0854,
      y: 0.5664,
      width: 0.8292,
      height: 0.0543,
      size: 0.0324,
      font: 'title',
      oneLine: true,
      middle: true,
    },
    rules: {
      x: 0.086,
      y: 0.6303,
      // CardConjurer da 0.2875 de alto, pero eso llega hasta el filo del panel
      // beige: una carta con mucha ambientación deja la última línea pisando el
      // borde. Se recorta al alto interior real del panel.
      width: 0.828,
      height: 0.27,
      size: 0.0362,
      font: 'body',
    },
    pt: {
      x: 0.7928,
      y: 0.902,
      width: 0.1367,
      height: 0.0372,
      size: 0.0372,
      font: 'titleSmallCaps',
      align: 'center',
      oneLine: true,
      middle: true,
    },
    info: {
      x: 0.0854,
      y: 0.9476,
      width: 0.8292,
      height: 0.022,
      size: 0.0186,
      font: 'body',
      color: '#ffffff',
    },
  },
}

export const FRAME_SETS: Record<string, FrameSet> = { m15: M15 }

/**
 * Color aproximado del borde de cada marco, para que la etiqueta bajo el
 * nombre se pinte a juego (el borde de esa cajita no sale del PNG del marco:
 * se dibuja aparte, así que hace falta saber qué color le toca).
 */
export const FRAME_ACCENT: Record<FrameColor, string> = {
  white: '#c9b877',
  blue: '#2f6db0',
  black: '#4a4a4a',
  red: '#b5432c',
  green: '#3a7048',
  gold: '#d4af37',
  artifact: '#8f96a3',
  colorless: '#8f96a3',
  vehicle: '#6b4a2f',
  whiteLand: '#c9b877',
  blueLand: '#2f6db0',
  blackLand: '#4a4a4a',
  redLand: '#b5432c',
  greenLand: '#3a7048',
  goldLand: '#d4af37',
  colorlessLand: '#8f96a3',
}

/** Nombre de familia con el que se registra cada tipografía en el canvas. */
export const FONT_FAMILY: Record<FontRole, string> = {
  title: 'belerenb',
  titleSmallCaps: 'belerenbsc',
  body: 'mplantin',
  bodyItalic: 'mplantin-i',
}

// --- Variantes ---------------------------------------------------------------

/**
 * Cada variante cambia dónde cabe el arte, qué imagen de marco se usa y de qué
 * color va el texto. Las coordenadas vienen de los packs de CardConjurer
 * (`packM15ClearTextboxes.js` y `packGenericShowcase.js`).
 */
export type TextSlot = 'mana' | 'title' | 'type' | 'rules' | 'pt' | 'info'

export interface VariantSpec {
  id: CardVariant
  /** Ventana de arte, si difiere de la del marco base. */
  art?: Box
  /** Caja del símbolo de expansión, si se mueve. */
  setSymbol?: Box & { align: HorizontalAlign }
  /**
   * Cajas de texto que cambian respecto al marco base. Un `null` significa que
   * esta variante no dibuja ese texto (una tierra full art no tiene reglas).
   */
  text?: Partial<Record<TextSlot, TextBox | null>>
  /** Círculo con el símbolo de maná, en las tierras full art. */
  landSymbol?: Box
  /** No pintar la marca de agua grande de tierra básica. */
  hideBasicWatermark?: boolean
  /** Carpeta y forma del nombre del fichero de marco. */
  frameFile: (color: FrameColor) => string
  ptFile?: (color: FrameColor) => string
  /** Colores de texto que se salen de lo normal (negro sobre caja opaca). */
  textColor?: Partial<Record<'title' | 'type' | 'rules' | 'pt', string>>
  /**
   * Sombra bajo el texto. Imprescindible cuando el texto va en blanco sobre la
   * ilustración: sin ella hay ilustraciones claras donde no se lee nada.
   */
  textShadow?: boolean
  /** Repintar de negro el anillo exterior de la carta. */
  blackBorder: boolean
  /** La corona de legendaria sólo existe para el marco normal. */
  supportsCrown: boolean
}

/**
 * Letras de fichero de las variantes. No tienen todos los colores: el arte
 * extendido sólo trae una tierra, y ninguna de las dos trae vehículo.
 */
function variantLetter(color: FrameColor, available: string): string {
  const land = isLandFrame(color)
  const base = land ? 'l' : (LETTER[color] ?? 'c').toLowerCase()
  if (available.includes(base)) return base
  // Sin fichero propio: el artefacto hace de comodín (es el más neutro).
  return available.includes('a') ? 'a' : 'c'
}

export const VARIANTS: Record<CardVariant, VariantSpec> = {
  regular: {
    id: 'regular',
    frameFile: (color) => paths.frame(M15, color),
    blackBorder: true,
    supportsCrown: true,
  },

  extendedArt: {
    id: 'extendedArt',
    // El arte baja por detrás de la caja de texto, que es transparente.
    art: { x: 0.062, y: 0.1129, width: 0.876, height: 0.8096 },
    frameFile: (color) => `m15/clearTextbox/${variantLetter(color, 'wubrgmal')}.png`,
    textColor: { type: '#ffffff', rules: '#ffffff' },
    textShadow: true,
    blackBorder: true,
    supportsCrown: true,
  },

  borderless: {
    id: 'borderless',
    // A sangre por los cuatro lados; abajo queda la línea de creditos.
    art: { x: 0, y: 0, width: 1, height: 0.9224 },
    frameFile: (color) =>
      `m15/borderless/m15GenericShowcaseFrame${variantLetter(color, 'wubrgmalc').toUpperCase()}.png`,
    ptFile: (color) => `m15/borderless/pt/${variantLetter(color, 'wubrgmalc')}.png`,
    textColor: { title: '#ffffff', type: '#ffffff', rules: '#ffffff', pt: '#ffffff' },
    textShadow: true,
    blackBorder: false,
    supportsCrown: false,
  },

  /**
   * Tierra básica full art, como las que se imprimen desde 2022: el arte ocupa
   * todo menos la franja del nombre arriba y la del tipo abajo, con el símbolo
   * de maná en un círculo a la izquierda y el de expansión a la derecha.
   */
  fullArtLand: {
    id: 'fullArtLand',
    art: { x: 0.0394, y: 0.0281, width: 0.9214, height: 0.8929 },
    setSymbol: { x: 0.9213, y: 0.8739, width: 0.12, height: 0.041, align: 'right' },
    landSymbol: { x: 62 / 1500, y: 1752 / 2100, width: 168 / 1500, height: 168 / 2100 },
    text: {
      // La línea de tipo baja al pie y arranca después del círculo de maná.
      type: {
        x: 283 / 1500,
        y: 0.8481,
        width: 0.6,
        height: 0.0543,
        size: 0.0324,
        font: 'title',
        oneLine: true,
        middle: true,
      },
      // Una tierra básica no lleva ni reglas, ni coste, ni fuerza/resistencia.
      rules: null,
      mana: null,
      pt: null,
    },
    hideBasicWatermark: true,
    frameFile: (color) => `textless2022/${variantLetter(color, 'wubrgml')}.png`,
    blackBorder: false,
    supportsCrown: false,
  },
}

/** Ventana de arte efectiva de un diseño. */
export function artBoxOf(set: FrameSet, variant: CardVariant): Box {
  return VARIANTS[variant]?.art ?? set.art
}

/** Caja del símbolo de expansión, con el desplazamiento de la variante. */
export function setSymbolBoxOf(set: FrameSet, variant: VariantSpec): Box & {
  align: HorizontalAlign
} {
  return variant.setSymbol ?? set.setSymbol
}

/**
 * Caja de un texto en una variante, o `undefined` si esa variante no lo pinta.
 */
export function textBoxOf(
  set: FrameSet,
  variant: VariantSpec,
  slot: TextSlot,
): TextBox | undefined {
  const override = variant.text?.[slot]
  if (override === null) return undefined
  return override ?? set.text[slot]
}

/** Ruta del círculo con el símbolo de maná de una tierra full art. */
export function landSymbolPath(land: 'w' | 'u' | 'b' | 'r' | 'g' | 'c'): string {
  return `textless2022/s${land}.png`
}

// --- Rutas de las imágenes ---------------------------------------------------

/**
 * Letra con la que se nombran los ficheros de cada color. `M` es multicolor
 * (oro), `A` artefacto, `L` tierra, `C` incoloro, `V` vehículo.
 */
const LETTER: Record<FrameColor, string> = {
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
  gold: 'M',
  artifact: 'A',
  colorless: 'C',
  vehicle: 'V',
  whiteLand: 'w',
  blueLand: 'u',
  blackLand: 'b',
  redLand: 'r',
  greenLand: 'g',
  goldLand: 'm',
  colorlessLand: 'l',
}

export function isLandFrame(color: FrameColor): boolean {
  return color.endsWith('Land')
}

/** Colores que no tienen marco propio y reutilizan otro. */
const FRAME_FALLBACK: Partial<Record<FrameColor, FrameColor>> = {
  // No hay `m15FrameC.png`: el incoloro usa el de artefacto.
  colorless: 'artifact',
}

/**
 * Rutas relativas a `assets/`. El renderizador las resuelve con su cargador,
 * que en el navegador es una URL y en los tests una lectura de disco.
 */
export const paths = {
  frame(set: FrameSet, color: FrameColor): string {
    const actual = FRAME_FALLBACK[color] ?? color
    const letter = LETTER[actual]
    return isLandFrame(actual)
      ? `${set.id}/regular/l${letter}.png`
      : `${set.id}/regular/m15Frame${letter}.png`
  },

  nyxFrame(set: FrameSet, color: FrameColor): string {
    const actual = FRAME_FALLBACK[color] ?? color
    return `${set.id}/nyx/m15Frame${LETTER[actual].toUpperCase()}Nyx.png`
  },

  /** Máscara con la que se recorta el segundo color al mezclar. */
  mask(set: FrameSet, name: 'Pinline' | 'Title' | 'Type' | 'Rules' | 'Frame' | 'Border'): string {
    return `${set.id}/regular/m15Mask${name}.png`
  },

  pt(set: FrameSet, color: FrameColor): string {
    const base = isLandFrame(color) ? 'colorless' : (FRAME_FALLBACK[color] ?? color)
    return `${set.id}/regular/m15PT${LETTER[base].toUpperCase()}.png`
  },

  crown(set: FrameSet, color: FrameColor): string {
    const base = isLandFrame(color) ? 'colorlessLand' : color
    const letter = isLandFrame(base) ? 'L' : LETTER[base].toUpperCase()
    return `${set.id}/crowns/m15Crown${letter}.png`
  },

  crownBorderCover(set: FrameSet): string {
    return `${set.id}/crowns/borderCover.png`
  },

  holoStamp(set: FrameSet, color: FrameColor): string {
    const base = isLandFrame(color) ? 'colorlessLand' : color
    const letter = isLandFrame(base) ? 'L' : LETTER[base].toUpperCase()
    return `${set.id}/holoStamps/m15HoloStamp${letter}.png`
  },

  basicWatermark(land: 'w' | 'u' | 'b' | 'r' | 'g' | 'c'): string {
    return `m15/basics/${land}.png`
  },

  /** Reverso clásico de Magic. */
  cardBack(): string {
    return 'cardbacks/cardback.png'
  },

  /** `{W/U}` → `symbols/W-U.svg` */
  symbol(symbol: string): string {
    return `symbols/${symbol.replace(/[{}]/g, '').replace(/\//g, '-')}.svg`
  },

  font(role: FontRole): string {
    const file: Record<FontRole, string> = {
      title: 'beleren-b.ttf',
      titleSmallCaps: 'beleren-bsc.ttf',
      body: 'mplantin.ttf',
      bodyItalic: 'mplantin-i.ttf',
    }
    return `fonts/${file[role]}`
  },
}
