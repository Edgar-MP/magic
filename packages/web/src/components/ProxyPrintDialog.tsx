import { useState } from 'react'
import { getProxy } from '@magic/cards'
import type { ProxyDesign } from '@magic/shared'
import { Modal } from './Modal.js'
import { BackOptions, NO_BACK, resolveBack, type BackChoice } from './BackOptions.js'
import { buildPdf, downloadPdf, type PageSize } from '../print/pdf.js'
import { renderFlipToPng, renderProxyToPng, renderSplitToPng } from '../print/render-for-print.js'

/**
 * Imprime una selección de proxies. Con una sola carta ofrece llenar la hoja con
 * copias, que es lo que uno quiere al hacer tierras o un token.
 */
export function ProxyPrintDialog({
  designs,
  onClose,
}: {
  designs: ProxyDesign[]
  onClose: () => void
}) {
  const single = designs.length === 1

  const [pageSize, setPageSize] = useState<PageSize>('a4')
  const [cutMarks, setCutMarks] = useState(true)
  const [copies, setCopies] = useState(single ? 9 : 1)
  const [back, setBack] = useState<BackChoice>(NO_BACK)
  const [status, setStatus] = useState<string | null>(null)

  const total = designs.length * copies

  const generate = async () => {
    setStatus('Renderizando…')
    try {
      const cards = []
      for (const [index, design] of designs.entries()) {
        setStatus(`Renderizando… ${index + 1}/${designs.length}`)

        if (design.splitPartnerId) {
          // Split: una sola posición en la rejilla con las dos mitades ya
          // compuestas, no dos cartas sueltas.
          const partner = await getProxy(design.splitPartnerId)
          cards.push({
            bytes: partner
              ? await renderSplitToPng(design, partner)
              : await renderProxyToPng(design),
            type: 'png' as const,
            qty: copies,
          })
          continue
        }

        if (design.flipPartnerId) {
          // Flip: una sola posición en la rejilla con las dos caras ya
          // compuestas, no dos cartas sueltas.
          const partner = await getProxy(design.flipPartnerId)
          cards.push({
            bytes: partner ? await renderFlipToPng(design, partner) : await renderProxyToPng(design),
            type: 'png' as const,
            qty: copies,
          })
          continue
        }

        cards.push({ bytes: await renderProxyToPng(design), type: 'png' as const, qty: copies })

        // Doble cara: el dorso se imprime justo detrás, como una carta más de
        // la rejilla (no se resuelve aquí el doblado físico exacto, sólo que
        // ambas caras salgan y quede claro cuál es cuál).
        if (design.backFaceId) {
          const back = await getProxy(design.backFaceId)
          if (back) {
            cards.push({ bytes: await renderProxyToPng(back), type: 'png' as const, qty: copies })
          }
        }
      }

      setStatus('Montando el PDF…')
      const resolved = await resolveBack(back)
      const pdf = await buildPdf(cards, {
        pageSize,
        cutMarks,
        ...(resolved ? { back: resolved } : {}),
      })

      const name = single ? (designs[0]?.text.name || 'proxy') : 'proxies'
      downloadPdf(pdf, `${name}.pdf`)
      setStatus(`Listo: ${total} cartas.`)
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  return (
    <Modal title={single ? 'Imprimir la carta' : `Imprimir ${designs.length} proxies`} onClose={onClose}>
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
            Copias de cada carta
            <input
              type="number"
              min={1}
              max={99}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Number(e.target.value)))}
              className="tabular w-16 rounded border border-edge bg-ink px-2 py-1 text-center outline-none focus:border-accent"
            />
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cutMarks}
              onChange={(e) => setCutMarks(e.target.checked)}
            />
            Marcas de corte
          </label>
        </div>

        <BackOptions value={back} onChange={setBack} />

        <p className="text-sm">
          {total} cartas · {Math.ceil(total / 9)} hojas de cartas
          {back.mode === 'duplex' ? ' + otras tantas de reversos' : ''}
          {back.mode === 'single' ? ' + 1 de reversos' : ''}
        </p>

        <button
          type="button"
          onClick={() => void generate()}
          className="self-start rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25"
        >
          Generar PDF
        </button>

        {status && <p className="text-sm text-amber-300">{status}</p>}
      </div>
    </Modal>
  )
}
