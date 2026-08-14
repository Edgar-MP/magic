import type { PDFImage, PDFPage, RGB } from 'pdf-lib'

/**
 * Monta un PDF A4 con las cartas a tamaño real para imprimir y recortar.
 *
 * Las medidas van en milímetros y se convierten a puntos PostScript (72 por
 * pulgada), que es la unidad de un PDF. Una carta de Magic mide 63 × 88 mm; si
 * al imprimir sale otra cosa, es que el diálogo de impresión está escalando:
 * hay que ponerlo al 100 %, sin «ajustar a la página».
 */

const MM_TO_PT = 72 / 25.4

export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88

const A4 = { width: 210, height: 297 }
const LETTER = { width: 215.9, height: 279.4 }

export type PageSize = 'a4' | 'letter'

export interface PrintOptions {
  pageSize?: PageSize
  /** Columnas y filas por hoja. */
  columns?: number
  rows?: number
  /** Líneas finas de corte en los bordes de cada carta. */
  cutMarks?: boolean
  /** Separación entre cartas, en mm. 0 = pegadas (un solo corte entre dos). */
  gapMm?: number
  /** Reverso a incluir, si se quiere. */
  back?: PrintBack
}

export interface PrintCard {
  /** PNG o JPEG de la carta ya renderizada. */
  bytes: Uint8Array
  type: 'png' | 'jpeg'
  /** Cuántas copias imprimir. */
  qty: number
}

/**
 * Qué hacer con el reverso:
 *  - `none`: sólo las caras.
 *  - `duplex`: detrás de cada hoja de cartas, su hoja de reversos, espejada en
 *    horizontal para que al imprimir a doble cara (giro por el lado largo) cada
 *    reverso caiga detrás de su carta.
 *  - `single`: una única hoja de reversos al final, para recortar y pegar.
 */
export type BackMode = 'none' | 'duplex' | 'single'

export interface PrintBack {
  bytes: Uint8Array
  type: 'png' | 'jpeg'
  mode: BackMode
}

export async function buildPdf(
  cards: PrintCard[],
  {
    pageSize = 'a4',
    columns = 3,
    rows = 3,
    cutMarks = true,
    gapMm = 0,
    back,
  }: PrintOptions = {},
): Promise<Uint8Array> {
  const page = pageSize === 'a4' ? A4 : LETTER
  const perPage = columns * rows

  const gridWidth = columns * CARD_WIDTH_MM + (columns - 1) * gapMm
  const gridHeight = rows * CARD_HEIGHT_MM + (rows - 1) * gapMm

  if (gridWidth > page.width || gridHeight > page.height) {
    throw new Error(
      `No caben ${columns}×${rows} cartas en ${pageSize.toUpperCase()}: harían falta ${gridWidth.toFixed(0)}×${gridHeight.toFixed(0)} mm`,
    )
  }

  const marginX = (page.width - gridWidth) / 2
  const marginY = (page.height - gridHeight) / 2

  // pdf-lib son 300 kB y sólo hacen falta al imprimir: se carga aquí y no en el
  // arranque de la aplicación.
  const { PDFDocument, rgb } = await import('pdf-lib')

  const pdf = await PDFDocument.create()
  pdf.setTitle('Proxies')

  // Una entrada por copia física.
  const slots = cards.flatMap((card) => Array.from({ length: card.qty }, () => card))

  // Cada imagen se incrusta una sola vez aunque salga repetida.
  const embedded = new Map<PrintCard, PDFImage>()
  for (const card of cards) {
    embedded.set(
      card,
      card.type === 'png' ? await pdf.embedPng(card.bytes) : await pdf.embedJpg(card.bytes),
    )
  }

  const backImage =
    back && back.mode !== 'none'
      ? back.type === 'png'
        ? await pdf.embedPng(back.bytes)
        : await pdf.embedJpg(back.bytes)
      : undefined

  /** Coordenadas en mm de la casilla `index` de la rejilla. */
  const slotAt = (index: number, mirrored = false) => {
    const row = Math.floor(index / columns)
    const rawColumn = index % columns
    // Espejado en horizontal: la primera columna de la cara es la última del
    // reverso, que es como cae el papel al girarlo por el lado largo.
    const column = mirrored ? columns - 1 - rawColumn : rawColumn

    return {
      x: marginX + column * (CARD_WIDTH_MM + gapMm),
      // El origen del PDF está abajo a la izquierda, así que las filas se
      // cuentan desde arriba a mano.
      y: page.height - marginY - (row + 1) * CARD_HEIGHT_MM - row * gapMm,
    }
  }

  const newSheet = () => {
    const sheet = pdf.addPage([page.width * MM_TO_PT, page.height * MM_TO_PT])
    if (cutMarks) {
      drawCutMarks(sheet, {
        page,
        columns,
        rows,
        marginX,
        marginY,
        gapMm,
        color: rgb(0.6, 0.6, 0.6),
      })
    }
    return sheet
  }

  const place = (sheet: PDFPage, image: PDFImage, index: number, mirrored = false) => {
    const { x, y } = slotAt(index, mirrored)
    sheet.drawImage(image, {
      x: x * MM_TO_PT,
      y: y * MM_TO_PT,
      width: CARD_WIDTH_MM * MM_TO_PT,
      height: CARD_HEIGHT_MM * MM_TO_PT,
    })
  }

  for (let start = 0; start < slots.length; start += perPage) {
    const batch = slots.slice(start, start + perPage)

    const sheet = newSheet()
    batch.forEach((card, index) => {
      const image = embedded.get(card)
      if (image) place(sheet, image, index)
    })

    // Hoja de reversos justo detrás, con tantos como cartas haya en esta hoja.
    if (backImage && back?.mode === 'duplex') {
      const backSheet = newSheet()
      batch.forEach((_, index) => place(backSheet, backImage, index, true))
    }
  }

  // Una sola hoja de reversos al final, llena.
  if (backImage && back?.mode === 'single') {
    const backSheet = newSheet()
    for (let index = 0; index < perPage; index++) place(backSheet, backImage, index)
  }

  return pdf.save()
}

/**
 * Marcas de corte: líneas finas que asoman por los márgenes a la altura de cada
 * borde de carta, para alinear la guillotina sin que se vean sobre las cartas.
 */
function drawCutMarks(
  sheet: PDFPage,
  {
    page,
    columns,
    rows,
    marginX,
    marginY,
    gapMm,
    color,
  }: {
    page: { width: number; height: number }
    columns: number
    rows: number
    marginX: number
    marginY: number
    gapMm: number
    color: RGB
  },
): void {
  const thickness = 0.25
  const markMm = 4

  // Los dos bordes de cada carta. Con separación 0 el borde derecho de una
  // coincide con el izquierdo de la siguiente, y el Set los deja en uno.
  const verticals = new Set<number>()
  for (let c = 0; c < columns; c++) {
    const left = marginX + c * (CARD_WIDTH_MM + gapMm)
    verticals.add(round(left))
    verticals.add(round(left + CARD_WIDTH_MM))
  }

  const horizontals = new Set<number>()
  for (let r = 0; r < rows; r++) {
    const bottom = marginY + r * (CARD_HEIGHT_MM + gapMm)
    horizontals.add(round(bottom))
    horizontals.add(round(bottom + CARD_HEIGHT_MM))
  }

  for (const xMm of verticals) {
    for (const [fromMm, toMm] of [
      [0, markMm],
      [page.height - markMm, page.height],
    ] as const) {
      sheet.drawLine({
        start: { x: xMm * MM_TO_PT, y: fromMm * MM_TO_PT },
        end: { x: xMm * MM_TO_PT, y: toMm * MM_TO_PT },
        thickness,
        color,
      })
    }
  }

  for (const yMm of horizontals) {
    for (const [fromMm, toMm] of [
      [0, markMm],
      [page.width - markMm, page.width],
    ] as const) {
      sheet.drawLine({
        start: { x: fromMm * MM_TO_PT, y: yMm * MM_TO_PT },
        end: { x: toMm * MM_TO_PT, y: yMm * MM_TO_PT },
        thickness,
        color,
      })
    }
  }
}

/** Redondea a centésimas de mm para que dos bordes que coinciden se unifiquen. */
function round(mm: number): number {
  return Math.round(mm * 100) / 100
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
