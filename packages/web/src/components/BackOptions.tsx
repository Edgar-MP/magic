import { useState } from 'react'
import type { BackMode, PrintBack } from '../print/pdf.js'
import { renderBackToPng } from '../print/render-for-print.js'

/** Estado de las opciones de reverso, para reutilizarlo en los dos diálogos. */
export interface BackChoice {
  mode: BackMode
  /** Imagen propia; si no hay, se usa el reverso de Magic. */
  image?: File
}

export const NO_BACK: BackChoice = { mode: 'none' }

/** Prepara el reverso para pasárselo a `buildPdf`, o nada si no se quiere. */
export async function resolveBack(choice: BackChoice): Promise<PrintBack | undefined> {
  if (choice.mode === 'none') return undefined
  return {
    bytes: await renderBackToPng(choice.image),
    type: 'png',
    mode: choice.mode,
  }
}

const MODES: { value: BackMode; label: string; hint: string }[] = [
  { value: 'none', label: 'Sin reverso', hint: 'Sólo las caras de las cartas.' },
  {
    value: 'duplex',
    label: 'A doble cara',
    hint: 'Detrás de cada hoja va su hoja de reversos, espejada. Imprime a doble cara girando por el lado largo.',
  },
  {
    value: 'single',
    label: 'Una hoja de reversos',
    hint: 'Nueve reversos en una hoja aparte, al final, para recortar y pegar.',
  },
]

export function BackOptions({
  value,
  onChange,
}: {
  value: BackChoice
  onChange: (choice: BackChoice) => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const mode = MODES.find((m) => m.value === value.mode)

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        Reverso
        <select
          value={value.mode}
          onChange={(e) => onChange({ ...value, mode: e.target.value as BackMode })}
          className="rounded border border-edge bg-ink px-2 py-1 outline-none focus:border-accent"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {mode && value.mode !== 'none' && (
        <p className="text-xs text-muted">{mode.hint}</p>
      )}

      {value.mode !== 'none' && (
        <div className="flex items-center gap-3">
          <label className="cursor-pointer rounded border border-edge px-3 py-1.5 text-xs hover:border-accent">
            {value.image ? 'Cambiar imagen' : 'Usar una imagen propia'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setPreview(URL.createObjectURL(file))
                onChange({ ...value, image: file })
              }}
            />
          </label>

          {value.image ? (
            <>
              {preview && (
                <img src={preview} alt="Reverso" className="h-12 w-auto rounded border border-edge" />
              )}
              <button
                type="button"
                onClick={() => {
                  setPreview(null)
                  const { image: _drop, ...rest } = value
                  onChange(rest)
                }}
                className="text-xs text-muted hover:text-white"
              >
                usar el de Magic
              </button>
            </>
          ) : (
            <span className="text-xs text-muted">Reverso clásico de Magic.</span>
          )}
        </div>
      )}
    </div>
  )
}
