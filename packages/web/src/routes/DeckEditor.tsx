import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { db, getProxy } from '@magic/cards'
import {
  FORMATS,
  FORMAT_LABELS,
  canBeCommander,
  commanderIdentity,
  countBoard,
  deckSize,
  deckStats,
  validateDeck,
  type Board,
  type Card,
  type Deck,
  type DeckEntry,
  type Format,
} from '@magic/shared'
import { cardToDesign } from '@magic/renderer'
import { CardSearch } from '../components/CardSearch.js'
import { CATEGORY_ORDER, Issues, Stats, categoryOf } from '../components/DeckPanels.js'
import { ManaCost } from '../components/ManaCost.js'
import { DecklistIO } from '../components/DecklistIO.js'
import { PrintDialog } from '../components/PrintDialog.js'
import { newId, saveDeck, useCardMap, useDeck } from '../lib/db-hooks.js'

export function DeckEditor() {
  const { id } = useParams<{ id: string }>()
  const deck = useDeck(id)
  const navigate = useNavigate()

  const ids = useMemo(() => deck?.entries.map((e) => e.cardId) ?? [], [deck])
  const { cards, loading } = useCardMap(ids)

  const [showIO, setShowIO] = useState(false)
  const [showPrint, setShowPrint] = useState(false)

  if (deck === undefined) {
    return <p className="text-sm text-muted">Cargando mazo…</p>
  }

  const identity = commanderIdentity(deck, cards)
  const issues = validateDeck(deck, cards)
  const stats = deckStats(deck, cards)
  const proxyCount = deck.entries.filter((e) => e.proxyId).length

  const update = (entries: DeckEntry[]) => void saveDeck({ ...deck, entries })

  const addCard = (card: Card, board: Board = 'main') => {
    const existing = deck.entries.find((e) => e.cardId === card.id && e.board === board)
    if (existing) {
      update(
        deck.entries.map((e) =>
          e === existing ? { ...e, qty: e.qty + 1 } : e,
        ),
      )
      return
    }
    update([...deck.entries, { cardId: card.id, qty: 1, board }])
  }

  const changeQty = (entry: DeckEntry, delta: number) => {
    const qty = entry.qty + delta
    if (qty <= 0) {
      update(deck.entries.filter((e) => e !== entry))
      return
    }
    update(deck.entries.map((e) => (e === entry ? { ...e, qty } : e)))
  }

  const moveTo = (entry: DeckEntry, board: Board) => {
    update(deck.entries.map((e) => (e === entry ? { ...e, board } : e)))
  }

  /** Crea (o reutiliza) el proxy de esta carta y abre el editor. */
  const proxy = async (entry: DeckEntry, card: Card) => {
    // `getProxy` filtra los borrados: si el proxy se borró, se hace otro.
    if (entry.proxyId && (await getProxy(entry.proxyId))) {
      navigate(`/proxies/${entry.proxyId}`)
      return
    }

    const design = cardToDesign(card, { id: newId(), now: Date.now() })
    await db.proxies.add(design)
    await saveDeck({
      ...deck,
      entries: deck.entries.map((e) => (e === entry ? { ...e, proxyId: design.id } : e)),
    })
    navigate(`/proxies/${design.id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <input
          value={deck.name}
          onChange={(e) => void saveDeck({ ...deck, name: e.target.value })}
          className="min-w-48 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-xl font-semibold tracking-tight outline-none hover:border-edge focus:border-accent"
        />
        <select
          value={deck.format}
          onChange={(e) => void saveDeck({ ...deck, format: e.target.value as Format })}
          className="rounded border border-edge bg-panel px-2 py-1.5 text-sm outline-none focus:border-accent"
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowIO(true)}
          className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
        >
          Importar / exportar
        </button>
        <Link
          to={`/decks/${deck.id}/proxies`}
          className="rounded border border-edge bg-panel px-3 py-1.5 text-sm hover:border-accent"
        >
          Proxies{proxyCount > 0 ? ` (${proxyCount})` : ''}
        </Link>
        <button
          type="button"
          onClick={() => setShowPrint(true)}
          className="rounded border border-accent bg-accent/15 px-3 py-1.5 text-sm text-accent hover:bg-accent/25"
        >
          Imprimir
        </button>
      </header>

      <p className="text-sm text-muted">
        {deckSize(deck)} cartas
        {countBoard(deck, 'side') > 0 ? ` · ${countBoard(deck, 'side')} de banda` : ''}
        {loading ? ' · cargando datos de cartas…' : ''}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <CardSearch
            onPick={(card) =>
              addCard(
                card,
                // En Commander, la primera criatura legendaria que añades va a la
                // zona de mando: es lo que uno quiere el 99% de las veces.
                deck.format === 'commander' &&
                  countBoard(deck, 'command') === 0 &&
                  canBeCommander(card)
                  ? 'command'
                  : 'main',
              )
            }
            {...(deck.format !== 'casual' ? { format: deck.format } : {})}
            {...(deck.format === 'commander' && identity.length > 0 ? { identity } : {})}
          />

          <DeckBoard
            label="Zona de mando"
            board="command"
            deck={deck}
            cards={cards}
            onQty={changeQty}
            onMove={moveTo}
            onProxy={proxy}
            hideIfEmpty
          />
          <DeckBoard
            label="Mazo"
            board="main"
            deck={deck}
            cards={cards}
            onQty={changeQty}
            onMove={moveTo}
            onProxy={proxy}
          />
          <DeckBoard
            label="Banda"
            board="side"
            deck={deck}
            cards={cards}
            onQty={changeQty}
            onMove={moveTo}
            onProxy={proxy}
            hideIfEmpty
          />
        </div>

        <aside className="flex flex-col gap-4">
          <Issues issues={issues} />
          <Stats stats={stats} />
        </aside>
      </div>

      {showIO && <DecklistIO deck={deck} cards={cards} onClose={() => setShowIO(false)} />}
      {showPrint && (
        <PrintDialog deck={deck} cards={cards} onClose={() => setShowPrint(false)} />
      )}
    </div>
  )
}

interface DeckBoardProps {
  label: string
  board: Board
  deck: Deck
  cards: Map<string, Card>
  onQty: (entry: DeckEntry, delta: number) => void
  onMove: (entry: DeckEntry, board: Board) => void
  onProxy: (entry: DeckEntry, card: Card) => void
  hideIfEmpty?: boolean
}

/** Una zona del mazo, con las cartas agrupadas por tipo. */
function DeckBoard({
  label,
  board,
  deck,
  cards,
  onQty,
  onMove,
  onProxy,
  hideIfEmpty,
}: DeckBoardProps) {
  const entries = deck.entries.filter((e) => e.board === board)
  if (entries.length === 0 && hideIfEmpty) return null

  const groups = new Map<string, DeckEntry[]>()
  for (const entry of entries) {
    const category = categoryOf(cards.get(entry.cardId))
    const list = groups.get(category)
    if (list) list.push(entry)
    else groups.set(category, [entry])
  }

  const total = entries.reduce((sum, e) => sum + e.qty, 0)

  return (
    <section className="rounded border border-edge bg-panel">
      <h2 className="flex justify-between border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{label}</span>
        <span className="tabular">{total}</span>
      </h2>

      {entries.length === 0 && <p className="px-3 py-3 text-sm text-muted">Vacío.</p>}

      {CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => {
        const list = groups.get(category) ?? []
        return (
          <div key={category}>
            <h3 className="px-3 pt-2 text-[11px] uppercase tracking-wide text-muted">
              {category} ({list.reduce((s, e) => s + e.qty, 0)})
            </h3>
            <ul className="divide-y divide-edge/60">
              {list.map((entry) => (
                <DeckRow
                  key={`${entry.cardId}-${entry.board}`}
                  entry={entry}
                  card={cards.get(entry.cardId)}
                  onQty={onQty}
                  onMove={onMove}
                  onProxy={onProxy}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

function DeckRow({
  entry,
  card,
  onQty,
  onMove,
  onProxy,
}: {
  entry: DeckEntry
  card: Card | undefined
  onQty: (entry: DeckEntry, delta: number) => void
  onMove: (entry: DeckEntry, board: Board) => void
  onProxy: (entry: DeckEntry, card: Card) => void
}) {
  const boards: { board: Board; label: string }[] = [
    { board: 'main', label: 'mazo' },
    { board: 'side', label: 'banda' },
    { board: 'command', label: 'mando' },
  ]

  return (
    <li className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-edge/40">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onQty(entry, -1)}
          className="size-5 rounded border border-edge text-xs text-muted hover:border-accent hover:text-white"
          aria-label="Quitar una"
        >
          −
        </button>
        <span className="tabular w-6 text-center">{entry.qty}</span>
        <button
          type="button"
          onClick={() => onQty(entry, 1)}
          className="size-5 rounded border border-edge text-xs text-muted hover:border-accent hover:text-white"
          aria-label="Añadir una"
        >
          +
        </button>
      </div>

      <span className="min-w-0 flex-1 truncate" title={card?.type_line}>
        {card?.name ?? entry.cardId}
      </span>

      {entry.proxyId && (
        <Link
          to={`/proxies/${entry.proxyId}`}
          className="shrink-0 rounded border border-accent/50 px-1.5 text-[10px] text-accent"
          title="Tiene un proxy"
        >
          proxy
        </Link>
      )}

      <ManaCost cost={card?.mana_cost} />

      <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
        {boards
          .filter((b) => b.board !== entry.board)
          .map((b) => (
            <button
              key={b.board}
              type="button"
              onClick={() => onMove(entry, b.board)}
              className="rounded border border-edge px-1.5 text-[10px] text-muted hover:border-accent hover:text-white"
            >
              → {b.label}
            </button>
          ))}
        {card && (
          <button
            type="button"
            onClick={() => onProxy(entry, card)}
            className="rounded border border-edge px-1.5 text-[10px] text-muted hover:border-accent hover:text-white"
          >
            proxear
          </button>
        )}
      </span>
    </li>
  )
}
