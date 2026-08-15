import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, getBlob } from '@magic/cards'
import {
  CARD_VARIANTS,
  CARD_VARIANT_LABELS,
  FRAME_COLORS,
  type Adventure,
  type CardVariant,
  type FrameColor,
  type PlaneswalkerAbility,
  type ProxyDesign,
  type SagaChapter,
  type ProxyFile,
} from '@magic/shared'
import { CardPreview } from '../components/CardPreview.js'
import { ProxyPrintDialog } from '../components/ProxyPrintDialog.js'
import { RichTextField } from '../components/RichTextField.js'
import { buildPdf, downloadPdf } from '../print/pdf.js'
import { renderProxyToPng } from '../print/render-for-print.js'
import { createBackFace, deleteProxy, newId, removeBackFace, useProxy } from '../lib/db-hooks.js'
import { useConfirmLeave } from '../lib/use-confirm-leave.js'

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

  // Borrador local: nada de esto toca IndexedDB hasta que se pulsa «Guardar».
  // Sin esto, cada tecla se guardaba sola y no había forma de descartar un
  // cambio a medias.
  const [draft, setDraft] = useState<ProxyDesign | undefined>(design)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    // Sólo se resincroniza al cargar el proxy o al cambiar de proxy — nunca
    // mientras hay cambios sin guardar, para no pisar lo que se está editando.
    if (design && (!draft || draft.id !== design.id)) {
      setDraft(design)
      setDirty(false)
    }
  }, [design, draft])

  const goBack = useConfirmLeave(dirty)

  if (draft === undefined) return <p className="text-sm text-muted">Cargando…</p>

  const update = (changes: Partial<ProxyDesign>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current))
    setDirty(true)
  }

  const setText = (key: keyof ProxyDesign['text'], value: string) =>
    update({ text: { ...draft.text, [key]: value } })

  const setFlag = (key: keyof ProxyDesign['flags'], value: boolean) =>
    update({ flags: { ...draft.flags, [key]: value } })

  const setAbility = (index: number, changes: Partial<PlaneswalkerAbility>) =>
    update({
      abilities: draft.abilities.map((a, i) => (i === index ? { ...a, ...changes } : a)),
    })

  const addAbility = () =>
    update({ abilities: [...draft.abilities, { cost: '+1', text: '' }] })

  const removeAbility = (index: number) =>
    update({ abilities: draft.abilities.filter((_, i) => i !== index) })

  const setAdventure = (changes: Partial<Adventure>) =>
    update({ adventure: draft.adventure ? { ...draft.adventure, ...changes } : draft.adventure })

  const setChapter = (index: number, changes: Partial<SagaChapter>) =>
    update({
      chapters: draft.chapters.map((c, i) => (i === index ? { ...c, ...changes } : c)),
    })

  const addChapter = () =>
    update({ chapters: [...draft.chapters, { chapter: 'I', text: '' }] })

  const removeChapter = (index: number) =>
    update({ chapters: draft.chapters.filter((_, i) => i !== index) })

  /**
   * Marca el proxy como editado: es lo que permite ir por un mazo entero
   * sabiendo qué queda por repasar.
   */
  const commit = async () => {
    if (!dirty) return
    await db.proxies.put({ ...draft, edited: true, updatedAt: Date.now() })
    setDirty(false)
  }

  const uploadArt = async (file: File) => {
    const blobId = newId()
    await db.blobs.put({ id: blobId, blob: file, mime: file.type, createdAt: Date.now() })
    // El encuadre se reinicia: la foto nueva no tiene nada que ver con la anterior.
    update({ art: { blobId, x: 0, y: 0, scale: 1 } })
  }

  /**
   * Añade o quita el dorso ya escriben directamente en Dexie (no pasan por el
   * borrador ni por «Guardar»), así que el cambio se refleja en el borrador a
   * mano y sin marcarlo `dirty`: no hay nada pendiente de guardar por esto.
   */
  const addBackFace = async () => {
    setStatus('Creando el dorso…')
    try {
      const backId = await createBackFace(draft.id)
      setDraft((current) => (current ? { ...current, backFaceId: backId } : current))
      setStatus(null)
      navigate(`/proxies/${backId}`)
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  const removeBack = async () => {
    if (!confirm('¿Quitar y borrar el dorso de esta carta?')) return
    await removeBackFace(draft.id)
    setDraft((current) => (current ? { ...current, backFaceId: null } : current))
  }

  const exportJson = async () => {
    const file: ProxyFile = { version: 1, design: draft }

    if (draft.art.blobId) {
      const blob = await getBlob(draft.art.blobId)
      if (blob) file.artDataUrl = await blobToDataUrl(blob)
    }

    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${draft.text.name || 'proxy'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportPng = async () => {
    setStatus('Renderizando a tamaño de impresión…')
    try {
      const bytes = await renderProxyToPng(draft)
      const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `${draft.text.name || 'proxy'}.png`
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
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-muted hover:text-white"
        >
          ← Atrás
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="text-xs text-amber-300">Cambios sin guardar</span>}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!dirty}
            className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25 disabled:cursor-default disabled:border-edge disabled:bg-transparent disabled:text-muted"
          >
            Guardar
          </button>
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
                void deleteProxy(draft.id).then(() => navigate('/proxies'))
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
          <CardPreview design={draft} onArtChange={(art) => update({ art })} />
          <ArtControls design={draft} onChange={update} onUpload={uploadArt} />
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Texto">
            <Field label="Nombre" value={draft.text.name} onChange={(v) => setText('name', v)} />
            <Field
              label="Coste de maná"
              value={draft.text.mana}
              onChange={(v) => setText('mana', v)}
              hint="Notación de Scryfall: {2}{W}{U}"
            />
            <Field
              label="Etiqueta bajo el nombre"
              value={draft.text.note}
              onChange={(v) => setText('note', v)}
              hint="Sale en una cajita sobre la ilustración. Por ejemplo la carta original, o «PROXY». Vacía no se dibuja."
            />
            <Field label="Tipo" value={draft.text.type} onChange={(v) => setText('type', v)} />
            {(draft.layout === 'card' || draft.layout === 'battle') && (
              <RichTextField
                label="Texto de reglas"
                value={draft.text.oracle}
                onChange={(v) => setText('oracle', v)}
                hint="Un salto de línea por habilidad. Los paréntesis salen en cursiva."
              />
            )}
            {(draft.layout === 'card' || draft.layout === 'battle') && (
              <Field
                label="Ambientación"
                value={draft.text.flavor}
                onChange={(v) => setText('flavor', v)}
                rows={2}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              {draft.layout === 'card' && (
                <Field label="Fuerza/Resistencia" value={draft.text.pt} onChange={(v) => setText('pt', v)} />
              )}
              <Field label="Artista" value={draft.text.artist} onChange={(v) => setText('artist', v)} />
            </div>
            <Field
              label="Línea inferior"
              value={draft.text.info}
              onChange={(v) => setText('info', v)}
              hint="Por ejemplo: M10 · 146 · C"
            />
          </Section>

          <Section title="Marco">
            <Toggle
              label="Planeswalker (lealtad y habilidades)"
              checked={draft.layout === 'planeswalker'}
              onChange={(v) => update({ layout: v ? 'planeswalker' : 'card' })}
            />
            <Toggle
              label="Saga (capítulos numerados)"
              checked={draft.layout === 'saga'}
              onChange={(v) => update({ layout: v ? 'saga' : 'card' })}
            />
            <Toggle
              label="Battle (casillas de defensa)"
              checked={draft.layout === 'battle'}
              onChange={(v) => update({ layout: v ? 'battle' : 'card' })}
            />

            {draft.layout === 'card' && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Variante</span>
                <select
                  value={draft.variant}
                  onChange={(e) => update({ variant: e.target.value as CardVariant })}
                  className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
                >
                  {CARD_VARIANTS.map((v) => (
                    <option key={v} value={v}>
                      {CARD_VARIANT_LABELS[v]}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-muted/70">
                  {draft.variant === 'regular' && 'La carta de siempre, con su borde negro.'}
                  {draft.variant === 'extendedArt' &&
                    'La caja de texto es transparente y se ve la ilustración por detrás.'}
                  {draft.variant === 'borderless' &&
                    'La ilustración llega a los cuatro cantos. Sin corona de legendaria.'}
                </span>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted">Color</span>
                <select
                  value={draft.frameColor}
                  onChange={(e) => update({ frameColor: e.target.value as FrameColor })}
                  className="rounded border border-edge bg-ink px-2 py-1.5 outline-none focus:border-accent"
                >
                  {FRAME_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {FRAME_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>

              {draft.layout === 'card' && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted">Segundo color (híbrida)</span>
                  <select
                    value={draft.secondColor ?? ''}
                    onChange={(e) =>
                      update(
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
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              {draft.layout === 'card' && (
                <>
                  <Toggle
                    label="Legendaria (corona)"
                    checked={draft.flags.legendary}
                    onChange={(v) => setFlag('legendary', v)}
                  />
                  <Toggle
                    label="Nyx"
                    checked={draft.flags.nyx}
                    onChange={(v) => setFlag('nyx', v)}
                  />
                </>
              )}
              <Toggle
                label="Sello de rara"
                checked={draft.flags.stamp}
                onChange={(v) => setFlag('stamp', v)}
              />
              {draft.layout === 'card' && (
                <Toggle
                  label="Caja de F/R"
                  checked={draft.flags.showPt}
                  onChange={(v) => setFlag('showPt', v)}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {draft.layout === 'card' && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-xs text-muted">Símbolo de tierra básica</span>
                  <select
                    value={draft.basicWatermark ?? ''}
                    onChange={(e) =>
                      update(
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
                    {draft.variant === 'fullArtLand'
                      ? 'El círculo de maná de abajo a la izquierda.'
                      : 'La marca de agua grande de la caja de texto.'}
                  </span>
                </label>
              )}

              <Field
                label="Símbolo de expansión (URL)"
                value={draft.setSymbol ?? ''}
                onChange={(v) => update(v.trim() === '' ? { setSymbol: undefined } : { setSymbol: v })}
                hint="Se rellena al crear el proxy desde una carta real."
              />
            </div>
          </Section>

          {!draft.isBackFace && (
            <Section title="Reverso">
              {draft.backFaceId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted">Esta carta tiene dorso (doble cara).</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/proxies/${draft.backFaceId}`)}
                    className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Editar dorso
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeBack()}
                    className="rounded border border-edge px-3 py-1.5 text-sm text-muted hover:border-red-500 hover:text-red-400"
                  >
                    Quitar dorso
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    Cartas de doble cara (Transform): crea el dorso como un proxy aparte,
                    vinculado a este, con cualquier plantilla propia.
                  </p>
                  <button
                    type="button"
                    onClick={() => void addBackFace()}
                    className="self-start rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Añadir dorso
                  </button>
                </div>
              )}
            </Section>
          )}

          {draft.isBackFace && (
            <Section title="Reverso">
              <p className="text-sm text-muted">
                Esta carta ES el dorso de otra. Se gestiona desde el editor del frente.
              </p>
            </Section>
          )}

          {draft.layout === 'planeswalker' && (
            <Section title="Lealtad">
              <Field
                label="Lealtad inicial"
                value={draft.loyalty}
                onChange={(v) => update({ loyalty: v })}
              />

              <div className="flex flex-col gap-2">
                {draft.abilities.map((ability, i) => (
                  <div key={i} className="flex gap-2 rounded border border-edge bg-ink p-2">
                    <input
                      value={ability.cost}
                      onChange={(e) => setAbility(i, { cost: e.target.value })}
                      placeholder="+1"
                      className="h-fit w-14 shrink-0 rounded border border-edge bg-panel px-2 py-1 text-center text-sm outline-none focus:border-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <RichTextField
                        value={ability.text}
                        onChange={(v) => setAbility(i, { text: v })}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAbility(i)}
                      className="h-fit shrink-0 rounded border border-edge px-2 py-1 text-xs text-muted hover:border-red-500 hover:text-red-400"
                    >
                      Borrar
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addAbility}
                className="self-start rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
              >
                Añadir habilidad
              </button>
            </Section>
          )}

          {draft.layout === 'saga' && (
            <Section title="Capítulos">
              <div className="flex flex-col gap-2">
                {draft.chapters.map((chapter, i) => (
                  <div key={i} className="flex gap-2 rounded border border-edge bg-ink p-2">
                    <input
                      value={chapter.chapter}
                      onChange={(e) => setChapter(i, { chapter: e.target.value })}
                      placeholder="I"
                      className="h-fit w-14 shrink-0 rounded border border-edge bg-panel px-2 py-1 text-center text-sm outline-none focus:border-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <RichTextField
                        value={chapter.text}
                        onChange={(v) => setChapter(i, { text: v })}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeChapter(i)}
                      className="h-fit shrink-0 rounded border border-edge px-2 py-1 text-xs text-muted hover:border-red-500 hover:text-red-400"
                    >
                      Borrar
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addChapter}
                className="self-start rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
              >
                Añadir capítulo
              </button>
            </Section>
          )}

          {draft.layout === 'battle' && (
            <Section title="Defensa">
              <Field
                label="Casillas de defensa iniciales"
                value={draft.defense}
                onChange={(v) => update({ defense: v })}
              />
            </Section>
          )}

          <Section title="Aventura">
            <Toggle
              label="Esta carta tiene un hechizo de aventura"
              checked={draft.adventure !== null}
              onChange={(v) =>
                update({
                  adventure: v ? { name: '', mana: '', type: '', oracle: '' } : null,
                })
              }
            />
            {draft.adventure && (
              <>
                <Field
                  label="Nombre"
                  value={draft.adventure.name}
                  onChange={(v) => setAdventure({ name: v })}
                />
                <Field
                  label="Maná"
                  value={draft.adventure.mana}
                  onChange={(v) => setAdventure({ mana: v })}
                  hint="Notación de Scryfall: {1}{R}"
                />
                <Field
                  label="Tipo"
                  value={draft.adventure.type}
                  onChange={(v) => setAdventure({ type: v })}
                />
                <RichTextField
                  label="Texto de reglas"
                  value={draft.adventure.oracle}
                  onChange={(v) => setAdventure({ oracle: v })}
                  compact
                />
              </>
            )}
          </Section>
        </div>
      </div>

      {showPrint && (
        <ProxyPrintDialog designs={[draft]} onClose={() => setShowPrint(false)} />
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

  // `value` viene de una live query a IndexedDB: llega de vuelta de forma
  // asíncrona tras cada guardado. Si el input estuviera controlado
  // directamente por ella, una respuesta que llega mientras se sigue
  // escribiendo pisa el value y el navegador manda el cursor al final. Se
  // guarda un estado local y sólo se resincroniza desde fuera cuando el
  // campo no tiene el foco.
  const [local, setLocal] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setLocal(value)
  }, [value])

  const handleChange = (next: string) => {
    setLocal(next)
    onChange(next)
  }

  const focusProps = {
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
    },
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {rows ? (
        <textarea
          rows={rows}
          value={local}
          onChange={(e) => handleChange(e.target.value)}
          className={shared}
          {...focusProps}
        />
      ) : (
        <input
          value={local}
          onChange={(e) => handleChange(e.target.value)}
          className={shared}
          {...focusProps}
        />
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
