import { Hono } from 'hono'
import type { AppEnv } from '../../middleware/auth.js'
import type { Env } from '../../env.js'
import { findSharedDeck, readSharedArt } from './share.service.js'

/**
 * Rutas públicas del mazo compartido: sin `requireAuth`, a propósito. El
 * `shareToken` en sí ya hace de secreto (id generado por el cliente, no
 * adivinable), como cualquier «enlace no listado».
 */
export function shareRoutes(env: Env) {
  return new Hono<AppEnv>()
    .get('/:token', async (c) => {
      const shared = await findSharedDeck(c.req.param('token'))
      if (!shared) return c.json({ error: 'no encontrado' }, 404)
      return c.json(shared)
    })

    .get('/:token/art/:blobId', async (c) => {
      const file = await readSharedArt(env, c.req.param('token'), c.req.param('blobId'))
      if (!file) return c.json({ error: 'no encontrada' }, 404)

      return new Response(file.body, {
        headers: {
          'Content-Type': file.mime,
          'Content-Length': String(file.size),
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    })
}
