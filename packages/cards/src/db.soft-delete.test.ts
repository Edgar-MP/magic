import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Deck, ProxyDesign } from '@magic/shared'
import {
  db,
  getDeck,
  getProxy,
  isAlive,
  listCollection,
  listDecks,
  listProxies,
  softDeleteCollectionItem,
  softDeleteDeck,
  softDeleteProxy,
} from './db.js'

/**
 * Los borrados son lógicos para poder propagarlos. Lo que se prueba aquí es que
 * ninguna lectura devuelve lo borrado: si una se olvidara del filtro, saldrían
 * mazos fantasma en la lista.
 */

const deck = (id: string, name: string): Deck => ({
  id,
  name,
  format: 'casual',
  entries: [],
  createdAt: 1000,
  updatedAt: 1000,
})

const proxy = (id: string): ProxyDesign => ({
  id,
  frameSet: 'm15',
  variant: 'regular',
  edited: false,
  frameColor: 'red',
  flags: { legendary: false, nyx: false, stamp: false, showPt: false },
  art: { x: 0, y: 0, scale: 1 },
  text: {
    name: 'Rayo',
    mana: '{R}',
    type: 'Instante',
    oracle: '',
    flavor: '',
    note: '',
    pt: '',
    artist: '',
    info: '',
  },
  createdAt: 1000,
  updatedAt: 1000,
})

beforeEach(async () => {
  await db.decks.clear()
  await db.proxies.clear()
  await db.collection.clear()
})

describe('mazos', () => {
  it('deja de aparecer en la lista al borrarlo', async () => {
    await db.decks.bulkAdd([deck('11111111-1111-4111-8111-111111111111', 'Uno'), deck('22222222-2222-4222-8222-222222222222', 'Dos')])
    expect((await listDecks()).map((d) => d.name)).toEqual(['Dos', 'Uno'])

    await softDeleteDeck('11111111-1111-4111-8111-111111111111')
    expect((await listDecks()).map((d) => d.name)).toEqual(['Dos'])
  })

  it('sigue en la tabla, para poder contárselo al servidor', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno'))
    await softDeleteDeck('11111111-1111-4111-8111-111111111111')

    const raw = await db.decks.get('11111111-1111-4111-8111-111111111111')
    expect(raw).toBeDefined()
    expect(raw?.deletedAt).toBeGreaterThan(0)
    // Y con `updatedAt` subido, o la sincronización no lo mandaría.
    expect(raw?.updatedAt).toBeGreaterThan(1000)
  })

  it('getDeck no lo devuelve', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno'))
    await softDeleteDeck('11111111-1111-4111-8111-111111111111')
    expect(await getDeck('11111111-1111-4111-8111-111111111111')).toBeUndefined()
  })
})

describe('proxies', () => {
  it('desaparecen de la lista y de getProxy', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    await db.proxies.add(proxy(id))
    expect(await listProxies()).toHaveLength(1)

    await softDeleteProxy(id)
    expect(await listProxies()).toHaveLength(0)
    expect(await getProxy(id)).toBeUndefined()
  })
})

describe('colección', () => {
  it('una carta borrada no sale en la lista', async () => {
    await db.collection.bulkPut([
      { cardId: 'a', qty: 2, updatedAt: 1000 },
      { cardId: 'b', qty: 1, updatedAt: 1000 },
    ])
    await softDeleteCollectionItem('a')

    expect((await listCollection()).map((i) => i.cardId)).toEqual(['b'])
  })

  it('volver a añadirla la resucita sin la marca de borrado', async () => {
    await db.collection.put({ cardId: 'a', qty: 2, updatedAt: 1000 })
    await softDeleteCollectionItem('a')

    // Es lo que hace setCollectionQty al volver a poner una cantidad.
    await db.collection.put({ cardId: 'a', qty: 1, updatedAt: Date.now() })

    const item = await db.collection.get('a')
    expect(item?.deletedAt).toBeUndefined()
    expect(isAlive(item!)).toBe(true)
    expect((await listCollection()).map((i) => i.cardId)).toEqual(['a'])
  })
})

describe('isAlive', () => {
  it('vivo si no tiene marca de borrado', () => {
    expect(isAlive({})).toBe(true)
    expect(isAlive({ deletedAt: undefined })).toBe(true)
    expect(isAlive({ deletedAt: Date.now() })).toBe(false)
  })
})
