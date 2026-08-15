import { useState } from 'react'
import type { StoredDeck } from '@magic/cards'
import { useSession } from '../lib/api/authClient.js'
import { newId, saveDeck } from '../lib/db-hooks.js'
import { useSync } from '../lib/use-sync.js'
import { Modal } from './Modal.js'

/**
 * Compartir un mazo por enlace público. El token vive en el propio mazo
 * (`deck.shareToken`) y viaja por la sincronización de siempre: aquí sólo se
 * genera, se guarda y se empuja ya mismo para que el enlace funcione al
 * momento en vez de esperar al próximo ciclo automático.
 */
export function ShareDialog({ deck, onClose }: { deck: StoredDeck; onClose: () => void }) {
  const { data: session } = useSession()
  const { sync } = useSync()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const url = deck.shareToken ? `${location.origin}/share/${deck.shareToken}` : null

  const share = async () => {
    setBusy(true)
    try {
      await saveDeck({ ...deck, shareToken: newId() })
      sync()
    } finally {
      setBusy(false)
    }
  }

  const unshare = async () => {
    setBusy(true)
    try {
      await saveDeck({ ...deck, shareToken: undefined })
      sync()
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const field =
    'flex-1 rounded border border-edge bg-ink px-3 py-2 text-sm outline-none focus:border-accent'
  const button =
    'rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-40'

  return (
    <Modal title="Compartir mazo" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!session && (
          <p className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
            No has iniciado sesión: sin cuenta el mazo no se sube al servidor y el enlace no
            funcionará hasta que inicies sesión y el mazo llegue a sincronizarse.
          </p>
        )}

        {url ? (
          <>
            <p className="text-sm text-muted">
              Cualquiera con este enlace puede ver el mazo (sin poder editarlo) y copiarlo a su
              propia cuenta.
            </p>

            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className={field}
              />
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded border border-edge bg-panel px-3 py-2 text-sm hover:border-accent"
              >
                {copied ? 'Copiado ✓' : 'Copiar'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void unshare()}
              disabled={busy}
              className="self-start rounded border border-edge bg-panel px-4 py-2 text-sm text-muted hover:border-accent hover:text-white disabled:opacity-40"
            >
              Dejar de compartir
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void share()} disabled={busy} className={button}>
            {busy ? 'Un momento…' : 'Compartir'}
          </button>
        )}
      </div>
    </Modal>
  )
}
