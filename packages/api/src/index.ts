import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { prisma } from './db/client.js'
import { loadEnv } from './env.js'

const env = loadEnv()

// El volumen de datos puede venir vacío en el primer despliegue.
await mkdir(resolve(env.DATA_DIR), { recursive: true })

// Comprobación temprana: sin base de datos no hay cuentas ni sincronización, y
// es mucho mejor enterarse aquí que en la primera petición de alguien.
try {
  await prisma.$queryRaw`SELECT 1`
} catch (error) {
  console.error('No se pudo conectar con la base de datos:', String(error))
  process.exit(1)
}

const app = createApp(env)

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
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

/** Docker manda SIGTERM al parar: cerrar bien evita peticiones a medias. */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0))
    })
  })
}
