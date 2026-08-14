import type { Token } from './tokenize.js'

/**
 * Maqueta los tokens en líneas que quepan en una caja, y busca el tamaño de
 * fuente más grande con el que el bloque entero entra. Es lo que hace que una
 * carta con dos palabras y otra con un párrafo de ocho líneas se lean las dos
 * bien sin tocar nada a mano.
 */

export interface Item {
  kind: 'text' | 'symbol'
  /** Texto, o el símbolo con llaves (`{T}`). */
  value: string
  italic: boolean
  bold: boolean
  width: number
}

export interface Line {
  items: Item[]
  width: number
  /** Espacio extra antes de esta línea (separación entre habilidades). */
  spaceBefore: number
  /** Es la raya que separa reglas de ambientación. */
  divider?: boolean
}

export interface LayoutResult {
  lines: Line[]
  fontSize: number
  /** Alto total ocupado, en px. */
  height: number
  lineHeight: number
}

export interface MeasureOptions {
  /** Devuelve el ancho del texto con el tamaño y la cursiva indicados. */
  measureText(text: string, fontSize: number, italic: boolean): number
}

export interface LayoutOptions extends MeasureOptions {
  width: number
  height: number
  fontSize: number
  /** Tamaño mínimo al que se permite bajar antes de darse por vencido. */
  minFontSize?: number
  /** Alto de línea como múltiplo del tamaño de fuente. */
  lineHeightRatio?: number
  /** Separación entre párrafos, como múltiplo del tamaño de fuente. */
  paragraphGapRatio?: number
  /** Ancho de un símbolo de maná respecto al tamaño de fuente. */
  symbolRatio?: number
}

const DEFAULTS = {
  lineHeightRatio: 1.14,
  paragraphGapRatio: 0.42,
  symbolRatio: 0.78,
  /** Hueco entre símbolos consecutivos, respecto al tamaño de fuente. */
  symbolGapRatio: 0.04,
}

export function symbolWidth(fontSize: number, symbolRatio = DEFAULTS.symbolRatio): number {
  return fontSize * symbolRatio
}

/** Maqueta con un tamaño de fuente dado, sin intentar ajustarlo. */
export function layoutAt(tokens: Token[], options: LayoutOptions): LayoutResult {
  const {
    width,
    fontSize,
    measureText,
    lineHeightRatio = DEFAULTS.lineHeightRatio,
    paragraphGapRatio = DEFAULTS.paragraphGapRatio,
    symbolRatio = DEFAULTS.symbolRatio,
  } = options

  const lineHeight = fontSize * lineHeightRatio
  const paragraphGap = fontSize * paragraphGapRatio
  const symbolW = symbolWidth(fontSize, symbolRatio) + fontSize * DEFAULTS.symbolGapRatio

  const lines: Line[] = []
  let current: Line = { items: [], width: 0, spaceBefore: 0 }
  let pendingSpace = 0

  const pushLine = () => {
    lines.push(current)
    current = { items: [], width: 0, spaceBefore: 0 }
  }

  /** Añade un elemento, partiendo de línea si ya no cabe. */
  const place = (item: Item) => {
    if (current.items.length > 0 && current.width + item.width > width) {
      pushLine()
      current.spaceBefore = 0
    }
    // Un espacio al principio de línea no pinta nada.
    if (current.items.length === 0 && item.kind === 'text' && item.value.trim() === '') return
    current.items.push(item)
    current.width += item.width
  }

  for (const token of tokens) {
    if (token.kind === 'break') {
      pushLine()
      pendingSpace = paragraphGap
      current.spaceBefore = pendingSpace
      continue
    }

    if (token.kind === 'divider') {
      pushLine()
      lines.push({ items: [], width: 0, spaceBefore: paragraphGap * 0.5, divider: true })
      current.spaceBefore = paragraphGap * 0.5
      continue
    }

    if (token.kind === 'symbol') {
      place({ kind: 'symbol', value: token.symbol, italic: false, bold: false, width: symbolW })
      continue
    }

    // El texto se parte en palabras conservando los espacios, para que el corte
    // caiga entre palabras y el espacio se quede al final de la línea anterior.
    for (const word of splitWords(token.text)) {
      place({
        kind: 'text',
        value: word,
        italic: token.italic,
        bold: token.bold,
        width: measureText(word, fontSize, token.italic),
      })
    }
  }

  if (current.items.length > 0 || lines.length === 0) pushLine()

  // Las líneas vacías del final (por un salto suelto) no cuentan.
  while (lines.length > 1 && lines[lines.length - 1]?.items.length === 0 && !lines[lines.length - 1]?.divider) {
    lines.pop()
  }

  const height = lines.reduce((sum, line) => sum + line.spaceBefore + lineHeight, 0)

  return { lines, fontSize, height, lineHeight }
}

/** `'Tap: add {G}.'` → `['Tap: ', 'add ', '{G}.']` (los espacios se conservan). */
function splitWords(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? []
}

/**
 * Busca por bisección el tamaño de fuente más grande con el que el bloque cabe
 * en la caja. El alto crece con el tamaño de forma monótona, así que bisecar es
 * correcto y converge en una docena de pasos.
 */
export function layoutAutofit(tokens: Token[], options: LayoutOptions): LayoutResult {
  const { height, fontSize: maxSize, minFontSize = maxSize * 0.45 } = options

  const fits = (size: number) => layoutAt(tokens, { ...options, fontSize: size }).height <= height

  // Lo normal es que quepa al tamaño nominal: no hace falta bisecar.
  if (fits(maxSize)) return layoutAt(tokens, options)

  let low = minFontSize
  let high = maxSize
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2
    if (fits(mid)) low = mid
    else high = mid
  }

  // `low` es el mayor tamaño que cabe; si ni el mínimo cabe, se usa el mínimo y
  // el texto desborda (mejor eso que un texto ilegible).
  return layoutAt(tokens, { ...options, fontSize: low })
}

/**
 * Para una línea única que no debe partirse (título, tipo, F/R): si no cabe, se
 * comprime en horizontal, que es lo que hacen las cartas reales con los nombres
 * largos.
 */
export interface CondenseResult {
  /** Factor de escala horizontal, 1 = sin comprimir. */
  scaleX: number
  /** Cuerpo de letra a usar, por si con comprimir no basta. */
  fontSize: number
  width: number
}

/**
 * Ajusta una línea al ancho disponible. Primero la comprime en horizontal, que
 * es lo que hacen las cartas reales con los nombres largos; si hace falta pasar
 * del límite de compresión, además reduce el cuerpo de letra. Sin lo segundo,
 * una línea de tipo como «Legendary Artifact Creature — Phyrexian Avatar» se
 * sale de su caja y se mete debajo del símbolo de expansión.
 */
export function condenseToWidth(
  textWidth: number,
  maxWidth: number,
  fontSize: number,
  minScale = 0.8,
): CondenseResult {
  if (textWidth <= maxWidth || textWidth === 0 || maxWidth <= 0) {
    return { scaleX: 1, fontSize, width: textWidth }
  }

  const needed = maxWidth / textWidth
  if (needed >= minScale) return { scaleX: needed, fontSize, width: maxWidth }

  // El ancho del texto es proporcional al cuerpo, así que se reparte el ajuste:
  // la compresión se queda en el mínimo y el resto lo pone el tamaño.
  return { scaleX: minScale, fontSize: (fontSize * needed) / minScale, width: maxWidth }
}
