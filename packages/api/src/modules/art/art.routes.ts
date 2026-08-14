import { Hono } from 'hono'
import type { AppEnv } from '../../middleware/auth.js'
import type { Env } from '../../env.js'
import { readArt, uploadArt, usedBytes } from './art.service.js'

/**
 * Subida y descarga de ilustraciones.
 *
 * El cuerpo va crudo y no como formulario: el cliente ya tiene el Blob y así no
 * hay que montar ni desmontar un multipart para un único fichero.
 */
export function artRoutes(env: Env) {
  return new Hono<AppEnv>()
    .get('/usage', async (c) => {
      const used = await usedBytes(c.get('userId'))
      return c.json({
        used,
        limit: env.MAX_ART_BYTES_PER_USER,
        maxPerImage: env.MAX_ART_BYTES,
      })
    })

    .put('/:id', async (c) => {
      const id = c.req.param('id')
      const mime = c.req.header('content-type') ?? ''

      // Se corta por la cabecera antes de leer el cuerpo: si alguien anuncia 500
      // MB, no tiene sentido tragárselos para luego rechazarlos.
      const announced = Number(c.req.header('content-length') ?? '0')
      if (announced > env.MAX_ART_BYTES) {
        return c.json(
          { error: 'imagen demasiado grande', limit: env.MAX_ART_BYTES, size: announced },
          413,
        )
      }

      const bytes = new Uint8Array(await c.req.arrayBuffer())
      const result = await uploadArt(env, c.get('userId'), id, mime, bytes)

      if ('kind' in result) {
        switch (result.kind) {
          case 'bad-id':
            return c.json({ error: 'identificador no válido' }, 400)
          case 'bad-mime':
            return c.json({ error: `tipo no admitido: ${result.mime}` }, 415)
          case 'too-large':
            return c.json({ error: 'imagen demasiado grande', ...result }, 413)
          case 'quota':
            return c.json(
              {
                error: 'te has quedado sin espacio para ilustraciones',
                used: result.used,
                limit: result.limit,
              },
              413,
            )
        }
      }

      return c.json(result)
    })

    .get('/:id', async (c) => {
      const file = await readArt(env, c.get('userId'), c.req.param('id'))
      if (!file) return c.json({ error: 'no encontrada' }, 404)

      return new Response(file.body, {
        headers: {
          'Content-Type': file.mime,
          'Content-Length': String(file.size),
          // El contenido de un id no cambia nunca: si cambia la imagen, cambia el id.
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
      })
    })
}
