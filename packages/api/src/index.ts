import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './env.js'

const env = loadEnv()

// El volumen de datos puede venir vacío en el primer despliegue.
await mkdir(resolve(env.DATA_DIR), { recursive: true })

const app = createApp(env)

serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log(
    JSON.stringify({
      event: 'listening',
      port: info.port,
      webDist: resolve(env.WEB_DIST),
      dataDir: resolve(env.DATA_DIR),
      nodeEnv: env.NODE_ENV,
    }),
  )
})
