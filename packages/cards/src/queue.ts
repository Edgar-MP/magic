/**
 * Cola secuencial con espera mínima entre peticiones. Scryfall pide no pasar de
 * ~10 req/s; dejamos 100 ms entre llamadas y reintentamos los 429 y 5xx con
 * espera creciente.
 */
export interface QueueOptions {
  /** Milisegundos mínimos entre el fin de una petición y el inicio de la siguiente. */
  minInterval?: number
  maxRetries?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class RequestQueue {
  private readonly minInterval: number
  private readonly maxRetries: number
  private chain: Promise<unknown> = Promise.resolve()
  private lastRun = 0

  constructor({ minInterval = 100, maxRetries = 3 }: QueueOptions = {}) {
    this.minInterval = minInterval
    this.maxRetries = maxRetries
  }

  /** Encola `task`. El resultado se propaga tal cual, incluidos los errores. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(() => this.withRetries(task))
    // La cadena nunca se rompe: si una tarea falla, la siguiente sigue corriendo.
    this.chain = result.catch(() => undefined)
    return result
  }

  private async withRetries<T>(task: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      await this.waitForSlot()
      try {
        return await task()
      } catch (error) {
        lastError = error
        if (!isRetryable(error) || attempt === this.maxRetries) throw error
        // 250 ms, 500 ms, 1 s…
        await sleep(250 * 2 ** attempt)
      }
    }
    throw lastError
  }

  private async waitForSlot(): Promise<void> {
    const wait = this.lastRun + this.minInterval - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastRun = Date.now()
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly details?: string,
  ) {
    super(`${status} en ${url}${details ? `: ${details}` : ''}`)
    this.name = 'HttpError'
  }
}

/** Un 404 de Scryfall significa "no existe", no merece reintento. */
function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500
  // Fallos de red: sí.
  return error instanceof TypeError
}
