import { describe, expect, it } from 'vitest'
import { validateDeck } from './formats.js'
import { makeCard, makeDeck, padWithBasics, basic, creature, legalEverywhere } from './test-helpers.js'

const errors = (issues: { level: string; message: string }[]) =>
  issues.filter((i) => i.level === 'error').map((i) => i.message)

describe('Commander', () => {
  const commander = creature('Talrand, Sky Summoner', ['U'], {
    type_line: 'Legendary Creature — Merfolk Wizard',
  })

  it('acepta un mazo de 100 cartas con comandante e identidad correcta', () => {
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: commander, board: 'command' }], 100),
    )
    expect(validateDeck(deck, cards)).toEqual([])
  })

  it('exige comandante', () => {
    const { deck, cards } = makeDeck('commander', padWithBasics([], 100))
    expect(errors(validateDeck(deck, cards))).toContain('Falta el comandante')
  })

  it('rechaza una carta fuera de la identidad de color', () => {
    const intruder = creature('Lightning Bolt Guy', ['R'])
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: commander, board: 'command' }, { card: intruder }], 100),
    )
    expect(errors(validateDeck(deck, cards))).toContain(
      'Lightning Bolt Guy está fuera de la identidad de color del comandante (R)',
    )
  })

  it('rechaza copias repetidas pero no las tierras básicas', () => {
    const repeated = creature('Cloud of Faeries', ['U'])
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: commander, board: 'command' }, { card: repeated, qty: 3 }], 100),
    )
    const found = errors(validateDeck(deck, cards))
    expect(found).toContain('Cloud of Faeries: 3 copias, Commander es singleton')
    expect(found.filter((m) => m.includes('Island'))).toEqual([])
  })

  it('permite muchas copias de una carta que lo dice en su texto', () => {
    const rats = makeCard({
      name: 'Relentless Rats',
      type_line: 'Creature — Rat',
      oracle_text:
        'Relentless Rats gets +1/+1 for each other creature on the battlefield named Relentless Rats.\nA deck can have any number of cards named Relentless Rats.',
      color_identity: ['U'],
      legalities: legalEverywhere('commander'),
      cmc: 3,
    })
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: commander, board: 'command' }, { card: rats, qty: 20 }], 100),
    )
    expect(validateDeck(deck, cards)).toEqual([])
  })

  it('exige exactamente 100 cartas', () => {
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: commander, board: 'command' }], 99),
    )
    expect(errors(validateDeck(deck, cards))).toContain(
      'El mazo tiene 99 cartas contando el comandante, deben ser exactamente 100',
    )
  })

  it('rechaza como comandante algo que no puede serlo', () => {
    const notCommander = makeCard({
      name: 'Sol Ring',
      type_line: 'Artifact',
      legalities: legalEverywhere('commander'),
    })
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics([{ card: notCommander, board: 'command' }], 100),
    )
    expect(errors(validateDeck(deck, cards))).toContain('Sol Ring no puede ser comandante')
  })

  it('acepta dos comandantes con identidad combinada', () => {
    const partnerA = creature('Ishai', ['W'], {
      type_line: 'Legendary Creature — Bird Cleric',
      color_identity: ['W', 'U'],
    })
    const partnerB = creature('Bruse Tarl', ['R'], {
      type_line: 'Legendary Creature — Human Nomad',
      color_identity: ['R', 'W'],
    })
    const red = creature('Goblin', ['R'])
    const { deck, cards } = makeDeck(
      'commander',
      padWithBasics(
        [
          { card: partnerA, board: 'command' },
          { card: partnerB, board: 'command' },
          { card: red },
        ],
        100,
      ),
    )
    expect(validateDeck(deck, cards)).toEqual([])
  })
})

describe('formatos construidos', () => {
  const bolt = makeCard({
    name: 'Lightning Bolt',
    type_line: 'Instant',
    color_identity: ['R'],
    mana_cost: '{R}',
    cmc: 1,
    legalities: { modern: 'legal', standard: 'not_legal', vintage: 'restricted' },
  })

  it('exige 60 cartas en el mazo principal', () => {
    const { deck, cards } = makeDeck('modern', [{ card: bolt, qty: 4 }])
    expect(errors(validateDeck(deck, cards))).toContain(
      'El mazo principal tiene 4 cartas, el mínimo es 60',
    )
  })

  it('limita a 4 copias', () => {
    const { deck, cards } = makeDeck('modern', padWithBasics([{ card: bolt, qty: 5 }], 60))
    expect(errors(validateDeck(deck, cards))).toContain(
      'Lightning Bolt: 5 copias, el máximo es 4',
    )
  })

  it('no limita las tierras básicas', () => {
    const { deck, cards } = makeDeck('modern', [{ card: basic(), qty: 60 }])
    expect(validateDeck(deck, cards)).toEqual([])
  })

  it('marca lo que no es legal en el formato', () => {
    const { deck, cards } = makeDeck('standard', padWithBasics([{ card: bolt, qty: 4 }], 60))
    expect(errors(validateDeck(deck, cards))).toContain(
      'Lightning Bolt no es legal en el formato',
    )
  })

  it('deja una sola copia de una carta restringida', () => {
    const { deck, cards } = makeDeck('vintage', padWithBasics([{ card: bolt, qty: 2 }], 60))
    expect(errors(validateDeck(deck, cards))).toContain(
      'Lightning Bolt: 2 copias, es restringida (máximo 1)',
    )
  })

  it('limita la banda a 15 cartas', () => {
    const { deck, cards } = makeDeck(
      'modern',
      padWithBasics([{ card: basic('Mountain', ['R']), qty: 16, board: 'side' }], 60),
    )
    expect(errors(validateDeck(deck, cards))).toContain(
      'La banda tiene 16 cartas, el máximo es 15',
    )
  })
})

describe('casual', () => {
  it('no valida nada', () => {
    const { deck, cards } = makeDeck('casual', [{ card: creature('Whatever'), qty: 99 }])
    expect(validateDeck(deck, cards)).toEqual([])
  })
})

describe('cartas que faltan en la caché', () => {
  it('avisa sin fallar', () => {
    const deck = {
      format: 'modern' as const,
      entries: [{ cardId: 'desconocida', qty: 1, board: 'main' as const }],
    }
    const issues = validateDeck(deck, new Map())
    expect(issues.some((i) => i.level === 'warning' && i.cardId === 'desconocida')).toBe(true)
  })
})
