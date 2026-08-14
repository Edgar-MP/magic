import { Hono } from 'hono'
import { syncPushSchema } from '@magic/shared'
import type { AppEnv } from '../../middleware/auth.js'
import { pullSync, pushSync } from './sync.service.js'

export const syncRoutes = new Hono<AppEnv>()
  .post('/push', async (c) => {
    const body = syncPushSchema.parse(await c.req.json())
    const userId = c.get('userId')
    const result = await pushSync(userId, body)

    // Un rechazo no debería ocurrir nunca: o hay un cliente desincronizado o
    // alguien está probando ids ajenos. Merece quedar en el log aunque no sea un
    // error de servidor.
    const rejected = result.results.filter((r) => r.status === 'rejected')
    if (rejected.length > 0) {
      console.warn(JSON.stringify({ event: 'sync_push_rejected', userId, rejected }))
    }

    return c.json(result)
  })

  .get('/pull', async (c) => {
    // Sin `since` se trae todo, que es lo que hace un dispositivo nuevo.
    const raw = c.req.query('since')
    const since = raw === undefined ? 0 : Number(raw)
    if (!Number.isFinite(since) || since < 0) {
      return c.json({ error: 'since inválido' }, 400)
    }

    return c.json(await pullSync(c.get('userId'), since))
  })
