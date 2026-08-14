import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { cacheControlFor, resolveInsideRoot, serveStaticFile } from './static.js'

/** Un `dist` de mentira con la forma que deja el build de la web. */
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'magic-static-'))
  await mkdir(join(root, 'assets'), { recursive: true })
  await mkdir(join(root, 'card-assets/m15/regular'), { recursive: true })

  await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>')
  await writeFile(join(root, 'assets/index-abc123.js'), 'console.log(1)')
  await writeFile(join(root, 'card-assets/m15/regular/m15FrameW.png'), 'png')
  await writeFile(join(root, 'card-index.json'), '[]')
  await writeFile(join(root, 'favicon.svg'), '<svg/>')
})

const get = (pathname: string, extra: { accept?: string; ifNoneMatch?: string } = {}) =>
  serveStaticFile({ root, pathname, method: 'GET', ...extra })

describe('cacheControlFor', () => {
  it('cachea para siempre lo que no cambia sin cambiar de nombre', () => {
    expect(cacheControlFor('/assets/index-abc123.js')).toContain('immutable')
    expect(cacheControlFor('/card-assets/m15/regular/m15FrameW.png')).toContain('immutable')
  })

  it('revalida el índice de cartas, que cambia con cada expansión', () => {
    expect(cacheControlFor('/card-index.json')).toBe('public, max-age=300, must-revalidate')
  })

  it('no cachea el HTML, o un despliegue nuevo no llegaría', () => {
    expect(cacheControlFor('/')).toBe('no-cache')
    expect(cacheControlFor('/index.html')).toBe('no-cache')
  })
})

describe('resolveInsideRoot', () => {
  it('resuelve una ruta normal', () => {
    expect(resolveInsideRoot('/srv/web', '/assets/app.js')).toBe('/srv/web/assets/app.js')
  })

  it('no deja salirse con ..', () => {
    expect(resolveInsideRoot('/srv/web', '/../../etc/passwd')).toBeUndefined()
    expect(resolveInsideRoot('/srv/web', '/assets/../../../etc/passwd')).toBeUndefined()
  })

  it('no deja salirse con .. codificado', () => {
    expect(resolveInsideRoot('/srv/web', '/%2e%2e/%2e%2e/etc/passwd')).toBeUndefined()
  })

  it('rechaza un porcentaje mal escrito y los bytes nulos', () => {
    expect(resolveInsideRoot('/srv/web', '/%')).toBeUndefined()
    expect(resolveInsideRoot('/srv/web', '/a%00b')).toBeUndefined()
  })

  it('no confunde un directorio hermano con el raíz', () => {
    // `/srv/web-secreto` empieza por `/srv/web` pero no está dentro.
    expect(resolveInsideRoot('/srv/web', '/../web-secreto/x')).toBeUndefined()
  })
})

describe('serveStaticFile', () => {
  it('sirve un fichero que existe', async () => {
    const result = await get('/assets/index-abc123.js')
    expect(result?.status).toBe(200)
    expect(result?.headers['Content-Type']).toContain('text/javascript')
    expect(result?.headers['Cache-Control']).toContain('immutable')
    expect(result?.body).toBeDefined()
  })

  it('sirve la raíz como index.html', async () => {
    const result = await get('/')
    expect(result?.status).toBe(200)
    expect(result?.headers['Content-Type']).toContain('text/html')
    expect(result?.headers['Cache-Control']).toBe('no-cache')
  })

  it('devuelve index.html en una ruta del SPA', async () => {
    const result = await get('/decks/abc-123')
    expect(result?.status).toBe(200)
    expect(result?.headers['Content-Type']).toContain('text/html')
  })

  it('también con Accept de navegador', async () => {
    const result = await get('/proxies/x.y', { accept: 'text/html,*/*' })
    expect(result?.headers['Content-Type']).toContain('text/html')
  })

  it('no inventa un HTML para un asset que falta', async () => {
    // Si un .png que no existe devolviera index.html, el navegador se comería un
    // HTML creyendo que es una imagen y el fallo sería incomprensible.
    expect(await get('/card-assets/m15/regular/noExiste.png')).toBeUndefined()
  })

  it('responde 304 cuando el ETag coincide', async () => {
    const first = await get('/card-index.json')
    const etag = first?.headers.ETag
    expect(etag).toBeTruthy()

    const second = await get('/card-index.json', { ifNoneMatch: etag })
    expect(second?.status).toBe(304)
    expect(second?.body).toBeUndefined()
  })

  it('HEAD contesta con cabeceras y sin cuerpo', async () => {
    const result = await serveStaticFile({
      root,
      pathname: '/card-assets/m15/regular/m15FrameW.png',
      method: 'HEAD',
    })
    expect(result?.status).toBe(200)
    expect(result?.headers['Content-Length']).toBe('3')
    expect(result?.body).toBeUndefined()
  })

  it('corta un intento de salirse del directorio', async () => {
    const result = await get('/../../etc/passwd')
    expect(result?.status).toBe(400)
  })
})
