import { describe, expect, it } from 'vitest'
import { formatDecklist, parseDecklist } from './decklist.js'

describe('parseDecklist', () => {
  it('lee cantidad, nombre, expansión y número de coleccionista', () => {
    const { lines, errors } = parseDecklist('4 Lightning Bolt (M10) 146')
    expect(errors).toEqual([])
    expect(lines).toEqual([
      { qty: 4, name: 'Lightning Bolt', set: 'm10', collectorNumber: '146', board: 'main' },
    ])
  })

  it('acepta la forma con x y sin expansión', () => {
    const { lines } = parseDecklist('2x Sol Ring\n1 Island')
    expect(lines.map((l) => [l.qty, l.name])).toEqual([
      [2, 'Sol Ring'],
      [1, 'Island'],
    ])
  })

  it('cambia de zona con las cabeceras', () => {
    const { lines } = parseDecklist(
      ['Commander', '1 Atraxa', '', 'Deck', '1 Sol Ring', '', 'Sideboard', '2 Duress'].join('\n'),
    )
    expect(lines.map((l) => [l.name, l.board])).toEqual([
      ['Atraxa', 'command'],
      ['Sol Ring', 'main'],
      ['Duress', 'side'],
    ])
  })

  it('entiende las cabeceras comentadas de Arena', () => {
    const { lines } = parseDecklist('1 Sol Ring\n// Sideboard\n1 Duress')
    expect(lines.map((l) => l.board)).toEqual(['main', 'side'])
  })

  it('entiende el prefijo SB: de MTGO', () => {
    const { lines } = parseDecklist('SB: 3 Duress')
    expect(lines).toEqual([{ qty: 3, name: 'Duress', board: 'side' }])
  })

  it('entiende el marcador *CMDR* de Archidekt', () => {
    const { lines } = parseDecklist("1 Atraxa, Praetors' Voice *CMDR*")
    expect(lines).toEqual([{ qty: 1, name: "Atraxa, Praetors' Voice", board: 'command' }])
  })

  it('se queda con el lado frontal de una carta de doble cara', () => {
    const { lines } = parseDecklist('1 Delver of Secrets // Insectile Aberration')
    expect(lines[0]?.name).toBe('Delver of Secrets')
  })

  it('quita las etiquetas de categoría del final', () => {
    const { lines } = parseDecklist('1 Sol Ring [Ramp]\n1 Wastes #Lands')
    expect(lines.map((l) => l.name)).toEqual(['Sol Ring', 'Wastes'])
  })

  it('señala las líneas que no entiende con su número', () => {
    const { lines, errors } = parseDecklist('1 Sol Ring\nesto no es una línea válida\n2 Island')
    expect(lines).toHaveLength(2)
    expect(errors).toEqual([{ line: 2, text: 'esto no es una línea válida' }])
  })

  it('ignora líneas vacías', () => {
    const { lines, errors } = parseDecklist('\n\n1 Sol Ring\n   \n')
    expect(lines).toHaveLength(1)
    expect(errors).toEqual([])
  })
})

describe('formatDecklist', () => {
  it('escribe las secciones en orden con expansión', () => {
    const text = formatDecklist([
      { qty: 1, name: 'Atraxa', board: 'command' },
      { qty: 1, name: 'Sol Ring', set: 'ltr', collectorNumber: '10', board: 'main' },
      { qty: 2, name: 'Duress', board: 'side' },
    ])
    expect(text).toBe(
      ['Commander', '1 Atraxa', '', 'Deck', '1 Sol Ring (LTR) 10', '', 'Sideboard', '2 Duress'].join(
        '\n',
      ),
    )
  })

  it('vuelve a leer lo que ha escrito', () => {
    const lines = [
      { qty: 1, name: 'Atraxa', board: 'command' as const },
      { qty: 4, name: 'Lightning Bolt', set: 'm10', collectorNumber: '146', board: 'main' as const },
      { qty: 2, name: 'Duress', board: 'side' as const },
    ]
    expect(parseDecklist(formatDecklist(lines)).lines).toEqual(lines)
  })
})
