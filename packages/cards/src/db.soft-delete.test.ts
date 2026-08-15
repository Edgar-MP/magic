import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Deck, ProxyDesign } from '@magic/shared'
import {
  createBackFace,
  db,
  getDeck,
  getProxy,
  isAlive,
  listCollection,
  listDecks,
  listProxies,
  removeBackFace,
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

describe('doble cara (DFC)', () => {
  it('crea el dorso vinculado y lo excluye de listProxies', async () => {
    const frontId = '44444444-4444-4444-8444-444444444444'
    await db.proxies.add(proxy(frontId))

    const back = await createBackFace(frontId)
    expect(back.isBackFace).toBe(true)

    const front = await getProxy(frontId)
    expect(front?.backFaceId).toBe(back.id)

    // El dorso no debe aparecer como un proxy suelto en el listado normal.
    const listed = await listProxies()
    expect(listed.map((p) => p.id)).toEqual([frontId])
  })

  it('borrar el frente borra también el dorso', async () => {
    const frontId = '55555555-5555-4555-8555-555555555555'
    await db.proxies.add(proxy(frontId))
    const back = await createBackFace(frontId)

    await softDeleteProxy(frontId)

    expect(await getProxy(frontId)).toBeUndefined()
    expect(await getProxy(back.id)).toBeUndefined()
    const raw = await db.proxies.get(back.id)
    expect(raw?.deletedAt).toBeGreaterThan(0)
  })

  it('borrar el dorso limpia el backFaceId del frente', async () => {
    const frontId = '66666666-6666-4666-8666-666666666666'
    await db.proxies.add(proxy(frontId))
    const back = await createBackFace(frontId)

    await softDeleteProxy(back.id)

    const front = await getProxy(frontId)
    expect(front?.backFaceId).toBeNull()
  })

  it('removeBackFace borra el dorso y desvincula el frente', async () => {
    const frontId = '77777777-7777-4777-8777-777777777777'
    await db.proxies.add(proxy(frontId))
    const back = await createBackFace(frontId)

    await removeBackFace(frontId)

    expect(await getProxy(back.id)).toBeUndefined()
    const front = await getProxy(frontId)
    expect(front?.backFaceId).toBeNull()
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
