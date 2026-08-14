import { afterEach, describe, expect, it } from 'vitest'
import type { CardIndexEntry } from '@magic/shared'
import { searchLocal, setIndexForTests, indexReady } from './local-index.js'

const entry = (
  name: string,
  extra: Partial<CardIndexEntry> = {},
): CardIndexEntry => ({
  id: name.toLowerCase().replace(/\W+/g, '-'),
  name,
  set: 'tst',
  legal: 'commander modern',
  ...extra,
})

const INDEX = [
  entry('Bolt Hound', { ci: 'R' }),
  entry('Lightning Bolt', { ci: 'R', legal: 'modern legacy' }),
  entry('Lightning Helix', { ci: 'RW' }),
  entry('Sol Ring'),
  entry('Thunderbolt', { ci: 'U' }),
]

afterEach(() => setIndexForTests(null))

describe('searchLocal', () => {
  it('no devuelve nada si el índice no está cargado', () => {
    expect(indexReady()).toBe(false)
    expect(searchLocal('bolt')).toEqual([])
  })

  it('pone delante las que empiezan por el texto buscado', () => {
    setIndexForTests(INDEX)
    expect(searchLocal('bolt').map((e) => e.name)).toEqual([
      'Bolt Hound',
      'Lightning Bolt',
      'Thunderbolt',
    ])
  })

  it('ignora mayúsculas y espacios de sobra', () => {
    setIndexForTests(INDEX)
    expect(searchLocal(' SOL ').map((e) => e.name)).toEqual(['Sol Ring'])
    expect(searchLocal('sOl rInG').map((e) => e.name)).toEqual(['Sol Ring'])
  })

  it('filtra por legalidad del formato', () => {
    setIndexForTests(INDEX)
    // Ninguna del índice declara Standard.
    expect(searchLocal('bolt', { format: 'standard' })).toEqual([])
    expect(searchLocal('bolt', { format: 'modern' }).map((e) => e.name)).toEqual([
      'Bolt Hound',
      'Lightning Bolt',
      'Thunderbolt',
    ])
    // Sólo Lightning Bolt declara Legacy.
    expect(searchLocal('bolt', { format: 'legacy' }).map((e) => e.name)).toEqual([
      'Lightning Bolt',
    ])
    // Y `commander` no debe casar como subcadena de nada.
    expect(searchLocal('bolt', { format: 'command' })).toEqual([])
  })

  it('filtra por identidad de color del comandante', () => {
    setIndexForTests(INDEX)
    expect(searchLocal('lightning', { identity: ['R'] }).map((e) => e.name)).toEqual([
      'Lightning Bolt',
    ])
    expect(searchLocal('lightning', { identity: ['R', 'W'] }).map((e) => e.name)).toEqual([
      'Lightning Bolt',
      'Lightning Helix',
    ])
  })

  it('respeta el límite', () => {
    setIndexForTests(INDEX)
    expect(searchLocal('o', { limit: 2 })).toHaveLength(2)
  })

  it('devuelve vacío con la consulta vacía', () => {
    setIndexForTests(INDEX)
    expect(searchLocal('   ')).toEqual([])
  })
})
