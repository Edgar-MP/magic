import { resolve } from 'node:path'
import { Hono } from 'hono'
import type { Env } from './env.js'
import { serveStaticFile } from './static.js'

/**
 * Un solo servidor para todo: la API y la web compilada. Al ir en el mismo
 * origen no hay CORS que configurar y las cookies de sesión funcionan solas
 * cuando se añadan las cuentas.
 */
export function createApp(env: Env) {
  const app = new Hono()
  const webDist = resolve(env.WEB_DIST)

  app.get('/v1/health', (c) => c.json({ status: 'ok' }))

  // Todo lo que no es la API sale del directorio de la web.
  app.on(['GET', 'HEAD'], '/*', async (c) => {
    if (c.req.path.startsWith('/v1/')) return c.notFound()

    const result = await serveStaticFile({
      root: webDist,
      pathname: c.req.path,
      method: c.req.method,
      accept: c.req.header('accept'),
      ifNoneMatch: c.req.header('if-none-match'),
    })

    if (!result) return c.notFound()

    return new Response(result.body ?? null, {
      status: result.status,
      headers: result.headers,
    })
  })

  return app
}
