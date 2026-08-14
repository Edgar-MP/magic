import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db, scryfall } from '@magic/cards'
import { cardToDesign } from '@magic/renderer'
import type { Card, DeckEntry, ProxyDesign } from '@magic/shared'
import { useLiveQuery } from 'dexie-react-hooks'
import { CardPreview } from '../components/CardPreview.js'
import { ProxyPrintDialog } from '../components/ProxyPrintDialog.js'
import { newId, saveDeck, useCardMap, useDeck } from '../lib/db-hooks.js'

/**
 * Todos los proxies de un mazo en una cuadrícula: crear los que falten de golpe,
 * ver de un vistazo cuáles quedan por retocar y entrar a editarlos uno a uno.
 *
 * El flujo pensado es: importas una lista, pulsas «crear los que falten» y vas
 * cambiando ilustraciones hasta que el contador dice que están todas.
 */
export function DeckProxies() {
  const { id } = useParams<{ id: string }>()
  const deck = useDeck(id)

  const ids = useMemo(() => deck?.entries.map((e) => e.cardId) ?? [], [deck])
  const { cards } = useCardMap(ids)

  const proxyIds = useMemo(
    () => deck?.entries.map((e) => e.proxyId).filter((p): p is string => !!p) ?? [],
    [deck],
  )
  const proxies = useLiveQuery(
    async () => {
      const rows = await db.proxies.bulkGet(proxyIds)
      return new Map(rows.filter((r): r is ProxyDesign => !!r).map((r) => [r.id, r]))
    },
    [proxyIds.join(',')],
    new Map<string, ProxyDesign>(),
  )

  const [busy, setBusy] = useState<string | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const [onlyPending, setOnlyPending] = useState(false)

  if (deck === undefined) return <p className="text-sm text-muted">Cargando mazo…</p>

  // La banda no se proxea: no se juega con ella en la mesa.
  const entries = deck.entries.filter((e) => e.board !== 'side')

  const withProxy = entries.filter((e) => e.proxyId && proxies.has(e.proxyId))
  const edited = withProxy.filter((e) => proxies.get(e.proxyId ?? '')?.edited)
  const missing = entries.filter((e) => !e.proxyId || !proxies.has(e.proxyId))

  /** Crea el proxy de cada carta que aún no lo tenga, en un solo paso. */
  const createMissing = async () => {
    setBusy(`Creando ${missing.length} proxies…`)
    try {
      const now = Date.now()
      const created: Record<string, string> = {}
      const icons = new Map<string, string | undefined>()

      for (const [index, entry] of missing.entries()) {
        const card = cards.get(entry.cardId)
        if (!card) continue
        setBusy(`Creando proxies… ${index + 1}/${missing.length}`)

        // El símbolo de expansión se pide una vez por set, no por carta.
        if (!icons.has(card.set)) {
          icons.set(card.set, await scryfall.setIcon(card.set).catch(() => undefined))
        }

        const design = cardToDesign(card, { id: newId(), now })
        const icon = icons.get(card.set)
        if (icon) design.setSymbol = icon

        await db.proxies.add(design)
        created[entry.cardId] = design.id
      }

      await saveDeck({
        ...deck,
        entries: deck.entries.map((entry) =>
          created[entry.cardId] && !entry.proxyId
            ? { ...entry, proxyId: created[entry.cardId] }
            : entry,
        ),
      })
      setBusy(null)
    } catch (error) {
      setBusy(`Error: ${(error as Error).message}`)
    }
  }

  const visible = onlyPending
    ? entries.filter((e) => !e.proxyId || !proxies.get(e.proxyId)?.edited)
    : entries

  const selected = withProxy
    .map((e) => proxies.get(e.proxyId ?? ''))
    .filter((p): p is ProxyDesign => !!p)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/decks/${deck.id}`} className="text-sm text-muted hover:text-white">
            ← {deck.name}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Proxies del mazo</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => void createMissing()}
              className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
            >
              Crear los {missing.length} que faltan
            </button>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPrint(true)}
              className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
            >
              Imprimir los proxies
            </button>
          )}
        </div>
      </header>

      <Progress
        total={entries.length}
        withProxy={withProxy.length}
        edited={edited.length}
      />

      {busy && <p className="text-sm text-amber-300">{busy}</p>}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={onlyPending}
          onChange={(e) => setOnlyPending(e.target.checked)}
        />
        Ver sólo las que quedan por editar
      </label>

      {visible.length === 0 && (
        <p className="text-sm text-muted">
          {onlyPending ? 'No queda ninguna por editar.' : 'El mazo está vacío.'}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((entry) => (
          <ProxyCell
            key={`${entry.cardId}-${entry.board}`}
            entry={entry}
            card={cards.get(entry.cardId)}
            design={entry.proxyId ? proxies.get(entry.proxyId) : undefined}
          />
        ))}
      </ul>

      {showPrint && (
        <ProxyPrintDialog designs={selected} onClose={() => setShowPrint(false)} />
      )}
    </div>
  )
}

/** Barra con cuántas cartas tienen proxy y cuántas están ya retocadas. */
function Progress({
  total,
  withProxy,
  edited,
}: {
  total: number
  withProxy: number
  edited: number
}) {
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100)

  return (
    <div className="flex flex-col gap-2 rounded border border-edge bg-panel p-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <span>
          <strong className="tabular">{edited}</strong> de{' '}
          <strong className="tabular">{total}</strong> editadas
        </span>
        <span className="text-muted">
          {withProxy} con proxy · {total - withProxy} sin crear
        </span>
      </div>

      {/* Dos capas: el total con proxy en tenue y las editadas en acento. */}
      <div className="relative h-2 overflow-hidden rounded bg-edge">
        <div className="absolute inset-y-0 left-0 bg-accent/30" style={{ width: `${pct(withProxy)}%` }} />
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct(edited)}%` }} />
      </div>
    </div>
  )
}

function ProxyCell({
  entry,
  card,
  design,
}: {
  entry: DeckEntry
  card: Card | undefined
  design: ProxyDesign | undefined
}) {
  const name = card?.name ?? entry.cardId

  return (
    <li className="flex flex-col gap-2">
      {design ? (
        <Link to={`/proxies/${design.id}`} className="block">
          <CardPreview design={design} width={320} />
        </Link>
      ) : (
        <div className="flex aspect-[63/88] items-center justify-center rounded-xl border border-dashed border-edge px-2 text-center text-xs text-muted">
          Sin proxy
        </div>
      )}

      <div className="flex items-start justify-between gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate" title={name}>
          {entry.qty > 1 && <span className="tabular text-muted">{entry.qty}× </span>}
          {name}
        </span>
        {design &&
          (design.edited ? (
            <span className="shrink-0 rounded border border-green-700/60 px-1.5 text-[10px] text-green-400">
              editada
            </span>
          ) : (
            <span className="shrink-0 rounded border border-edge px-1.5 text-[10px] text-muted">
              sin tocar
            </span>
          ))}
      </div>
    </li>
  )
}
