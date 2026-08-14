import { createAuthClient } from 'better-auth/react'

/**
 * Cliente de sesión. Sin `baseURL`: la API está en el mismo origen, así que la
 * cookie es de primera parte y no hay CORS.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  fetchOptions: { credentials: 'include' },
})

export const { useSession, signIn, signUp, signOut } = authClient
