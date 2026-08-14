import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Auth } from '../auth/auth.js'

export interface AppEnv {
  Variables: {
    userId: string
  }
}

/**
 * Exige sesión y deja el `userId` en el contexto.
 *
 * El `userId` sale **siempre de la sesión**, nunca del cuerpo ni de la URL: es
 * lo único que impide que alguien escriba en los datos de otro pasando un id
 * ajeno.
 */
export function requireAuth(auth: Auth): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) throw new HTTPException(401, { message: 'sin sesión' })

    c.set('userId', session.user.id)
    await next()
  }
}
