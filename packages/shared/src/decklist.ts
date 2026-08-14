import type { Board } from './deck.js'

export interface ParsedLine {
  qty: number
  name: string
  /** Código de expansión, si la lista lo indica: `4 Lightning Bolt (M10) 146`. */
  set?: string
  collectorNumber?: string
  board: Board
}

export interface ParsedDecklist {
  lines: ParsedLine[]
  /** Líneas que no se han entendido, con su número (1-indexado) para señalarlas. */
  errors: { line: number; text: string }[]
}

/** Cabeceras que cambian la zona a la que van las líneas siguientes. */
const HEADINGS: { pattern: RegExp; board: Board }[] = [
  { pattern: /^(sideboard|banda|reserva)\b/i, board: 'side' },
  { pattern: /^(commander|comandante)\b/i, board: 'command' },
  { pattern: /^(deck|mazo|main ?deck|maindeck)\b/i, board: 'main' },
]

/**
 * `4 Lightning Bolt (M10) 146`
 *  ─┬ ─────┬─────── ──┬── ─┬─
 *   │      │          │    └ número de coleccionista
 *   │      │          └ expansión
 *   │      └ nombre
 *   └ cantidad, con o sin `x`
 */
const LINE = /^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+([A-Za-z0-9-★]+))?)?\s*$/

/**
 * Parsea una lista de mazo en texto plano. Acepta los formatos de Arena, MTGO
 * (`SB:`), Archidekt/Moxfield (`*CMDR*`, cabeceras) y listas escritas a mano.
 * No resuelve los nombres a cartas: eso lo hace `@magic/cards`.
 */
export function parseDecklist(text: string, defaultBoard: Board = 'main'): ParsedDecklist {
  const result: ParsedDecklist = { lines: [], errors: [] }
  let board: Board = defaultBoard

  const rawLines = text.split(/\r?\n/)
  for (let i = 0; i < rawLines.length; i++) {
    let line = (rawLines[i] ?? '').trim()
    if (line === '') continue

    // Comentarios y cabeceras tipo `// Sideboard`.
    line = line.replace(/^\/\/\s*/, '').trim()
    if (line === '') continue

    const heading = HEADINGS.find((h) => h.pattern.test(line))
    if (heading && !/^\d/.test(line)) {
      board = heading.board
      continue
    }

    // MTGO marca la banda con el prefijo `SB:`.
    let lineBoard = board
    const sb = /^SB:\s*/i.exec(line)
    if (sb) {
      lineBoard = 'side'
      line = line.slice(sb[0].length)
    }

    // Archidekt/Moxfield marcan el comandante con `*CMDR*`.
    if (/\*CMDR\*/i.test(line)) {
      lineBoard = 'command'
      line = line.replace(/\*CMDR\*/gi, '').trim()
    }

    // Etiquetas de categoría al final: `[Ramp]`, `#Ramp`.
    line = line.replace(/\s*[[#][^\]]*\]?\s*$/, '').trim()

    const match = LINE.exec(line)
    if (!match) {
      result.errors.push({ line: i + 1, text: rawLines[i] ?? '' })
      continue
    }

    const [, qtyText, nameText, set, collectorNumber] = match
    const qty = Number(qtyText)
    const name = normalizeName(nameText ?? '')
    if (!Number.isFinite(qty) || qty <= 0 || name === '') {
      result.errors.push({ line: i + 1, text: rawLines[i] ?? '' })
      continue
    }

    result.lines.push({
      qty,
      name,
      ...(set ? { set: set.toLowerCase() } : {}),
      ...(collectorNumber ? { collectorNumber } : {}),
      board: lineBoard,
    })
  }

  return result
}

/**
 * Deja el nombre en la forma que espera Scryfall: sólo el lado frontal, sin los
 * separadores de cara que usan otras webs (`/`, `//`).
 */
function normalizeName(name: string): string {
  const front = name.split(/\s+\/\/?\s+/)[0] ?? name
  return front.trim()
}

export interface ExportLine {
  qty: number
  name: string
  set?: string
  collectorNumber?: string
  board: Board
}

/** Serializa a texto con cabeceras, en el formato que aceptan Arena y Moxfield. */
export function formatDecklist(lines: ExportLine[]): string {
  const sections: [Board, string][] = [
    ['command', 'Commander'],
    ['main', 'Deck'],
    ['side', 'Sideboard'],
  ]

  const blocks: string[] = []
  for (const [board, heading] of sections) {
    const rows = lines.filter((l) => l.board === board)
    if (rows.length === 0) continue
    const body = rows.map((l) => {
      const suffix = l.set
        ? ` (${l.set.toUpperCase()})${l.collectorNumber ? ` ${l.collectorNumber}` : ''}`
        : ''
      return `${l.qty} ${l.name}${suffix}`
    })
    blocks.push([heading, ...body].join('\n'))
  }

  return blocks.join('\n\n')
}
