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
 * Enlace público de mazo compartido: lectura de datos y de arte, sin sesión,
 * sin filtrar nada de otro usuario.
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

/** Empuja un mazo (y opcionalmente sus proxies) al servidor como `user`. */
async function push(
  user: TestUser,
  deck: ReturnType<typeof makeDeck>,
  proxies: ReturnType<typeof makeProxy>[] = [],
) {
  const response = await harness.app.request(
    '/v1/sync/push',
    asUser(user, { decks: [deck], collection: [], proxies }),
  )
  expect(response.status).toBe(200)
}

describe('GET /v1/share/:token', () => {
  it('devuelve el mazo y sus proxies sin sesión', async () => {
    const token = randomUUID()
    const proxy = makeProxy()
    const deck = makeDeck({
      shareToken: token,
      entries: [{ cardId: 'carta-1', qty: 2, board: 'main', proxyId: proxy.id }],
    })
    await push(ana, deck, [proxy])

    const response = await harness.app.request(`/v1/share/${token}`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.deck.name).toBe(deck.name)
    expect(body.deck.entries).toHaveLength(1)
    expect(body.proxies).toHaveLength(1)
    expect(body.proxies[0].id).toBe(proxy.id)
    expect(body.proxies[0].design.text.name).toBe(proxy.design.text.name)
  })

  it('un token que no existe es 404', async () => {
    const response = await harness.app.request(`/v1/share/${randomUUID()}`)
    expect(response.status).toBe(404)
  })

  it('un mazo borrado no es accesible aunque el token siga puesto', async () => {
    const token = randomUUID()
    const deck = makeDeck({ shareToken: token, deletedAt: Date.now() })
    await push(ana, deck)

    const response = await harness.app.request(`/v1/share/${token}`)
    expect(response.status).toBe(404)
  })

  it('no expone proxies de otro usuario aunque compartan id de carta', async () => {
    const token = randomUUID()
    // El proxy de Beto no está en la tabla de Ana: el mazo de Ana referencia un
    // proxyId que sólo existe en la cuenta de Beto.
    const ajeno = makeProxy()
    await push(beto, makeDeck(), [ajeno])

    const deck = makeDeck({
      shareToken: token,
      entries: [{ cardId: 'carta-1', qty: 1, board: 'main', proxyId: ajeno.id }],
    })
    await push(ana, deck)

    const response = await harness.app.request(`/v1/share/${token}`)
    const body = await response.json()
    expect(body.proxies).toHaveLength(0)
  })

  it('no comparte mazos sin token', async () => {
    const deck = makeDeck()
    await push(ana, deck)
    // Sin shareToken, no hay ruta pública para llegar a él.
    const response = await harness.app.request(`/v1/share/${deck.id}`)
    expect(response.status).toBe(404)
  })
})

describe('GET /v1/share/:token/art/:blobId', () => {
  const bytes = (size: number) => new Uint8Array(size).fill(7)

  it('sirve la imagen si el blobId es el de un proxy de ese mazo', async () => {
    const artId = randomUUID()
    await harness.app.request(`/v1/art/${artId}`, {
      method: 'PUT',
      headers: { Cookie: ana.cookie, 'Content-Type': 'image/png', 'Content-Length': '32' },
      body: bytes(32),
    })

    const token = randomUUID()
    const proxy = makeProxy({ design: { ...makeProxy().design, art: { x: 0, y: 0, scale: 1, blobId: artId } } })
    const deck = makeDeck({
      shareToken: token,
      entries: [{ cardId: 'carta-1', qty: 1, board: 'main', proxyId: proxy.id }],
    })
    await push(ana, deck, [proxy])

    const response = await harness.app.request(`/v1/share/${token}/art/${artId}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes(32))
  })

  it('404 si el blobId no aparece en ningún proxy de ese mazo, aunque sea del mismo dueño', async () => {
    const artId = randomUUID()
    await harness.app.request(`/v1/art/${artId}`, {
      method: 'PUT',
      headers: { Cookie: ana.cookie, 'Content-Type': 'image/png', 'Content-Length': '10' },
      body: bytes(10),
    })

    const token = randomUUID()
    // Mazo compartido de Ana, pero que no referencia ese blobId en ningún proxy.
    await push(ana, makeDeck({ shareToken: token }))

    const response = await harness.app.request(`/v1/share/${token}/art/${artId}`)
    expect(response.status).toBe(404)
  })

  it('404 si el blobId es de otro usuario, con o sin coincidencia de id', async () => {
    const artId = randomUUID()
    await harness.app.request(`/v1/art/${artId}`, {
      method: 'PUT',
      headers: { Cookie: beto.cookie, 'Content-Type': 'image/png', 'Content-Length': '10' },
      body: bytes(10),
    })

    const token = randomUUID()
    const proxy = makeProxy({ design: { ...makeProxy().design, art: { x: 0, y: 0, scale: 1, blobId: artId } } })
    await push(
      ana,
      makeDeck({
        shareToken: token,
        entries: [{ cardId: 'carta-1', qty: 1, board: 'main', proxyId: proxy.id }],
      }),
      [proxy],
    )

    const response = await harness.app.request(`/v1/share/${token}/art/${artId}`)
    expect(response.status).toBe(404)
  })

  it('un token inválido es 404', async () => {
    const response = await harness.app.request(`/v1/share/${randomUUID()}/art/${randomUUID()}`)
    expect(response.status).toBe(404)
  })
})
