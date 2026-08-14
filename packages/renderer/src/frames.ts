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

/**
 * Geometría del marco de planeswalker: es una plantilla distinta de la normal
 * (sin fuerza/resistencia, con una caja de habilidades de lealtad en vez de la
 * de reglas), así que no encaja en `FrameSet`/`VariantSpec`. Coordenadas de
 * `data/scripts/versions/m15Planeswalker/regular.js` de CardConjurer, pasadas
 * de fracciones de 1500×2100 a fracciones de 0 a 1 (misma proporción).
 */
export const PLANESWALKER = {
  aspect: 1500 / 2100,
  art: { x: 105 / 1500, y: 212 / 2100, width: 1290 / 1500, height: 1709 / 2100 },
  setSymbol: { x: 1383 / 1500, y: 1237 / 2100, width: 180 / 1500, height: 80 / 2100, align: 'right' as const },
  // Los números de CardConjurer para el título y el tipo no encajaban con el
  // PNG real de este marco (probado a ojo: el texto salía pegado al filo del
  // arte, no dentro de la barra). Se recalcularon a mano mirando los píxeles
  // del marco (dónde empieza y acaba de verdad la franja clara): el centro de
  // cada franja es fiable, así que la caja se reconstruye alrededor de él con
  // una altura holgada para centrar el texto.
  title: {
    x: 130 / 1500,
    y: 130.5 / 2100 - 0.0543 / 2,
    width: 1248 / 1500,
    height: 0.0543,
    size: 80 / 2100,
    font: 'title' as const,
    oneLine: true,
    middle: true,
  },
  mana: {
    x: 130 / 1500,
    // Centrado con la franja real del título (130.5/2100), no con el "94" de
    // CardConjurer, que quedaba desalineado con el nombre.
    y: 130.5 / 2100 - 35 / 2100,
    width: 1248 / 1500,
    height: 70 / 2100,
    size: 70 / 2100,
    font: 'title' as const,
    align: 'right' as const,
    oneLine: true,
  },
  type: {
    x: 130 / 1500,
    // Centro confirmado con el símbolo de expansión, que sí coincidía con el
    // PNG (1237/2100).
    y: 1237 / 2100 - 0.0543 / 2,
    width: 1248 / 1500,
    height: 0.0543,
    size: 68 / 2100,
    font: 'title' as const,
    oneLine: true,
    middle: true,
  },
  /**
   * Caja completa de habilidades: se reparte en tantas filas como haga falta.
   * La altura se recorta antes de donde empieza de verdad el escudo de
   * lealtad (comprobado a ojo en el PNG): con la altura completa de
   * CardConjurer, la banda semitransparente de la última habilidad tapaba el
   * escudo.
   */
  abilities: { x: 179 / 1500, y: 1314 / 2100, width: 1205 / 1500, height: (1865 - 1314) / 2100 },
  /** Recalculado igual que el título: el escudo real está más arriba que 1954/2100. */
  loyalty: {
    x: 1209 / 1500,
    y: 1925 / 2100 - 0.043 / 2,
    width: 210 / 1500,
    height: 0.043,
    size: 60 / 2100,
    font: 'titleSmallCaps' as const,
    align: 'center' as const,
    oneLine: true,
    middle: true,
  },
  /** Etiqueta bajo el nombre: mismo hueco que en el marco normal, sobre el arte. */
  note: {
    x: 130 / 1500,
    y: 0.104,
    width: 1248 / 1500,
    height: 0.0295,
    size: 0.0207,
    font: 'body' as const,
    align: 'center' as const,
    oneLine: true,
    middle: true,
  },
  /** Sello holográfico: misma fila que el escudo de lealtad, a su izquierda. */
  holoStamp: { x: 0.42, y: 1925 / 2100 - 0.023, width: 0.128, height: 0.046 },
  /** Artista e info: a la izquierda del escudo de lealtad, en la misma fila. */
  // Calcado del marco normal (mismo x/y/tamaño): así se ve exactamente igual
  // que en el resto de plantillas, no una versión aparte más pequeña o mal
  // colocada.
  info: {
    x: 0.0854,
    y: 0.9476,
    width: 0.8292,
    height: 0.022,
    size: 0.0186,
    font: 'body' as const,
    color: '#ffffff',
  },
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
export const LETTER: Record<FrameColor, string> = {
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

  /** El marco de planeswalker sólo existe en siete colores (sin tierras ni vehículo). */
  planeswalkerFrame(color: FrameColor): string {
    const base = isLandFrame(color) ? color.replace(/Land$/, '') : color
    const actual = base === 'vehicle' || base === 'colorless' ? 'artifact' : base
    return `planeswalker/planeswalkerFrame${LETTER[actual as FrameColor].toUpperCase()}.png`
  },

  planeswalkerPip(sign: 'plus' | 'minus' | 'neutral'): string {
    const file = { plus: 'planeswalkerPlus', minus: 'planeswalkerMinus', neutral: 'planeswalkerNeutral' }
    return `planeswalker/${file[sign]}.png`
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
