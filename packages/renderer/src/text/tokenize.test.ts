import { describe, expect, it } from 'vitest'
import { tokenize, tokenizeManaCost } from './tokenize.js'

describe('tokenizeManaCost', () => {
  it('separa los símbolos de un coste', () => {
    expect(tokenizeManaCost('{2}{W}{U}')).toEqual(['{2}', '{W}', '{U}'])
  })

  it('entiende híbridos, fireos y genéricos grandes', () => {
    expect(tokenizeManaCost('{W/U}{2/R}{G/P}{X}{1000000}')).toEqual([
      '{W/U}',
      '{2/R}',
      '{G/P}',
      '{X}',
      '{1000000}',
    ])
  })

  it('devuelve vacío si no hay coste', () => {
    expect(tokenizeManaCost('')).toEqual([])
  })
})

describe('tokenize', () => {
  it('separa símbolos del texto', () => {
    expect(tokenize('{T}: Add {G}.')).toEqual([
      { kind: 'symbol', symbol: '{T}' },
      { kind: 'text', text: ': Add ', italic: false, bold: false },
      { kind: 'symbol', symbol: '{G}' },
      { kind: 'text', text: '.', italic: false, bold: false },
    ])
  })

  it('pone en cursiva el texto recordatorio, con los paréntesis', () => {
    const tokens = tokenize('Flying (This creature can only be blocked by fliers.)')
    expect(tokens).toEqual([
      { kind: 'text', text: 'Flying ', italic: false, bold: false },
      {
        kind: 'text',
        text: '(This creature can only be blocked by fliers.)',
        italic: true,
        bold: false,
      },
    ])
  })

  it('cuenta paréntesis anidados', () => {
    const tokens = tokenize('Text (reminder (nested) still reminder) after')
    expect(tokens.map((t) => (t.kind === 'text' ? [t.text, t.italic] : t.kind))).toEqual([
      ['Text ', false],
      ['(reminder (nested) still reminder)', true],
      [' after', false],
    ])
  })

  it('no se come el texto si falta cerrar un paréntesis', () => {
    const tokens = tokenize('Something (sin cerrar')
    expect(tokens.map((t) => (t.kind === 'text' ? t.text : t.kind)).join('')).toBe(
      'Something (sin cerrar',
    )
  })

  it('mete un salto por cada habilidad', () => {
    const tokens = tokenize('Flying\nVigilance')
    expect(tokens).toEqual([
      { kind: 'text', text: 'Flying', italic: false, bold: false },
      { kind: 'break' },
      { kind: 'text', text: 'Vigilance', italic: false, bold: false },
    ])
  })

  it('separa la ambientación con una raya y la pone en cursiva', () => {
    const tokens = tokenize('Flying', { flavor: 'Nunca mires abajo.' })
    expect(tokens).toEqual([
      { kind: 'text', text: 'Flying', italic: false, bold: false },
      { kind: 'divider' },
      { kind: 'text', text: 'Nunca mires abajo.', italic: true, bold: false },
    ])
  })

  it('sin reglas, la ambientación va sola y sin raya', () => {
    const tokens = tokenize('', { flavor: 'Sólo sabor.' })
    expect(tokens.some((t) => t.kind === 'divider')).toBe(false)
    expect(tokens.at(-1)).toEqual({ kind: 'text', text: 'Sólo sabor.', italic: true, bold: false })
  })

  it('los símbolos dentro de la ambientación siguen siendo símbolos', () => {
    const tokens = tokenize('', { flavor: 'Paga {2} y verás.' })
    expect(tokens.filter((t) => t.kind === 'symbol')).toEqual([{ kind: 'symbol', symbol: '{2}' }])
  })

  it('entiende **negrita**, *cursiva* y ***ambas*** del editor', () => {
    const tokens = tokenize('Esto es **fuerte** y esto *cursiva* y esto ***las dos***.')
    expect(tokens).toEqual([
      { kind: 'text', text: 'Esto es ', italic: false, bold: false },
      { kind: 'text', text: 'fuerte', italic: false, bold: true },
      { kind: 'text', text: ' y esto ', italic: false, bold: false },
      { kind: 'text', text: 'cursiva', italic: true, bold: false },
      { kind: 'text', text: ' y esto ', italic: false, bold: false },
      { kind: 'text', text: 'las dos', italic: true, bold: true },
      { kind: 'text', text: '.', italic: false, bold: false },
    ])
  })

  it('la negrita dentro de texto recordatorio se queda en cursiva', () => {
    const tokens = tokenize('(this is **important**)')
    expect(tokens).toEqual([
      { kind: 'text', text: '(this is ', italic: true, bold: false },
      { kind: 'text', text: 'important', italic: true, bold: true },
      { kind: 'text', text: ')', italic: true, bold: false },
    ])
  })
})
