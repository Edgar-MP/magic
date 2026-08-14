import { useState } from 'react'
import { clearCursor } from '@magic/cards'
import { signOut, useSession } from '../lib/api/authClient.js'
import type { SyncStatus } from '../lib/use-sync.js'
import { LoginDialog } from './LoginDialog.js'

/**
 * Estado de la cuenta en la cabecera.
 *
 * Sin cuenta sólo se ve «Entrar»: la aplicación funciona igual y guardar en el
 * servidor es opcional.
 */
export function AccountMenu({ status }: { status: SyncStatus }) {
  const { data: session } = useSession()
  const [showLogin, setShowLogin] = useState(false)

  if (!session) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          className="rounded border border-edge px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-white"
          title="Guardar tus mazos en el servidor y usarlos desde otro dispositivo"
        >
          Entrar
        </button>
        {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
      </>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <SyncBadge status={status} />
      <button
        type="button"
        onClick={() => {
          void signOut().then(async () => {
            // El cursor es de esa cuenta: si se queda, la siguiente sesión no se
            // traería nada del servidor.
            await clearCursor()
          })
        }}
        className="text-xs text-muted hover:text-white"
        title={session.user.email}
      >
        Salir
      </button>
    </div>
  )
}

function SyncBadge({ status }: { status: SyncStatus }) {
  const { state, pending, lastRunAt, error, sync } = status

  const label = (() => {
    if (state === 'running') return 'Sincronizando…'
    if (state === 'error') return 'Error al sincronizar'
    if (pending > 0) return `${pending} sin subir`
    if (lastRunAt) return `Al día · ${formatTime(lastRunAt)}`
    return 'Sincronizar'
  })()

  const tone =
    state === 'error'
      ? 'border-red-800 text-red-300'
      : pending > 0
        ? 'border-amber-800 text-amber-300'
        : 'border-edge text-muted'

  return (
    <button
      type="button"
      onClick={sync}
      disabled={state === 'running'}
      title={error ?? 'Sincronizar ahora'}
      className={`rounded border px-2.5 py-1 text-xs hover:text-white disabled:opacity-60 ${tone}`}
    >
      {label}
    </button>
  )
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}
