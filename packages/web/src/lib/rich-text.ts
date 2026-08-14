/**
 * Puente entre lo que guarda un proxy (texto plano con `**negrita**`,
 * `*cursiva*`, `***ambas***` — la misma sintaxis que interpreta el
 * tokenizador del renderizador) y lo que entiende Tiptap.
 *
 * No se usa `tiptap-markdown`: con sólo negrita y cursiva por línea, un
 * puente propio de ida y vuelta es más simple y queda bajo control aquí, en
 * vez de depender de que un serializador de Markdown genérico coincida con
 * el formato exacto que ya entendía el renderizador.
 */

interface DocNode {
  type?: string
  content?: DocNode[]
  text?: string
  marks?: { type: string }[]
}

/** El documento de Tiptap (`editor.getJSON()`) a nuestro texto plano. */
export function docToText(doc: DocNode): string {
  return (doc.content ?? []).map(paragraphToText).join('\n')
}

function paragraphToText(paragraph: DocNode): string {
  return (paragraph.content ?? []).map(textNodeToText).join('')
}

function textNodeToText(node: DocNode): string {
  if (node.type !== 'text' || !node.text) return ''
  const marks = new Set((node.marks ?? []).map((m) => m.type))
  const bold = marks.has('bold')
  const italic = marks.has('italic')
  if (bold && italic) return `***${node.text}***`
  if (bold) return `**${node.text}**`
  if (italic) return `*${node.text}*`
  return node.text
}

/** Nuestro texto plano a HTML, para inicializar o resincronizar el editor. */
export function textToHtml(text: string): string {
  return text.split('\n').map((line) => `<p>${lineToHtml(line)}</p>`).join('')
}

const MARKUP = /\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|\*([^*]+?)\*/g

function lineToHtml(line: string): string {
  const escaped = escapeHtml(line)
  let html = ''
  let last = 0

  for (const match of escaped.matchAll(MARKUP)) {
    const at = match.index ?? 0
    html += escaped.slice(last, at)
    const [whole, both, bold, italic] = match
    if (both !== undefined) html += `<strong><em>${both}</em></strong>`
    else if (bold !== undefined) html += `<strong>${bold}</strong>`
    else if (italic !== undefined) html += `<em>${italic}</em>`
    last = at + whole.length
  }
  html += escaped.slice(last)
  return html
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
