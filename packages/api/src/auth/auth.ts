import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from '../db/client.js'
import type { Env } from '../env.js'

/**
 * Cuentas con correo y contraseña, registro abierto.
 *
 * La web y la API van en el mismo origen, así que la cookie de sesión es de
 * primera parte y no hace falta ni CORS ni `sameSite: none`.
 */
export function createAuth(env: Env) {
  return betterAuth({
    secret: env.AUTH_SECRET,
    ...(env.PUBLIC_URL ? { baseURL: env.PUBLIC_URL } : {}),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      // Sin servidor de correo no se puede verificar nada; exigirlo dejaría a
      // todo el mundo fuera.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    user: {
      // better-auth quiere un campo `name`; se apunta a nuestra columna en vez
      // de duplicarla.
      fields: { name: 'displayName' },
    },
    advanced: {
      // Los ids son columnas @db.Uuid: que los genere Postgres y no better-auth,
      // que inventaría un string que no es un UUID.
      database: { generateId: false },
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
