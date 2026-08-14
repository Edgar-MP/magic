import { resolve } from 'node:path'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createAuth } from './auth/auth.js'
import type { Env } from './env.js'
import { requireAuth, type AppEnv } from './middleware/auth.js'
import { artRoutes } from './modules/art/art.routes.js'
import { syncRoutes } from './modules/sync/sync.routes.js'
import { serveStaticFile } from './static.js'

/**
 * Un solo servidor para todo: las cuentas, la API y la web compilada. Al ir en el
 * mismo origen no hay CORS que configurar y la cookie de sesión es de primera
 * parte.
 */
export function createApp(env: Env) {
  const app = new Hono<AppEnv>()
  const webDist = resolve(env.WEB_DIST)
  const auth = createAuth(env)

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status)
    }
    // Un fallo inesperado se registra entero pero al cliente sólo le llega que
    // algo se rompió: los detalles internos no son asunto suyo.
    console.error(JSON.stringify({ event: 'error', path: c.req.path, message: String(error) }))
    return c.json({ error: 'error interno' }, 500)
  })

  app.get('/v1/health', (c) => c.json({ status: 'ok' }))

  // Registro, entrada, salida y sesión los sirve better-auth.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  const session = requireAuth(auth)

  app.use('/v1/sync/*', session)
  app.route('/v1/sync', syncRoutes)

  app.use('/v1/art/*', session)
  app.route('/v1/art', artRoutes(env))

  // Todo lo que no es la API sale del directorio de la web.
  app.on(['GET', 'HEAD'], '/*', async (c) => {
    if (c.req.path.startsWith('/v1/') || c.req.path.startsWith('/api/')) return c.notFound()

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
