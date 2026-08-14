import { useState } from 'react'
import { signIn, signUp } from '../lib/api/authClient.js'
import { Modal } from './Modal.js'

/**
 * Entrar o crear cuenta. El registro está abierto.
 *
 * Lo que ya tengas en este navegador no se pierde al entrar: la primera
 * sincronización lo sube tal cual.
 */
export function LoginDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result =
        mode === 'in'
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: name.trim() || email.split('@')[0] || 'Yo' })

      if (result.error) {
        setError(result.error.message ?? 'No ha funcionado')
        return
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'rounded border border-edge bg-ink px-3 py-2 text-sm outline-none focus:border-accent'

  return (
    <Modal title={mode === 'in' ? 'Entrar' : 'Crear cuenta'} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="text-sm text-muted">
          Con cuenta, tus mazos y proxies se guardan en el servidor y los tienes en
          cualquier dispositivo. Lo que ya tengas en este navegador no se pierde: se sube en la
          primera sincronización.
        </p>

        {mode === 'up' && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Correo</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Contraseña</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
          {mode === 'up' && <span className="text-[11px] text-muted/70">Mínimo 8 caracteres.</span>}
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent disabled:opacity-40"
          >
            {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in')
              setError(null)
            }}
            className="text-xs text-muted hover:text-white"
          >
            {mode === 'in' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
