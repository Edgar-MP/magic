import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db, scryfall } from '@magic/cards'
import { cardToDesign } from '@magic/renderer'
import { proxyFileSchema, type ProxyDesign } from '@magic/shared'
import { CardSearch } from '../components/CardSearch.js'
import { CardPreview } from '../components/CardPreview.js'
import { ProxyPrintDialog } from '../components/ProxyPrintDialog.js'
import { deleteProxy, newId, useProxies } from '../lib/db-hooks.js'

export function Proxies() {
  const proxies = useProxies()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  const create = async (cardId: string) => {
    const card = await scryfall.byId(cardId)
    if (!card) return
    const design = cardToDesign(card, { id: newId(), now: Date.now() })
    // El símbolo de expansión hay que pedirlo aparte: no viene en la carta.
    const icon = await scryfall.setIcon(card.set).catch(() => undefined)
    if (icon) design.setSymbol = icon
    await db.proxies.add(design)
    navigate(`/proxies/${design.id}`)
  }

  const blank = async () => {
    const now = Date.now()
    const design: ProxyDesign = {
      id: newId(),
      layout: 'card',
      frameSet: 'm15',
      variant: 'regular',
      edited: false,
      frameColor: 'colorless',
      flags: { legendary: false, nyx: false, stamp: false, showPt: false },
      art: { x: 0, y: 0, scale: 1 },
      text: {
        name: 'Carta nueva',
        mana: '',
        type: 'Artefacto',
        oracle: '',
        flavor: '',
        note: '',
        pt: '',
        artist: '',
        info: '',
      },
      loyalty: '',
      abilities: [],
      chapters: [],
      levels: [],
      defense: '',
      backFaceId: null,
      isBackFace: false,
      adventure: null,
      createdAt: now,
      updatedAt: now,
    }
    await db.proxies.add(design)
    navigate(`/proxies/${design.id}`)
  }

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const importFile = async (file: File) => {
    try {
      const parsed = proxyFileSchema.parse(JSON.parse(await file.text()))
      const design = { ...parsed.design, id: newId(), updatedAt: Date.now() }

      if (parsed.artDataUrl) {
        const blob = await (await fetch(parsed.artDataUrl)).blob()
        const blobId = newId()
        await db.blobs.put({ id: blobId, blob, mime: blob.type, createdAt: Date.now() })
        design.art = { ...design.art, blobId }
      }

      await db.proxies.add(design)
      navigate(`/proxies/${design.id}`)
    } catch (error) {
      setStatus(`No se ha podido importar: ${(error as Error).message}`)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Proxies</h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Busca la carta original y se rellena todo: marco, nombre, tipo, texto y coste. Después le
          cambias la ilustración.
        </p>
        <CardSearch onPick={(card) => void create(card.id)} placeholder="Carta a proxear…" />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void blank()}
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
          >
            Carta en blanco
          </button>

          <label className="cursor-pointer rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent">
            Importar .json
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importFile(file)
              }}
            />
          </label>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setShowPrint(true)}
              className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
            >
              Imprimir {selected.size} en PDF
            </button>
          )}
        </div>

        {status && <p className="text-sm text-amber-300">{status}</p>}
      </div>

      {proxies?.length === 0 && <p className="text-sm text-muted">Todavía no hay proxies.</p>}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {proxies?.map((design) => (
          <li key={design.id} className="flex flex-col gap-2">
            <Link to={`/proxies/${design.id}`} className="relative block">
              <CardPreview design={design} width={320} />
              {design.backFaceId && (
                <span
                  title="Doble cara: tiene dorso"
                  className="absolute right-1.5 top-1.5 rounded border border-accent bg-ink/80 px-1.5 py-0.5 text-[10px] text-accent"
                >
                  ⟲ dorso
                </span>
              )}
            </Link>
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex min-w-0 items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selected.has(design.id)}
                  onChange={() => toggle(design.id)}
                />
                <span className="truncate">{design.text.name || 'Sin nombre'}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Borrar «${design.text.name}»?`)) void deleteProxy(design.id)
                }}
                className="shrink-0 text-muted hover:text-red-400"
              >
                borrar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showPrint && (
        <ProxyPrintDialog
          designs={(proxies ?? []).filter((p) => selected.has(p.id))}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  )
}
