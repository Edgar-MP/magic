import { useState } from 'react'
import { countBoard, type Card, type Deck } from '@magic/shared'
import { Modal } from './Modal.js'
import { BackOptions, NO_BACK, resolveBack, type BackChoice } from './BackOptions.js'
import { buildPdf, downloadPdf, type PageSize } from '../print/pdf.js'
import { renderDeckForPrint } from '../print/render-for-print.js'

/** Cuántas hojas salen: las de cartas más las de reversos según el modo. */
function sheetCount(total: number, mode: BackChoice['mode']): number {
  const fronts = Math.ceil(total / 9)
  if (mode === 'duplex') return fronts * 2
  if (mode === 'single') return fronts + 1
  return fronts
}

/** Genera el PDF del mazo, mezclando cartas oficiales y proxies. */
export function PrintDialog({
  deck,
  cards,
  onClose,
}: {
  deck: Deck
  cards: Map<string, Card>
  onClose: () => void
}) {
  const [pageSize, setPageSize] = useState<PageSize>('a4')
  const [cutMarks, setCutMarks] = useState(true)
  const [includeSideboard, setIncludeSideboard] = useState(false)
  const [back, setBack] = useState<BackChoice>(NO_BACK)
  const [progress, setProgress] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ name: string; reason: string }[]>([])

  const total =
    countBoard(deck, 'main') +
    countBoard(deck, 'command') +
    (includeSideboard ? countBoard(deck, 'side') : 0)

  const generate = async () => {
    setFailed([])
    setProgress('Preparando cartas…')

    try {
      const { cards: printable, failed: problems } = await renderDeckForPrint(deck, cards, {
        includeSideboard,
        onProgress: (done, count) => setProgress(`Preparando cartas… ${done}/${count}`),
      })
      setFailed(problems)

      if (printable.length === 0) {
        setProgress('No hay ninguna carta que imprimir.')
        return
      }

      setProgress('Montando el PDF…')
      const resolved = await resolveBack(back)
      const pdf = await buildPdf(printable, {
        pageSize,
        cutMarks,
        ...(resolved ? { back: resolved } : {}),
      })
      downloadPdf(pdf, `${deck.name}.pdf`)
      setProgress(`Listo: ${total} cartas.`)
    } catch (error) {
      setProgress(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <Modal title="Imprimir el mazo" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Nueve cartas por hoja a 63 × 88 mm. Al imprimir, pon la escala al 100 % y desactiva
          «ajustar a la página», o saldrán del tamaño equivocado.
        </p>

        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            Tamaño de hoja
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSize)}
              className="rounded border border-edge bg-ink px-2 py-1 outline-none focus:border-accent"
            >
              <option value="a4">A4</option>
              <option value="letter">Carta (Letter)</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cutMarks}
              onChange={(e) => setCutMarks(e.target.checked)}
            />
            Marcas de corte
          </label>

          {countBoard(deck, 'side') > 0 && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeSideboard}
                onChange={(e) => setIncludeSideboard(e.target.checked)}
              />
              Incluir la banda ({countBoard(deck, 'side')} cartas)
            </label>
          )}
        </div>

        <BackOptions value={back} onChange={setBack} />

        <p className="text-sm">
          {total} cartas · {sheetCount(total, back.mode)} hojas
        </p>

        <button
          type="button"
          onClick={() => void generate()}
          className="self-start rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25"
        >
          Generar PDF
        </button>

        {progress && <p className="text-sm text-amber-300">{progress}</p>}

        {failed.length > 0 && (
          <div className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            <p className="mb-1">No se han podido preparar {failed.length}:</p>
            <ul className="max-h-32 overflow-y-auto text-xs">
              {failed.map((f, i) => (
                <li key={i}>
                  {f.name}: {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
