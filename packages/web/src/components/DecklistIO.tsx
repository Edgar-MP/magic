import { useState } from 'react'
import { resolveDecklist } from '@magic/cards'
import { formatDecklist, parseDecklist, type Card, type Deck } from '@magic/shared'
import { Modal } from './Modal.js'
import { saveDeck } from '../lib/db-hooks.js'

/** Importar y exportar la lista del mazo en texto plano. */
export function DecklistIO({
  deck,
  cards,
  onClose,
}: {
  deck: Deck
  cards: Map<string, Card>
  onClose: () => void
}) {
  const [tab, setTab] = useState<'import' | 'export'>('import')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [replace, setReplace] = useState(true)

  const exported = formatDecklist(
    deck.entries.map((entry) => {
      const card = cards.get(entry.cardId)
      return {
        qty: entry.qty,
        name: card?.printed_name ?? card?.name ?? entry.cardId,
        ...(card ? { set: card.set, ...(card.collector_number ? { collectorNumber: card.collector_number } : {}) } : {}),
        board: entry.board,
      }
    }),
  )

  const doImport = async () => {
    setBusy(true)
    setStatus('Resolviendo nombres en Scryfall…')
    try {
      const parsed = parseDecklist(text, deck.format === 'commander' ? 'main' : 'main')
      const resolved = await resolveDecklist(parsed)

      const entries = replace ? resolved.entries : mergeEntries(deck.entries, resolved.entries)
      await saveDeck({ ...deck, entries })

      const problems = [
        resolved.notFound.length > 0
          ? `${resolved.notFound.length} sin encontrar: ${resolved.notFound
              .slice(0, 5)
              .map((n) => n.name)
              .join(', ')}`
          : '',
        resolved.invalid.length > 0
          ? `${resolved.invalid.length} líneas no entendidas (${resolved.invalid
              .slice(0, 3)
              .map((l) => `línea ${l.line}`)
              .join(', ')})`
          : '',
      ].filter(Boolean)

      setStatus(
        `Importadas ${resolved.entries.length} entradas.${
          problems.length > 0 ? ` ${problems.join('. ')}` : ''
        }`,
      )
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Importar / exportar lista" onClose={onClose}>
      <div className="mb-3 flex gap-1">
        {(
          [
            ['import', 'Importar'],
            ['export', 'Exportar'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === key ? 'bg-edge text-white' : 'text-muted hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'import' ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Acepta los formatos de Arena, MTGO y Moxfield/Archidekt:{' '}
            <code>4 Lightning Bolt (M10) 146</code>, <code>SB: 2 Duress</code>,{' '}
            <code>1 Atraxa *CMDR*</code> y cabeceras como <code>Sideboard</code>.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={'Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring\n…'}
            className="w-full rounded border border-edge bg-ink px-3 py-2 font-mono text-xs outline-none focus:border-accent"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Reemplazar el contenido actual del mazo
          </label>
          <button
            type="button"
            disabled={busy || text.trim() === ''}
            onClick={() => void doImport()}
            className="self-start rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent disabled:opacity-40"
          >
            {busy ? 'Importando…' : 'Importar'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea
            value={exported}
            readOnly
            rows={14}
            className="w-full rounded border border-edge bg-ink px-3 py-2 font-mono text-xs outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(exported)}
              className="rounded border border-edge px-3 py-1.5 text-sm hover:border-accent"
            >
              Copiar
            </button>
            <button
              type="button"
              onClick={() => download(`${deck.name}.txt`, exported)}
              className="rounded border border-edge px-3 py-1.5 text-sm hover:border-accent"
            >
              Descargar .txt
            </button>
          </div>
        </div>
      )}

      {status && <p className="mt-3 text-sm text-amber-300">{status}</p>}
    </Modal>
  )
}

/** Suma las entradas importadas a las que ya había. */
function mergeEntries(current: Deck['entries'], incoming: Deck['entries']): Deck['entries'] {
  const merged = current.map((e) => ({ ...e }))
  for (const entry of incoming) {
    const existing = merged.find((e) => e.cardId === entry.cardId && e.board === entry.board)
    if (existing) existing.qty += entry.qty
    else merged.push({ ...entry })
  }
  return merged
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
