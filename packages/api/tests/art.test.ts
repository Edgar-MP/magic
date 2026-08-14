import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../src/db/client.js'
import { asUser, createTestApp, registerUser, resetDb, type TestApp, type TestUser } from './helpers.js'

/** Subida de ilustraciones: propiedad, tipos admitidos y cuotas. */

let harness: TestApp
let ana: TestUser
let beto: TestUser

beforeAll(async () => {
  await resetDb()
  // Cuotas pequeñas para poder pasarse sin mover megas en un test.
  harness = await createTestApp({ MAX_ART_BYTES: 1024, MAX_ART_BYTES_PER_USER: 2048 })
  ana = await registerUser(harness.app)
  beto = await registerUser(harness.app)
})

afterAll(async () => {
  await harness.cleanup()
  await resetDb()
  await prisma.$disconnect()
})

/** Un PNG de mentira del tamaño pedido. Al servidor le basta el content-type. */
const bytes = (size: number) => new Uint8Array(size).fill(1)

function upload(user: TestUser, id: string, data: Uint8Array, mime = 'image/png') {
  return harness.app.request(`/v1/art/${id}`, {
    method: 'PUT',
    headers: {
      Cookie: user.cookie,
      'Content-Type': mime,
      'Content-Length': String(data.byteLength),
    },
    body: data,
  })
}

describe('hace falta sesión', () => {
  it('subir sin cookie es 401', async () => {
    const response = await harness.app.request(`/v1/art/${randomUUID()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: bytes(10),
    })
    expect(response.status).toBe(401)
  })
})

describe('subir y bajar', () => {
  it('guarda una imagen y la devuelve igual', async () => {
    const id = randomUUID()
    const data = bytes(64)

    const put = await upload(ana, id, data)
    expect(put.status).toBe(200)
    expect(await put.json()).toMatchObject({ id, size: 64 })

    const get = await harness.app.request(`/v1/art/${id}`, asUser(ana))
    expect(get.status).toBe(200)
    expect(get.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(data)
  })

  it('reemplazar la misma imagen no cuenta dos veces', async () => {
    const id = randomUUID()
    await upload(ana, id, bytes(300))
    const second = await upload(ana, id, bytes(300))

    expect(second.status).toBe(200)
    const usage = await (await harness.app.request('/v1/art/usage', asUser(ana))).json()
    // 64 de la anterior más 300, no 664.
    expect(usage.used).toBe(364)
  })

  it('una imagen que no existe es 404', async () => {
    expect((await harness.app.request(`/v1/art/${randomUUID()}`, asUser(ana))).status).toBe(404)
  })

  it('un id que no es UUID no se acepta', async () => {
    expect((await upload(ana, 'no-soy-uuid', bytes(10))).status).toBe(400)
    expect((await harness.app.request('/v1/art/no-soy-uuid', asUser(ana))).status).toBe(404)
  })
})

describe('cada uno ve sólo lo suyo', () => {
  it('Beto no puede descargar la ilustración de Ana', async () => {
    const id = randomUUID()
    await upload(ana, id, bytes(50))

    const response = await harness.app.request(`/v1/art/${id}`, asUser(beto))
    expect(response.status).toBe(404)
  })

  it('Beto no puede sobrescribir la ilustración de Ana', async () => {
    const id = randomUUID()
    await upload(ana, id, bytes(50))

    const response = await upload(beto, id, bytes(70))
    expect(response.status).toBe(400)

    // Y sigue siendo de Ana, con su tamaño.
    const stored = await prisma.artBlob.findUniqueOrThrow({ where: { id } })
    expect(stored.userId).toBe(ana.id)
    expect(stored.size).toBe(50)
  })
})

describe('cuotas', () => {
  it('una imagen más grande del máximo se rechaza con 413', async () => {
    const response = await upload(ana, randomUUID(), bytes(2000))
    expect(response.status).toBe(413)
    expect((await response.json()).error).toContain('demasiado grande')
  })

  it('pasarse del total del usuario se rechaza con 413', async () => {
    const suyo = await registerUser(harness.app)

    // El límite son 2048 y cada una 1024: la tercera ya no cabe.
    expect((await upload(suyo, randomUUID(), bytes(1024))).status).toBe(200)
    expect((await upload(suyo, randomUUID(), bytes(1024))).status).toBe(200)

    const tercera = await upload(suyo, randomUUID(), bytes(1024))
    expect(tercera.status).toBe(413)
    expect((await tercera.json()).error).toContain('espacio')
  })

  it('un tipo que no es imagen se rechaza con 415', async () => {
    const response = await upload(ana, randomUUID(), bytes(10), 'application/zip')
    expect(response.status).toBe(415)
  })

  it('/usage dice cuánto queda', async () => {
    const suyo = await registerUser(harness.app)
    const vacio = await (await harness.app.request('/v1/art/usage', asUser(suyo))).json()
    expect(vacio).toEqual({ used: 0, limit: 2048, maxPerImage: 1024 })
  })
})

describe('el pull dice qué ilustraciones tiene el servidor', () => {
  it('devuelve los ids del usuario y no los de otro', async () => {
    const mia = randomUUID()
    await upload(ana, mia, bytes(20))

    const body = await (await harness.app.request('/v1/sync/pull?since=0', asUser(ana))).json()
    expect(body.artIds).toContain(mia)

    const deBeto = await (await harness.app.request('/v1/sync/pull?since=0', asUser(beto))).json()
    expect(deBeto.artIds).not.toContain(mia)
  })
})
