import { useCallback, useEffect, useRef, useState } from 'react'
import { countPending, readCursor, runSync, type SyncReport } from '@magic/cards'
import { useSession } from './api/authClient.js'
import { httpTransport } from './api/sync-transport.js'

/**
 * Sincroniza cuando hay sesión: al entrar, al volver la conexión y a mano.
 *
 * Sin cuenta no hace nada y la aplicación funciona igual que siempre: entrar es
 * opcional y lo único que aporta es guardar en el servidor.
 */

export type SyncState = 'idle' | 'running' | 'ok' | 'error'

export interface SyncStatus {
  state: SyncState
  /** Cuántos cambios hay sin subir. */
  pending: number
  lastRunAt: number | null
  lastReport: SyncReport | null
  error: string | null
  /** `null` mientras se comprueba la sesión. */
  userId: string | null | undefined
  sync: () => void
}

export function useSync(): SyncStatus {
  const { data: session, isPending: sessionPending } = useSession()
  const userId = sessionPending ? undefined : (session?.user.id ?? null)

  const [state, setState] = useState<SyncState>('idle')
  const [pending, setPending] = useState(0)
  const [lastRunAt, setLastRunAt] = useState<number | null>(null)
  const [lastReport, setLastReport] = useState<SyncReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Evita que dos disparos se pisen (entrar y recuperar la conexión a la vez).
  const running = useRef(false)

  const sync = useCallback(() => {
    if (!userId || running.current) return
    running.current = true
    setState('running')
    setError(null)

    void runSync({ userId, transport: httpTransport })
      .then(async (report) => {
        setLastReport(report)
        setState('ok')
        setError(report.problems[0] ?? null)
        setPending(await countPending())
        setLastRunAt((await readCursor(userId)).lastRunAt)
      })
      .catch((e: unknown) => {
        setState('error')
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        running.current = false
      })
  }, [userId])

  // Al entrar (o al recargar con sesión ya abierta).
  useEffect(() => {
    if (userId) sync()
  }, [userId, sync])

  // Al volver la conexión: es cuando más falta hace.
  useEffect(() => {
    if (!userId) return
    const onOnline = () => sync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [userId, sync])

  // El contador de pendientes se refresca solo mientras se trabaja.
  useEffect(() => {
    if (!userId) return
    const timer = setInterval(() => void countPending().then(setPending), 5000)
    return () => clearInterval(timer)
  }, [userId])

  return { state, pending, lastRunAt, lastReport, error, userId, sync }
}
