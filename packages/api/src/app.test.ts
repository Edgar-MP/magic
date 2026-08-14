import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { testEnv } from './test-env.js'

/**
 * Pruebas de la aplicación entera con `app.request()`, sin abrir un puerto.
 *
 * Lo que se comprueba aquí y no en `static.test.ts` es el resultado por HTTP,
 * con la normalización de rutas que hace Hono por el camino.
 */

let app: ReturnType<typeof createApp>
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'magic-app-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'card-assets/m15/regular'), { recursive: true })

  await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>')
  await writeFile(join(root, 'assets/index-abc123.js'), 'console.log(1)')
  await writeFile(join(root, 'card-assets/m15/regular/m15FrameW.png'), 'png-de-mentira')
  await writeFile(join(root, 'card-index.json'), '[]')

  app = createApp(testEnv({ WEB_DIST: root, DATA_DIR: join(root, 'data') }))
})

describe('salud', () => {
  it('contesta en /v1/health', async () => {
    const response = await app.request('/v1/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('una ruta de API que no existe es 404, no el index del SPA', async () => {
    const response = await app.request('/v1/lo-que-sea')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).not.toContain('text/html')
  })
})

describe('estáticos', () => {
  it('sirve el bundle con caché para siempre', async () => {
    const response = await app.request('/assets/index-abc123.js')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('immutable')
    expect(await response.text()).toBe('console.log(1)')
  })

  it('sirve un marco', async () => {
    const response = await app.request('/card-assets/m15/regular/m15FrameW.png')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toContain('immutable')
  })

  it('devuelve el index en las rutas del SPA', async () => {
    for (const path of ['/', '/decks', '/decks/abc-123', '/proxies/x']) {
      const response = await app.request(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toContain('text/html')
      expect(response.headers.get('cache-control'), path).toBe('no-cache')
    }
  })

  it('no devuelve HTML por una imagen que falta', async () => {
    const response = await app.request('/card-assets/no-existe.png')
    expect(response.status).toBe(404)
  })

  it('revalida el índice de cartas con ETag', async () => {
    const first = await app.request('/card-index.json')
    const etag = first.headers.get('etag')
    expect(etag).toBeTruthy()

    const second = await app.request('/card-index.json', {
      headers: { 'If-None-Match': etag ?? '' },
    })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
  })
})

describe('no se sirve nada de fuera del directorio de la web', () => {
  // Hono normaliza la ruta antes de llegar al handler, así que estos intentos no
  // acaban en un 400 sino en el index del SPA. Lo que importa es lo de abajo: que
  // el cuerpo nunca sea un fichero del sistema.
  const attempts = [
    '/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/assets/../../../etc/passwd',
    '/card-assets/../../../../etc/passwd',
    '/..%2f..%2fetc%2fpasswd',
  ]

  it.each(attempts)('%s no filtra nada', async (path) => {
    const response = await app.request(path)
    const body = await response.text()

    expect(body).not.toContain('root:')
    expect(body).not.toContain('/bin/')
    // O es el index del SPA, o un rechazo. Nunca contenido de fuera.
    if (response.status === 200) {
      expect(response.headers.get('content-type')).toContain('text/html')
    } else {
      expect([400, 404]).toContain(response.status)
    }
  })
})
