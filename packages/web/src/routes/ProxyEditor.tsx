import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db, getBlob } from '@magic/cards'
import {
  CARD_VARIANTS,
  CARD_VARIANT_LABELS,
  FRAME_COLORS,
  type CardVariant,
  type FrameColor,
  type ProxyDesign,
  type ProxyFile,
} from '@magic/shared'
import { CardPreview } from '../components/CardPreview.js'
import { ProxyPrintDialog } from '../components/ProxyPrintDialog.js'
import { buildPdf, downloadPdf } from '../print/pdf.js'
import { renderProxyToPng } from '../print/render-for-print.js'
import { newId, useProxy } from '../lib/db-hooks.js'

type BasicSymbol = NonNullable<ProxyDesign['basicWatermark']>

/** Los cinco básicos más Yermos, con el nombre de la tierra que los lleva. */
const BASIC_SYMBOLS: [BasicSymbol, string][] = [
  ['w', 'Llanura (blanco)'],
  ['u', 'Isla (azul)'],
  ['b', 'Pantano (negro)'],
  ['r', 'Montaña (rojo)'],
  ['g', 'Bosque (verde)'],
  ['c', 'Yermos (incoloro)'],
]

const FRAME_LABELS: Record<FrameColor, string> = {
  white: 'Blanco',
  blue: 'Azul',
  black: 'Negro',
  red: 'Rojo',
  green: 'Verde',
  gold: 'Oro (multicolor)',
  colorless: 'Incoloro',
  artifact: 'Artefacto',
  vehicle: 'Vehículo',
  whiteLand: 'Tierra blanca',
  blueLand: 'Tierra azul',
  blackLand: 'Tierra negra',
  redLand: 'Tierra roja',
  greenLand: 'Tierra verde',
  goldLand: 'Tierra multicolor',
  colorlessLand: 'Tierra incolora',
}

export function ProxyEditor() {
  const { id } = useParams<{ id: string }>()
  const design = useProxy(id)
  const navigate = useNavigate()
  const [status, setStatus] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)

  if (design === undefined) return <p className="text-sm text-muted">Cargando…</p>

  /**
   * Cualquier cambio desde aquí marca el proxy como editado: es lo que permite
   * ir por un mazo entero sabiendo qué queda por repasar.
   */
  const save = (changes: Partial<ProxyDesign>) =>
    void db.proxies.put({ ...design, ...changes, edited: true, updatedAt: Date.now() })

  const setText = (key: keyof ProxyDesign['text'], value: string) =>
    save({ text: { ...design.text, [key]: value } })

  const setFlag = (key: keyof ProxyDesign['flags'], value: boolean) =>
    save({ flags: { ...design.flags, [key]: value } })

  const uploadArt = async (file: File) => {
    const blobId = newId()
    await db.blobs.put({ id: blobId, blob: file, mime: file.type, createdAt: Date.now() })
    // El encuadre se reinicia: la foto nueva no tiene nada que ver con la anterior.
    save({ art: { blobId, x: 0, y: 0, scale: 1 } })
  }

  const exportJson = async () => {
    const file: ProxyFile = { version: 1, design }

    if (design.art.blobId) {
      const blob = await getBlob(design.art.blobId)
      if (blob) file.artDataUrl = await blobToDataUrl(blob)
    }

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${design.text.name || 'proxy'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportPng = async () => {
    setStatus('Renderizando a tamaño de impresión…')
    try {
      const bytes = await renderProxyToPng(design)
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${design.text.name || 'proxy'}.png`
      link.click()
      URL.revokeObjectURL(url)
      setStatus('Listo.')
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <Link to="/proxies" className="text-sm text-muted hover:text-white">
          ← Proxies
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportPng()}
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={() => void exportJson()}
            className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
          >
            .json
          </button>
          <button
            type="button"
            onClick={() => setShowPrint(true)}
            className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Borrar este proxy?')) {
                void db.proxies.delete(design.id).then(() => navigate('/proxies'))
              }
            }}
            className="rounded border border-edge px-3 py-1.5 text-sm text-muted hover:border-red-500 hover:text-red-400"
          >
            Borrar
          </button>
        </div>
      </header>

      {status && <p className="text-sm text-amber-300">{status}</p>}

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <div className="flex flex-col gap-3">
          <CardPreview design={design} onArtChange={(art) => save({ art })} />
          <ArtControls design={design} onChange={save} onUpload={uploadArt} />
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Texto">
            <Field label="Nombre" value={design.text.name} onChange={(v) => setText('name', v)} />
            <Field
              label="Coste de maná"
              value={design.text.mana}
              onChange={(v) => setText('mana', v)}
              hint="Notación de Scryfall: {2}{W}{U}"
            />
            <Field
              label="Etiqueta bajo el nombre"
              value={design.text.note}
              onChange={(v) => setText('note', v)}
              hint="Sale en una cajita sobre la ilustración. Por ejemplo la carta original, o «PROXY». Vacía no se dibuja."
            />
            <Field label="Tipo" value={design.text.type} onChange={(v) => setText('type', v)} />
            <Field
              label="Texto de reglas"
              value={design.text.oracle}
              onChange={(v) => setText('oracle', v)}
              rows={5}
              hint="Un salto de línea por habilidad. Los paréntesis salen en cursiva."
            />
            <Field
              label="Ambientación"
              value={design.text.flavor}
              onChange={(v) => setText('flavor', v)}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fuerza/Resistencia" value={design.text.pt} onChange={(v) => setText('pt', v)} />
              <Field label="Artista" value={design.text.artist} onChange={(v) => setText('artist', v)} />
            </div>
            <Field
              label="Línea inferior"
              value={design.text.info}
              onChange={(v) => setText('info', v)}
              hint="Por ejemplo: M10 · 146 · C"
            />
          </Section>

          <Section title="Marco">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">Variante</span>
              <select
                value={design.variant}
                onChange={(e) => save({ variant: e.target.value as CardVariant })}
                className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
              >
                {CARD_VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {CARD_VARIANT_LABELS[v]}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted/70">
                {design.variant === 'regular' && 'La carta de siempre, con su borde negro.'}
                {design.variant === 'extendedArt' &&
                  'La caja de texto es transparente y se ve la ilustración por detrás.'}
                {design.variant === 'borderless' &&
                  'La ilustración llega a los cuatro cantos. Sin corona de legendaria.'}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Color</span>
                <select
                  value={design.frameColor}
                  onChange={(e) => save({ frameColor: e.target.value as FrameColor })}
                  className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
                >
                  {FRAME_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {FRAME_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Segundo color (híbrida)</span>
                <select
                  value={design.secondColor ?? ''}
                  onChange={(e) =>
                    save(
                      e.target.value === ''
                        ? { secondColor: undefined }
                        : { secondColor: e.target.value as FrameColor },
                    )
                  }
                  className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
                >
                  <option value="">Ninguno</option>
                  {FRAME_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {FRAME_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <Toggle
                label="Legendaria (corona)"
                checked={design.flags.legendary}
                onChange={(v) => setFlag('legendary', v)}
              />
              <Toggle
                label="Nyx"
                checked={design.flags.nyx}
                onChange={(v) => setFlag('nyx', v)}
              />
              <Toggle
                label="Sello de rara"
                checked={design.flags.stamp}
                onChange={(v) => setFlag('stamp', v)}
              />
              <Toggle
                label="Caja de F/R"
                checked={design.flags.showPt}
                onChange={(v) => setFlag('showPt', v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Símbolo de tierra básica</span>
                <select
                  value={design.basicWatermark ?? ''}
                  onChange={(e) =>
                    save(
                      e.target.value === ''
                        ? { basicWatermark: undefined }
                        : { basicWatermark: e.target.value as BasicSymbol },
                    )
                  }
                  className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
                >
                  <option value="">Ninguno</option>
                  {BASIC_SYMBOLS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted/70">
                  {design.variant === 'fullArtLand'
                    ? 'El círculo de maná de abajo a la izquierda.'
                    : 'La marca de agua grande de la caja de texto.'}
                </span>
              </label>

              <Field
                label="Símbolo de expansión (URL)"
                value={design.setSymbol ?? ''}
                onChange={(v) => save(v.trim() === '' ? { setSymbol: undefined } : { setSymbol: v })}
                hint="Se rellena al crear el proxy desde una carta real."
              />
            </div>
          </Section>
        </div>
      </div>

      {showPrint && (
        <ProxyPrintDialog designs={[design]} onClose={() => setShowPrint(false)} />
      )}
    </div>
  )
}

/** Subir la ilustración y ajustar el zoom. Mover se hace sobre la propia carta. */
function ArtControls({
  design,
  onChange,
  onUpload,
}: {
  design: ProxyDesign
  onChange: (changes: Partial<ProxyDesign>) => void
  onUpload: (file: File) => Promise<void>
}) {
  const setArt = (changes: Partial<ProxyDesign['art']>) =>
    onChange({ art: { ...design.art, ...changes } })

  return (
    <div className="flex flex-col gap-3 rounded border border-edge bg-panel p-3">
      <label className="cursor-pointer rounded border border-dashed border-edge px-3 py-4 text-center text-sm text-muted hover:border-accent hover:text-white">
        {design.art.blobId ? 'Cambiar ilustración' : 'Elegir ilustración'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void onUpload(file)
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Zoom ({design.art.scale.toFixed(2)}×)
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.01}
          value={design.art.scale}
          onChange={(e) => setArt({ scale: Number(e.target.value) })}
        />
      </label>

      <button
        type="button"
        onClick={() => setArt({ x: 0, y: 0, scale: 1 })}
        className="self-start text-xs text-muted hover:text-white"
      >
        Centrar y ajustar
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded border border-edge bg-panel p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  rows,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
}) {
  const shared =
    'rounded border border-edge bg-ink px-2 py-1.5 text-sm outline-none focus:border-accent'

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {rows ? (
        <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className={shared} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={shared} />
      )}
      {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se ha podido leer la imagen'))
    reader.readAsDataURL(blob)
  })
}
