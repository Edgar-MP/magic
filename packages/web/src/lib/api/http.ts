/**
 * Cliente de la API.
 *
 * Las rutas son relativas porque la web y la API van en el mismo origen: así la
 * misma imagen de Docker sirve para cualquier dominio y no hay nada que
 * configurar al compilar.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Saca el mensaje que manda la API, o el cuerpo tal cual si no es JSON. */
async function errorMessage(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as { error?: string }
    return body.error ?? text
  } catch {
    return text || response.statusText
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers:
      init.body instanceof Blob
        ? (init.headers ?? {})
        : { 'Content-Type': 'application/json', ...init.headers },
  })

  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
