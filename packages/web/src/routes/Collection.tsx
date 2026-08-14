import { useMemo } from 'react'
import { db } from '@magic/cards'
import { CardSearch } from '../components/CardSearch.js'
import { ManaCost } from '../components/ManaCost.js'
import {
  setCollectionQty,
  useCardMap,
  useCollection,
  useDecks,
} from '../lib/db-hooks.js'

/**
 * Qué cartas tienes. El editor de mazos no lo necesita para funcionar, pero
 * saber qué falta es justo lo que decide qué hay que proxear.
 */
export function Collection() {
  const items = useCollection()
  const decks = useDecks()

  const ids = useMemo(() => items?.map((i) => i.cardId) ?? [], [items])
  const { cards } = useCardMap(ids)

  /** Cuántas copias piden todos los mazos juntos, por carta. */
  const wanted = useMemo(() => {
    const counts = new Map<string, number>()
    for (const deck of decks ?? []) {
      for (const entry of deck.entries) {
        counts.set(entry.cardId, Math.max(counts.get(entry.cardId) ?? 0, entry.qty))
      }
    }
    return counts
  }, [decks])

  const missing = useMemo(() => {
    const owned = new Map((items ?? []).map((i) => [i.cardId, i.qty]))
    return [...wanted.entries()]
      .map(([cardId, need]) => ({ cardId, need, have: owned.get(cardId) ?? 0 }))
      .filter((row) => row.have < row.need)
  }, [items, wanted])

  const missingIds = useMemo(() => missing.map((m) => m.cardId), [missing])
  const { cards: missingCards } = useCardMap(missingIds)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Colección</h1>

      <CardSearch
        onPick={async (card) => {
          const current = await db.collection.get(card.id)
          await setCollectionQty(card.id, (current?.qty ?? 0) + 1)
        }}
        placeholder="Añadir carta a la colección…"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Tienes ({items?.length ?? 0} cartas distintas)
          </h2>

          {items?.length === 0 && (
            <p className="text-sm text-muted">Nada registrado todavía.</p>
          )}

          <ul className="divide-y divide-edge rounded border border-edge bg-panel">
            {items?.map((item) => {
              const card = cards.get(item.cardId)
              return (
                <li key={item.cardId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <input
                    type="number"
                    min={0}
                    value={item.qty}
                    onChange={(e) => void setCollectionQty(item.cardId, Number(e.target.value))}
                    className="tabular w-14 rounded border border-edge bg-ink px-1 py-0.5 text-center outline-none focus:border-accent"
                  />
                  <span className="min-w-0 flex-1 truncate">{card?.name ?? item.cardId}</span>
                  <ManaCost cost={card?.mana_cost} />
                </li>
              )
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Te falta para tus mazos ({missing.length})
          </h2>

          {missing.length === 0 && (
            <p className="text-sm text-muted">
              Nada: tienes todo lo que piden tus mazos (o no hay mazos todavía).
            </p>
          )}

          <ul className="divide-y divide-edge rounded border border-edge bg-panel">
            {missing.map((row) => (
              <li key={row.cardId} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="tabular w-14 text-center text-amber-300">
                  {row.need - row.have}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {missingCards.get(row.cardId)?.name ?? row.cardId}
                </span>
                <button
                  type="button"
                  onClick={() => void setCollectionQty(row.cardId, row.need)}
                  className="shrink-0 text-xs text-muted hover:text-white"
                >
                  ya la tengo
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
