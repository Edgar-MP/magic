/**
 * Convierte el texto de una carta en trozos que el maquetador sabe dibujar.
 *
 * El texto de oracle de Scryfall trae tres cosas mezcladas:
 *  - símbolos entre llaves: `{T}`, `{2}`, `{W/U}`, `{X}`
 *  - texto recordatorio entre paréntesis, que va en cursiva
 *  - saltos de línea que separan habilidades
 *
 * A eso se suma el marcado que pone el editor de texto enriquecido (Tiptap):
 *  - `**negrita**`, `*cursiva*`, `***negrita y cursiva***`
 * Es la misma sintaxis que Markdown, para no inventar una propia; el editor
 * la escribe y la lee (ver `RichRulesField`), aquí sólo se interpreta.
 */

export type Token =
  | { kind: 'text'; text: string; italic: boolean; bold: boolean }
  | { kind: 'symbol'; symbol: string }
  /** Fin de párrafo (una habilidad). */
  | { kind: 'break' }
  /** La raya que separa el texto de reglas del de ambientación. */
  | { kind: 'divider' }

/** `{T}`, `{2}`, `{W/U}`, `{1000000}`, `{½}`, `{C}`, `{E}`… */
const SYMBOL = /\{[^}]{1,10}\}/g

/** Símbolo, o marcado de negrita/cursiva (el más largo primero: `***` antes que `**` o `*`). */
const MARKUP = /\{[^}]{1,10}\}|\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|\*([^*]+?)\*/g

/**
 * Trocea una línea. `italic` arranca el trozo en cursiva (para el texto de
 * ambientación, que va entero en cursiva).
 */
function tokenizeLine(line: string, italic: boolean): Token[] {
  const tokens: Token[] = []

  // Primero los paréntesis, que cambian la cursiva, y dentro de cada parte los
  // símbolos y el marcado de negrita/cursiva. Se conservan los paréntesis: en
  // las cartas reales se imprimen.
  for (const part of splitReminders(line)) {
    const partItalic = italic || part.reminder
    let last = 0

    for (const match of part.text.matchAll(MARKUP)) {
      const at = match.index
      if (at > last) {
        tokens.push({
          kind: 'text',
          text: part.text.slice(last, at),
          italic: partItalic,
          bold: false,
        })
      }

      const [whole, both, bold, plainItalic] = match
      if (both !== undefined) {
        tokens.push({ kind: 'text', text: both, italic: true, bold: true })
      } else if (bold !== undefined) {
        tokens.push({ kind: 'text', text: bold, italic: partItalic, bold: true })
      } else if (plainItalic !== undefined) {
        tokens.push({ kind: 'text', text: plainItalic, italic: true, bold: false })
      } else {
        tokens.push({ kind: 'symbol', symbol: whole })
      }
      last = at + whole.length
    }

    if (last < part.text.length) {
      tokens.push({
        kind: 'text',
        text: part.text.slice(last),
        italic: partItalic,
        bold: false,
      })
    }
  }

  return tokens
}

interface Part {
  text: string
  reminder: boolean
}

/**
 * Separa el texto recordatorio. Cuenta paréntesis anidados para no cortar en el
 * sitio equivocado con cosas como `(mana of any one color)`.
 */
function splitReminders(line: string): Part[] {
  const parts: Part[] = []
  let buffer = ''
  let depth = 0

  for (const char of line) {
    if (char === '(') {
      if (depth === 0 && buffer !== '') {
        parts.push({ text: buffer, reminder: false })
        buffer = ''
      }
      depth += 1
      buffer += char
    } else if (char === ')' && depth > 0) {
      depth -= 1
      buffer += char
      if (depth === 0) {
        parts.push({ text: buffer, reminder: true })
        buffer = ''
      }
    } else {
      buffer += char
    }
  }

  // Un paréntesis sin cerrar: lo tratamos como texto normal en vez de perderlo.
  if (buffer !== '') parts.push({ text: buffer, reminder: depth > 0 })

  return parts
}

export interface TokenizeOptions {
  /** Texto de ambientación, que va detrás de una raya y entero en cursiva. */
  flavor?: string
}

/** Trocea el texto de reglas y, si lo hay, el de ambientación. */
export function tokenize(rules: string, { flavor }: TokenizeOptions = {}): Token[] {
  const tokens: Token[] = []

  const paragraphs = rules.split('\n')
  paragraphs.forEach((line, i) => {
    if (i > 0) tokens.push({ kind: 'break' })
    tokens.push(...tokenizeLine(line, false))
  })

  if (flavor && flavor.trim() !== '') {
    if (rules.trim() !== '') tokens.push({ kind: 'divider' })
    flavor.split('\n').forEach((line, i) => {
      if (i > 0) tokens.push({ kind: 'break' })
      tokens.push(...tokenizeLine(line, true))
    })
  }

  return tokens
}

/** Trocea un coste de maná (`{2}{W}{U}`) en símbolos, ignorando lo demás. */
export function tokenizeManaCost(cost: string): string[] {
  return [...cost.matchAll(SYMBOL)].map((m) => m[0])
}
