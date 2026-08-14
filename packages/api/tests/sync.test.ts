import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/client.js'
import {
  asUser,
  createTestApp,
  makeDeck,
  makeProxy,
  registerUser,
  resetDb,
  type TestApp,
  type TestUser,
} from './helpers.js'

/**
 * Sincronización contra Postgres de verdad. Necesita `docker compose up -d` y las
 * migraciones aplicadas.
 */

let harness: TestApp
let ana: TestUser
let beto: TestUser

beforeAll(async () => {
  await resetDb()
  harness = await createTestApp()
  ana = await registerUser(harness.app)
  beto = await registerUser(harness.app)
})

afterAll(async () => {
  await harness.cleanup()
  await resetDb()
  await prisma.$disconnect()
})

const push = (user: TestUser, body: Record<string, unknown>) =>
  harness.app.request('/v1/sync/push', asUser(user, body))

const pull = (user: TestUser, since = 0) =>
  harness.app.request(`/v1/sync/pull?since=${since}`, asUser(user))

describe('hace falta sesión', () => {
  it('el push sin cookie es 401', async () => {
    const response = await harness.app.request('/v1/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decks: [] }),
    })
    expect(response.status).toBe(401)
  })

  it('el pull sin cookie es 401', async () => {
    expect((await harness.app.request('/v1/sync/pull')).status).toBe(401)
  })
})

describe('ida y vuelta', () => {
  it('sube un mazo y lo devuelve el pull', async () => {
    const deck = makeDeck({ name: 'Tierras', entries: [{ cardId: randomUUID(), qty: 2, board: 'main' }] })

    const pushed = await push(ana, { decks: [deck] })
    expect(pushed.status).toBe(200)
    const pushBody = await pushed.json()
    expect(pushBody.results).toEqual([{ entity: 'deck', id: deck.id, status: 'applied' }])

    const pulled = await pull(ana)
    const body = await pulled.json()
    expect(body.decks).toHaveLength(1)
    expect(body.decks[0]).toMatchObject({ id: deck.id, name: 'Tierras', format: 'casual' })
    expect(body.decks[0].entries).toEqual(deck.entries)
  })

  it('sube la colección y un proxy', async () => {
    const cardId = randomUUID()
    const proxy = makeProxy()

    await push(ana, {
      collection: [{ cardId, qty: 3, updatedAt: Date.now() }],
      proxies: [proxy],
    })

    const body = await (await pull(ana)).json()
    expect(body.collection).toEqual(
      expect.arrayContaining([expect.objectContaining({ cardId, qty: 3 })]),
    )
    expect(body.proxies).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: proxy.id })]),
    )
  })

  it('el pull incremental sólo trae lo nuevo', async () => {
    const first = await (await pull(ana)).json()
    const cursor = first.serverTime

    const nuevo = makeDeck({ name: 'Recién hecho' })
    await push(ana, { decks: [nuevo] })

    const second = await (await pull(ana, cursor)).json()
    expect(second.decks.map((d: { id: string }) => d.id)).toEqual([nuevo.id])
  })
})

describe('aislamiento entre usuarios', () => {
  it('Beto no ve los mazos de Ana', async () => {
    const deck = makeDeck({ name: 'Privado de Ana' })
    await push(ana, { decks: [deck] })

    const body = await (await pull(beto)).json()
    expect(body.decks.map((d: { name: string }) => d.name)).not.toContain('Privado de Ana')
  })

  it('Beto no puede sobrescribir un mazo de Ana ni con el id exacto', async () => {
    const deck = makeDeck({ name: 'De Ana' })
    await push(ana, { decks: [deck] })

    const intento = await push(beto, {
      decks: [{ ...deck, name: 'Secuestrado', updatedAt: Date.now() + 10_000 }],
    })
    const body = await intento.json()
    expect(body.results[0]).toMatchObject({ status: 'rejected', reason: 'de otro usuario' })

    // Y el mazo sigue como estaba.
    const stored = await prisma.deck.findUniqueOrThrow({ where: { id: deck.id } })
    expect(stored.name).toBe('De Ana')
    expect(stored.userId).toBe(ana.id)
  })

  it('tampoco un proxy', async () => {
    const proxy = makeProxy()
    await push(ana, { proxies: [proxy] })

    const intento = await push(beto, { proxies: [{ ...proxy, updatedAt: Date.now() + 10_000 }] })
    expect((await intento.json()).results[0]).toMatchObject({ status: 'rejected' })

    const stored = await prisma.proxy.findUniqueOrThrow({ where: { id: proxy.id } })
    expect(stored.userId).toBe(ana.id)
  })

  it('la colección de cada uno es la suya, aunque sea la misma carta', async () => {
    const cardId = randomUUID()
    await push(ana, { collection: [{ cardId, qty: 4, updatedAt: Date.now() }] })
    await push(beto, { collection: [{ cardId, qty: 1, updatedAt: Date.now() }] })

    const deAna = await (await pull(ana)).json()
    const deBeto = await (await pull(beto)).json()

    expect(deAna.collection.find((i: { cardId: string }) => i.cardId === cardId).qty).toBe(4)
    expect(deBeto.collection.find((i: { cardId: string }) => i.cardId === cardId).qty).toBe(1)
  })
})

describe('conflictos: gana el último que escribe', () => {
  it('una versión más nueva sobrescribe', async () => {
    const deck = makeDeck({ name: 'Primero' })
    await push(ana, { decks: [deck] })
    await push(ana, { decks: [{ ...deck, name: 'Segundo', updatedAt: deck.updatedAt + 1000 }] })

    const stored = await prisma.deck.findUniqueOrThrow({ where: { id: deck.id } })
    expect(stored.name).toBe('Segundo')
  })

  it('una versión más vieja no pisa la buena y avisa con stale', async () => {
    const deck = makeDeck({ name: 'Bueno' })
    await push(ana, { decks: [deck] })

    const response = await push(ana, {
      decks: [{ ...deck, name: 'Viejo', updatedAt: deck.updatedAt - 5000 }],
    })
    expect((await response.json()).results[0]).toMatchObject({ status: 'stale' })

    const stored = await prisma.deck.findUniqueOrThrow({ where: { id: deck.id } })
    expect(stored.name).toBe('Bueno')
  })
})

describe('borrados', () => {
  it('un borrado lógico llega en el pull como lápida', async () => {
    const deck = makeDeck({ name: 'A borrar' })
    await push(ana, { decks: [deck] })

    const borrado = Date.now()
    await push(ana, { decks: [{ ...deck, updatedAt: borrado, deletedAt: borrado }] })

    const body = await (await pull(ana)).json()
    const found = body.decks.find((d: { id: string }) => d.id === deck.id)
    expect(found.deletedAt).toBe(borrado)
  })
})

describe('entradas inválidas', () => {
  it('un since que no es un número es 400', async () => {
    expect((await harness.app.request('/v1/sync/pull?since=ayer', asUser(ana))).status).toBe(400)
  })

  it('un mazo sin nombre no pasa el esquema', async () => {
    const response = await push(ana, { decks: [{ ...makeDeck(), name: undefined }] })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })

  it('un id que no es UUID no pasa el esquema', async () => {
    const response = await push(ana, { decks: [{ ...makeDeck(), id: 'no-soy-un-uuid' }] })
    expect(response.status).toBeGreaterThanOrEqual(400)
  })
})
