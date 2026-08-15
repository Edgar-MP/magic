import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, getBlob, putBlob, type StoredProxy } from '@magic/cards'
import { emptyDeck, type DeckEntry, type Format, type ProxyDesign } from '@magic/shared'
import { CardPreview } from '../components/CardPreview.js'
import { LoginDialog } from '../components/LoginDialog.js'
import { useSession } from '../lib/api/authClient.js'
import { newId } from '../lib/db-hooks.js'

/** Lo que responde `GET /v1/share/:token`. */
interface SharedResponse {
  deck: { name: string; format: string; entries: DeckEntry[] }
  proxies: { id: string; design: ProxyDesign }[]
}

type LoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: SharedResponse }

/**
 * Vista pública de solo lectura de un mazo compartido, y el botón para
 * copiarlo a la cuenta del visitante.
 *
 * Cada proxy copiado es una entidad totalmente independiente: id nuevo, sin
 * vínculo de datos ni de sync con el original. El arte subido (`art.blobId`)
 * se descarga y se guarda local bajo un blobId nuevo; el arte remoto
 * (`art.url`) se deja tal cual porque ya es público.
 */
export function SharedDeck() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { data: session } = useSession()

  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [showLogin, setShowLogin] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  // Cuando se pide copiar sin sesión: abre el login y, en cuanto haya sesión,
  // continúa sola con la copia.
  const [pendingCopy, setPendingCopy] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    void fetch(`/v1/share/${token}`)
      .then(async (response) => {
        if (cancelled) return
        if (response.status === 404) {
          setState({ status: 'not-found' })
          return
        }
        if (!response.ok) {
          setState({ status: 'error', message: `error del servidor (${response.status})` })
          return
        }
        setState({ status: 'ok', data: await response.json() })
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: (e as Error).message })
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const copyToAccount = async () => {
    if (state.status !== 'ok' || !token) return

    if (!session) {
      setPendingCopy(true)
      setShowLogin(true)
      return
    }

    setCopying(true)
    setCopyError(null)
    try {
      const deckId = await copySharedDeck(token, state.data)
      navigate(`/decks/${deckId}`)
    } catch (e) {
      setCopyError(e instanceof Error ? e.message : String(e))
    } finally {
      setCopying(false)
    }
  }

  // En cuanto hay sesión y había una copia pendiente, se continúa sola.
  useEffect(() => {
    if (pendingCopy && session) {
      setPendingCopy(false)
      setShowLogin(false)
      void copyToAccount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCopy, session])

  if (state.status === 'loading') {
    return <p className="text-sm text-muted">Cargando mazo…</p>
  }

  if (state.status === 'not-found') {
    return <p className="text-sm text-muted">Este enlace no existe o ha dejado de compartirse.</p>
  }

  if (state.status === 'error') {
    return <p className="text-sm text-red-400">Error: {state.message}</p>
  }

  const { deck, proxies } = state.data
  const proxyMap = new Map(proxies.map((p) => [p.id, p.design]))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{deck.name}</h1>
        <button
          type="button"
          onClick={() => void copyToAccount()}
          disabled={copying}
          className="rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25 disabled:opacity-40"
        >
          {copying ? 'Copiando…' : 'Copiar a mi cuenta'}
        </button>
      </header>

      {copyError && <p className="text-sm text-red-400">{copyError}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {deck.entries.map((entry, i) => {
          const design = entry.proxyId ? proxyMap.get(entry.proxyId) : undefined
          if (!design) return null
          return (
            <div key={i} className="flex flex-col gap-1">
              <CardPreview design={design} width={220} shareToken={token} />
              <span className="text-center text-xs text-muted">{entry.qty}×</span>
            </div>
          )
        })}
      </div>

      {/*
        `onClose` de `LoginDialog` se llama tanto si cierras a mano como si
        entras/te registras con éxito: no se toca `pendingCopy` aquí, sólo se
        cierra el diálogo. Si de verdad hubo sesión, el efecto de arriba
        continúa la copia solo; si sólo se cerró sin entrar, `pendingCopy`
        se queda a true pero nunca se dispara porque `session` sigue vacía.
      */}
      {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
    </div>
  )
}

/**
 * Copia el mazo compartido a la cuenta local: proxies con id nuevo e
 * independientes (arte propio, vínculos remapeados o rotos), y un mazo nuevo
 * que los referencia.
 */
async function copySharedDeck(token: string, shared: SharedResponse): Promise<string> {
  const now = Date.now()

  // id nuevo por cada proxy compartido, para poder remapear los vínculos
  // (dorso/split/flip) que apunten a otro proxy DEL MISMO mazo compartido.
  const idMap = new Map(shared.proxies.map((p) => [p.id, newId()]))

  const copiedProxies: StoredProxy[] = []
  for (const { id, design } of shared.proxies) {
    const newProxyId = idMap.get(id)
    if (!newProxyId) continue

    let art = design.art
    if (design.art.blobId) {
      // El arte subido se trae del propio enlace compartido (no requiere
      // sesión) y se guarda local bajo un blobId nuevo: nunca apunta al blob
      // del dueño original.
      let blob = await getBlob(design.art.blobId)
      if (!blob) {
        const response = await fetch(`/v1/share/${token}/art/${design.art.blobId}`)
        if (response.ok) blob = await response.blob()
      }
      if (blob) {
        const newBlobId = newId()
        await putBlob(newBlobId, blob)
        art = { ...design.art, blobId: newBlobId }
      } else {
        // No se pudo traer la imagen: mejor un proxy sin arte que uno roto.
        art = { ...design.art, blobId: undefined }
      }
    }

    // El backend sólo carga los proxies referenciados directamente por
    // `entries[].proxyId`: un dorso/mitad/cara enlazado que no sea también una
    // entrada del mazo no llega en `shared.proxies`. El vínculo se remapea si
    // la otra punta SÍ está en este mismo mazo compartido; si no, se rompe en
    // vez de dejarlo apuntando al proxy del dueño original.
    const remap = (linkedId: string | null): string | null => {
      if (!linkedId) return null
      return idMap.get(linkedId) ?? null
    }

    const backFaceId = remap(design.backFaceId)
    const splitPartnerId = remap(design.splitPartnerId)
    const flipPartnerId = remap(design.flipPartnerId)

    copiedProxies.push({
      ...design,
      id: newProxyId,
      art,
      backFaceId,
      isBackFace: design.isBackFace,
      splitPartnerId,
      isSplitPartner: design.isSplitPartner,
      flipPartnerId,
      isFlipPartner: design.isFlipPartner,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (copiedProxies.length > 0) await db.proxies.bulkAdd(copiedProxies)

  const deckId = newId()
  const newDeck = {
    ...emptyDeck(deckId, `${shared.deck.name} (copia)`, shared.deck.format as Format, now),
    entries: shared.deck.entries.map((entry) => ({
      ...entry,
      ...(entry.proxyId ? { proxyId: idMap.get(entry.proxyId) } : {}),
    })),
  }
  await db.decks.add(newDeck)

  return deckId
}
