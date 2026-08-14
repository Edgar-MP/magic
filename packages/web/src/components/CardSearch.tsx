import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { indexReady, loadIndex, putCards, scryfall, searchLocal } from '@magic/cards'
import type { Card } from '@magic/shared'
import { ManaCost } from './ManaCost.js'

/**
 * Buscador de cartas. Mientras escribes usa el índice local (instantáneo, sin
 * red); al pulsar Enter o si usas sintaxis de Scryfall (`t:`, `c:`, `cmc<=3`)
 * consulta la API, que sabe mucho más.
 */

const SYNTAX = /[:<>=]|\bor\b|\band\b/i

function useLocalIndex(): boolean {
  const [ready, setReady] = useState(indexReady())

  useEffect(() => {
    if (ready) return
    let cancelled = false
    loadIndex()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      // Sin índice se sigue funcionando: todo va contra la API.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [ready])

  return ready
}

export interface CardSearchProps {
  onPick: (card: Card) => void
  /** Restringe a lo legal en un formato. */
  format?: string
  /** Restringe a una identidad de color (para Commander). */
  identity?: string[]
  placeholder?: string
  autoFocus?: boolean
}

export function CardSearch({
  onPick,
  format,
  identity,
  placeholder = 'Buscar carta…',
  autoFocus,
}: CardSearchProps) {
  const [text, setText] = useState('')
  const [remoteQuery, setRemoteQuery] = useState('')
  const hasIndex = useLocalIndex()

  const usesSyntax = SYNTAX.test(text)

  // Sugerencias locales mientras se teclea.
  const local = useMemo(() => {
    if (!hasIndex || usesSyntax || text.trim().length < 2) return []
    return searchLocal(text, { limit: 12, ...(format ? { format } : {}), ...(identity ? { identity } : {}) })
  }, [text, hasIndex, usesSyntax, format, identity])

  const remote = useQuery({
    queryKey: ['search', remoteQuery, format, identity?.join('')],
    enabled: remoteQuery.trim() !== '',
    queryFn: async () => {
      const parts = [remoteQuery]
      if (format) parts.push(`legal:${format}`)
      if (identity) parts.push(`ci<=${identity.length > 0 ? identity.join('') : 'c'}`)
      const result = await scryfall.search(parts.join(' '), { unique: 'cards', order: 'name' })
      await putCards(result.cards)
      return result
    },
  })

  const submit = () => {
    if (text.trim() !== '') setRemoteQuery(text.trim())
  }

  /** Las sugerencias locales sólo traen el id: hay que traerse la carta entera. */
  const pickLocal = async (id: string) => {
    const card = await scryfall.byId(id)
    if (!card) return
    await putCards([card])
    onPick(card)
    setText('')
  }

  const pickRemote = (card: Card) => {
    onPick(card)
    setText('')
    setRemoteQuery('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setText('')
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          className="rounded border border-edge bg-panel px-3 py-2 text-sm hover:border-accent"
        >
          Buscar
        </button>
      </div>

      {usesSyntax && remoteQuery === '' && (
        <p className="text-xs text-muted">
          Sintaxis de Scryfall detectada: pulsa Enter para buscar en la API.
        </p>
      )}

      {local.length > 0 && (
        <ul className="divide-y divide-edge rounded border border-edge bg-panel">
          {local.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => void pickLocal(entry.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-edge"
              >
                <span className="truncate">{entry.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">{entry.type_line?.split(' —')[0]}</span>
                  <ManaCost cost={entry.mana_cost} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {remote.isFetching && <p className="text-xs text-muted">Buscando en Scryfall…</p>}
      {remote.error && <p className="text-xs text-red-400">{(remote.error as Error).message}</p>}

      {remote.data && remote.data.cards.length > 0 && (
        <div className="rounded border border-edge bg-panel">
          <p className="border-b border-edge px-3 py-1.5 text-xs text-muted">
            {remote.data.totalCards} resultados{remote.data.hasMore ? ' (primera página)' : ''}
          </p>
          <ul className="max-h-80 divide-y divide-edge overflow-y-auto">
            {remote.data.cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => pickRemote(card)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-edge"
                >
                  <span className="truncate">{card.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted">{card.set.toUpperCase()}</span>
                    <ManaCost cost={card.mana_cost} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {remote.data && remote.data.cards.length === 0 && (
        <p className="text-xs text-muted">Sin resultados.</p>
      )}
    </div>
  )
}
