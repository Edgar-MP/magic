import { describe, expect, it } from 'vitest'
import { condenseToWidth, layoutAt, layoutAutofit } from './layout.js'
import { tokenize } from './tokenize.js'

/**
 * Medidor de mentira pero proporcional: cada carácter ocupa 0,5 del tamaño de
 * fuente, la cursiva un 5% más. Basta para comprobar la lógica de maquetación
 * sin depender de una tipografía concreta.
 */
const measureText = (text: string, fontSize: number, italic: boolean) =>
  text.length * fontSize * 0.5 * (italic ? 1.05 : 1)

const base = { measureText, width: 300, height: 200, fontSize: 20 }

const textOf = (line: { items: { value: string }[] }) => line.items.map((i) => i.value).join('')

describe('layoutAt', () => {
  it('deja en una línea lo que cabe', () => {
    const result = layoutAt(tokenize('Flying'), base)
    expect(result.lines).toHaveLength(1)
    expect(textOf(result.lines[0]!)).toBe('Flying')
  })

  it('parte entre palabras cuando no cabe', () => {
    // 300 px de ancho a 20 px de fuente son ~30 caracteres por línea.
    const result = layoutAt(tokenize('uno dos tres cuatro cinco seis siete ocho nueve diez'), base)
    expect(result.lines.length).toBeGreaterThan(1)
    for (const line of result.lines) expect(line.width).toBeLessThanOrEqual(base.width)
    // No se pierde ni se duplica nada.
    expect(result.lines.map(textOf).join('').replace(/\s+/g, ' ').trim()).toBe(
      'uno dos tres cuatro cinco seis siete ocho nueve diez',
    )
  })

  it('cuenta el ancho de los símbolos', () => {
    const withSymbol = layoutAt(tokenize('{T}'), base)
    expect(withSymbol.lines[0]?.width).toBeCloseTo(20 * 0.78 + 20 * 0.04, 5)
  })

  it('separa las habilidades con un hueco', () => {
    const result = layoutAt(tokenize('Flying\nVigilance'), base)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]?.spaceBefore).toBe(0)
    expect(result.lines[1]?.spaceBefore).toBeGreaterThan(0)
  })

  it('inserta una línea de raya para la ambientación', () => {
    const result = layoutAt(tokenize('Flying', { flavor: 'Vuela.' }), base)
    expect(result.lines.filter((l) => l.divider)).toHaveLength(1)
  })

  it('el alto crece con el tamaño de fuente', () => {
    const tokens = tokenize('una frase bastante larga para que ocupe varias líneas seguro')
    const small = layoutAt(tokens, { ...base, fontSize: 10 })
    const big = layoutAt(tokens, { ...base, fontSize: 30 })
    expect(big.height).toBeGreaterThan(small.height)
  })

  it('no deja un espacio suelto al principio de línea', () => {
    const result = layoutAt(tokenize('palabra '.repeat(20).trim()), base)
    for (const line of result.lines) {
      expect(line.items[0]?.value.startsWith(' ')).toBe(false)
    }
  })

  it('con texto vacío devuelve una línea vacía, no cero líneas', () => {
    const result = layoutAt(tokenize(''), base)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.items).toEqual([])
  })
})

describe('layoutAutofit', () => {
  it('no toca el tamaño si el texto ya cabe', () => {
    const result = layoutAutofit(tokenize('Flying'), base)
    expect(result.fontSize).toBe(base.fontSize)
  })

  it('reduce el tamaño hasta que un texto largo cabe', () => {
    const long = tokenize(
      [
        'Whenever this creature attacks, create a token that is a copy of it.',
        'Whenever this creature deals combat damage to a player, draw a card.',
        'At the beginning of your end step, if you control three or more artifacts, gain 3 life.',
        '{2}{W}{U}: Return target creature to its owner\'s hand, then scry 2.',
      ].join('\n'),
    )
    const box = { ...base, height: 120 }
    const result = layoutAutofit(long, box)

    expect(result.fontSize).toBeLessThan(base.fontSize)
    expect(result.height).toBeLessThanOrEqual(box.height)
  })

  it('encuentra el mayor tamaño que cabe, no uno cualquiera', () => {
    // Caja estrecha a propósito: con el tamaño nominal no cabe, así que entra
    // la bisección y podemos comprobar que se queda en el máximo.
    const tokens = tokenize('una frase de prueba con unas cuantas palabras dentro')
    const box = { ...base, height: 30 }
    const result = layoutAutofit(tokens, box)

    expect(result.fontSize).toBeLessThan(base.fontSize)
    expect(result.height).toBeLessThanOrEqual(box.height)

    // Un pelín más grande ya no debería caber.
    const bigger = layoutAt(tokens, { ...box, fontSize: result.fontSize * 1.15 })
    expect(bigger.height).toBeGreaterThan(box.height)
  })

  it('no baja del mínimo aunque el texto no quepa', () => {
    const tokens = tokenize('palabra '.repeat(400))
    const result = layoutAutofit(tokens, { ...base, height: 40, minFontSize: 8 })
    expect(result.fontSize).toBeGreaterThanOrEqual(8)
  })
})

describe('condenseToWidth', () => {
  it('no toca nada si cabe', () => {
    expect(condenseToWidth(100, 200, 20)).toEqual({ scaleX: 1, fontSize: 20, width: 100 })
  })

  it('comprime justo lo necesario sin cambiar el cuerpo', () => {
    const { scaleX, fontSize, width } = condenseToWidth(200, 180, 20)
    expect(scaleX).toBeCloseTo(0.9, 5)
    expect(fontSize).toBe(20)
    expect(width).toBeCloseTo(180, 5)
  })

  it('cuando comprimir no basta, además reduce el cuerpo', () => {
    // Hace falta 0,25 y el mínimo de compresión es 0,8: el resto lo pone el
    // tamaño, que baja a 20 × 0,25 / 0,8 = 6,25.
    const { scaleX, fontSize, width } = condenseToWidth(400, 100, 20, 0.8)
    expect(scaleX).toBe(0.8)
    expect(fontSize).toBeCloseTo(6.25, 5)
    expect(width).toBeCloseTo(100, 5)
    // El ancho final es el pedido: cuerpo reducido por compresión mínima.
    expect((400 * fontSize) / 20 * scaleX).toBeCloseTo(100, 5)
  })

  it('aguanta un ancho de cero y un límite absurdo', () => {
    expect(condenseToWidth(0, 100, 20)).toEqual({ scaleX: 1, fontSize: 20, width: 0 })
    expect(condenseToWidth(100, 0, 20)).toEqual({ scaleX: 1, fontSize: 20, width: 100 })
  })
})
