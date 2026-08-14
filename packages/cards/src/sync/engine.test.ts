import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Deck, ProxyDesign, SyncPullResponse, SyncPush, SyncPushResponse } from '@magic/shared'
import { db } from '../db.js'
import { countPending, runSync, type SyncTransport } from './engine.js'
import { clearCursor, readCursor } from './state.js'

/**
 * El motor con un servidor de mentira. Lo que se comprueba es lo que de verdad
 * se rompe en una sincronización: que no se suba dos veces, que un conflicto lo
 * gane el más nuevo, que un borrado no resucite y que las ilustraciones viajen.
 */

const USER = 'usuario-1'

const deck = (id: string, name: string, updatedAt: number): Deck => ({
  id,
  name,
  format: 'casual',
  entries: [],
  createdAt: 1000,
  updatedAt,
})

const design = (id: string, name = 'Rayo'): ProxyDesign => ({
  id,
  frameSet: 'm15' as const,
  variant: 'regular' as const,
  edited: false,
  frameColor: 'red' as const,
  flags: { legendary: false, nyx: false, stamp: false, showPt: false },
  art: { x: 0, y: 0, scale: 1 },
  text: {
    name,
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

/** Servidor de mentira: acepta todo y devuelve lo que se le diga. */
function fakeTransport(overrides: Partial<SyncTransport> = {}): SyncTransport {
  return {
    push: vi.fn(async (body: SyncPush): Promise<SyncPushResponse> => ({
      results: [
        ...body.decks.map((d) => ({ entity: 'deck' as const, id: d.id, status: 'applied' as const })),
        ...body.collection.map((i) => ({
          entity: 'collection' as const,
          id: i.cardId,
          status: 'applied' as const,
        })),
        ...body.proxies.map((p) => ({
          entity: 'proxy' as const,
          id: p.id,
          status: 'applied' as const,
        })),
      ],
      serverTime: 5000,
    })),
    pull: vi.fn(
      async (): Promise<SyncPullResponse> => ({
        decks: [],
        collection: [],
        proxies: [],
        serverTime: 5000,
        artIds: [],
      }),
    ),
    uploadArt: vi.fn(async () => undefined),
    downloadArt: vi.fn(async () => undefined),
    ...overrides,
  }
}

beforeEach(async () => {
  await Promise.all([
    db.decks.clear(),
    db.collection.clear(),
    db.proxies.clear(),
    db.blobs.clear(),
    db.meta.clear(),
  ])
  await clearCursor()
})

describe('subida', () => {
  it('sube lo que no se ha subido nunca', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno', 2000))
    const transport = fakeTransport()

    const report = await runSync({ userId: USER, transport })

    expect(report.pushed.decks).toBe(1)
    expect(transport.push).toHaveBeenCalledWith(
      expect.objectContaining({ decks: [expect.objectContaining({ name: 'Uno' })] }),
    )
  })

  it('no lo vuelve a subir si no ha cambiado', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno', 2000))
    await runSync({ userId: USER, transport: fakeTransport() })

    const transport = fakeTransport()
    const report = await runSync({ userId: USER, transport })

    expect(report.pushed.decks).toBe(0)
    // Sin nada pendiente ni siquiera se llama al push.
    expect(transport.push).not.toHaveBeenCalled()
  })

  it('lo vuelve a subir si se edita después', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await db.decks.add(deck(id, 'Uno', 2000))
    await runSync({ userId: USER, transport: fakeTransport() })

    await db.decks.update(id, { name: 'Editado', updatedAt: Date.now() })
    expect(await countPending()).toBe(1)

    const report = await runSync({ userId: USER, transport: fakeTransport() })
    expect(report.pushed.decks).toBe(1)
  })

  it('lo que el servidor no acepta se queda pendiente', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno', 2000))

    const transport = fakeTransport({
      push: vi.fn(async (body: SyncPush) => ({
        results: body.decks.map((d) => ({
          entity: 'deck' as const,
          id: d.id,
          status: 'stale' as const,
        })),
        serverTime: 5000,
      })),
    })

    const report = await runSync({ userId: USER, transport })
    expect(report.pushed.decks).toBe(0)
    expect(await countPending()).toBe(1)
  })

  it('un cambio hecho durante la subida no se pierde', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await db.decks.add(deck(id, 'Original', 2000))

    // El servidor tarda, y mientras se edita el mazo. Si se marcara como subido
    // con la hora de ahora en vez de con la versión que se envió, esta edición
    // quedaría marcada como sincronizada sin haber salido nunca.
    const transport = fakeTransport({
      push: vi.fn(async (body: SyncPush) => {
        await db.decks.update(id, { name: 'Editado en vuelo', updatedAt: 9000 })
        return {
          results: body.decks.map((d) => ({
            entity: 'deck' as const,
            id: d.id,
            status: 'applied' as const,
          })),
          serverTime: 5000,
        }
      }),
    })

    await runSync({ userId: USER, transport })

    expect(await countPending()).toBe(1)
    const report = await runSync({ userId: USER, transport: fakeTransport() })
    expect(report.pushed.decks).toBe(1)
  })

  it('avisa de un rechazo', async () => {
    await db.decks.add(deck('11111111-1111-4111-8111-111111111111', 'Uno', 2000))

    const transport = fakeTransport({
      push: vi.fn(async (body: SyncPush) => ({
        results: body.decks.map((d) => ({
          entity: 'deck' as const,
          id: d.id,
          status: 'rejected' as const,
          reason: 'de otro usuario',
        })),
        serverTime: 5000,
      })),
    })

    const report = await runSync({ userId: USER, transport })
    expect(report.problems[0]).toContain('rechazó')
  })

  it('manda el borrado, no lo esconde', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await db.decks.add({ ...deck(id, 'Uno', 2000), deletedAt: 3000, updatedAt: 3000 })

    const transport = fakeTransport()
    await runSync({ userId: USER, transport })

    expect(transport.push).toHaveBeenCalledWith(
      expect.objectContaining({ decks: [expect.objectContaining({ deletedAt: 3000 })] }),
    )
  })
})

describe('bajada', () => {
  it('aplica un mazo que llega del servidor', async () => {
    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [{ ...deck('22222222-2222-4222-8222-222222222222', 'Del servidor', 4000), deletedAt: null }],
        collection: [],
        proxies: [],
        serverTime: 5000,
        artIds: [],
      })),
    })

    const report = await runSync({ userId: USER, transport })

    expect(report.pulled.decks).toBe(1)
    const stored = await db.decks.get('22222222-2222-4222-8222-222222222222')
    expect(stored?.name).toBe('Del servidor')
    // Marcado como sincronizado, o el siguiente push lo devolvería.
    expect(stored?.syncedAt).toBe(4000)
    expect(await countPending()).toBe(0)
  })

  it('no pisa un cambio local más nuevo', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    await db.decks.add(deck(id, 'Local nuevo', 9000))

    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [{ ...deck(id, 'Del servidor', 4000), deletedAt: null }],
        collection: [],
        proxies: [],
        serverTime: 5000,
        artIds: [],
      })),
    })

    await runSync({ userId: USER, transport })
    expect((await db.decks.get(id))?.name).toBe('Local nuevo')
  })

  it('sí pisa si el del servidor es más nuevo', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    await db.decks.add(deck(id, 'Local viejo', 1000))

    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [{ ...deck(id, 'Del servidor', 8000), deletedAt: null }],
        collection: [],
        proxies: [],
        serverTime: 9000,
        artIds: [],
      })),
    })

    await runSync({ userId: USER, transport })
    expect((await db.decks.get(id))?.name).toBe('Del servidor')
  })

  it('un borrado del servidor no resucita en local', async () => {
    const id = '22222222-2222-4222-8222-222222222222'
    await db.decks.add(deck(id, 'Vivo', 1000))

    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [{ ...deck(id, 'Vivo', 7000), deletedAt: 7000 }],
        collection: [],
        proxies: [],
        serverTime: 9000,
        artIds: [],
      })),
    })

    await runSync({ userId: USER, transport })

    const stored = await db.decks.get(id)
    expect(stored?.deletedAt).toBe(7000)
  })
})

describe('cursor', () => {
  it('empieza en cero y avanza con la hora del servidor', async () => {
    const transport = fakeTransport()
    await runSync({ userId: USER, transport })

    expect(transport.pull).toHaveBeenCalledWith(0)
    expect((await readCursor(USER)).serverTime).toBe(5000)

    await runSync({ userId: USER, transport })
    expect(transport.pull).toHaveBeenLastCalledWith(5000)
  })

  it('otra cuenta en el mismo navegador arranca de cero', async () => {
    await runSync({ userId: USER, transport: fakeTransport() })

    const otro = fakeTransport()
    await runSync({ userId: 'otro-usuario', transport: otro })
    expect(otro.pull).toHaveBeenCalledWith(0)
  })
})

describe('ilustraciones', () => {
  it('sube la imagen antes que el proxy que la usa', async () => {
    const blobId = '33333333-3333-4333-8333-333333333333'
    const proxy = design('44444444-4444-4444-8444-444444444444')
    proxy.art = { ...proxy.art, blobId }

    await db.blobs.add({
      id: blobId,
      blob: new Blob(['datos'], { type: 'image/png' }),
      mime: 'image/png',
      createdAt: 1000,
    })
    await db.proxies.add(proxy)

    const order: string[] = []
    const transport = fakeTransport({
      uploadArt: vi.fn(async () => {
        order.push('art')
      }),
      push: vi.fn(async () => {
        order.push('push')
        return { results: [], serverTime: 5000 }
      }),
    })

    const report = await runSync({ userId: USER, transport })

    expect(report.artUploaded).toBe(1)
    expect(order).toEqual(['art', 'push'])
  })

  it('no vuelve a subir una imagen ya subida', async () => {
    const blobId = '33333333-3333-4333-8333-333333333333'
    const proxy = design('44444444-4444-4444-8444-444444444444')
    proxy.art = { ...proxy.art, blobId }

    await db.blobs.add({
      id: blobId,
      blob: new Blob(['datos'], { type: 'image/png' }),
      mime: 'image/png',
      createdAt: 1000,
      syncedAt: 2000,
    })
    await db.proxies.add(proxy)

    const transport = fakeTransport()
    const report = await runSync({ userId: USER, transport })

    expect(report.artUploaded).toBe(0)
    expect(transport.uploadArt).not.toHaveBeenCalled()
  })

  it('se baja la imagen de un proxy que llega sin ella', async () => {
    const blobId = '33333333-3333-4333-8333-333333333333'
    const proxyId = '44444444-4444-4444-8444-444444444444'
    const remoto = design(proxyId)
    remoto.art = { ...remoto.art, blobId }

    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [],
        collection: [],
        proxies: [{ id: proxyId, design: remoto, createdAt: 1000, updatedAt: 4000, deletedAt: null }],
        serverTime: 5000,
        artIds: [blobId],
      })),
      downloadArt: vi.fn(async () => new Blob(['bajado'], { type: 'image/png' })),
    })

    const report = await runSync({ userId: USER, transport })

    expect(report.artDownloaded).toBe(1)
    const blob = await db.blobs.get(blobId)
    expect(blob).toBeDefined()
    // Viene del servidor: no debe volver a subirse.
    expect(blob?.syncedAt).toBeDefined()
  })

  it('no baja la que ya tiene', async () => {
    const blobId = '33333333-3333-4333-8333-333333333333'
    const proxyId = '44444444-4444-4444-8444-444444444444'
    const remoto = design(proxyId)
    remoto.art = { ...remoto.art, blobId }

    await db.blobs.add({
      id: blobId,
      blob: new Blob(['ya la tengo'], { type: 'image/png' }),
      mime: 'image/png',
      createdAt: 1000,
      syncedAt: 1000,
    })

    const transport = fakeTransport({
      pull: vi.fn(async () => ({
        decks: [],
        collection: [],
        proxies: [{ id: proxyId, design: remoto, createdAt: 1000, updatedAt: 4000, deletedAt: null }],
        serverTime: 5000,
        artIds: [blobId],
      })),
    })

    const report = await runSync({ userId: USER, transport })
    expect(report.artDownloaded).toBe(0)
    expect(transport.downloadArt).not.toHaveBeenCalled()
  })
})

describe('ida y vuelta completa', () => {
  it('lo que sube un dispositivo lo aplica el otro', async () => {
    // Dispositivo A: crea un mazo y lo sube.
    const subidos: SyncPush[] = []
    const transportA = fakeTransport({
      push: vi.fn(async (body: SyncPush) => {
        subidos.push(body)
        return {
          results: body.decks.map((d) => ({
            entity: 'deck' as const,
            id: d.id,
            status: 'applied' as const,
          })),
          serverTime: 5000,
        }
      }),
    })

    await db.decks.add(deck('55555555-5555-4555-8555-555555555555', 'Compartido', 2000))
    await runSync({ userId: USER, transport: transportA })

    // Dispositivo B: base vacía, se trae lo que subió A.
    await db.decks.clear()
    await db.meta.clear()

    const transportB = fakeTransport({
      pull: vi.fn(async () => ({
        decks: subidos[0]!.decks,
        collection: [],
        proxies: [],
        serverTime: 6000,
        artIds: [],
      })),
    })

    const report = await runSync({ userId: USER, transport: transportB })

    expect(report.pulled.decks).toBe(1)
    expect((await db.decks.get('55555555-5555-4555-8555-555555555555'))?.name).toBe('Compartido')
  })
})
