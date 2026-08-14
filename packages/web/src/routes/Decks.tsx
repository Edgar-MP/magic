import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FORMATS, FORMAT_LABELS, countBoard, deckSize, type Format } from '@magic/shared'
import { createDeck, deleteDeck, useDecks } from '../lib/db-hooks.js'

export function Decks() {
  const decks = useDecks()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [format, setFormat] = useState<Format>('commander')

  const create = async () => {
    const id = await createDeck(name.trim() === '' ? 'Mazo sin nombre' : name.trim(), format)
    setName('')
    navigate(`/decks/${id}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight">Mazos</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del mazo"
          className="min-w-48 flex-1 rounded border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
          className="rounded border border-edge bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded border border-accent bg-accent/15 px-4 py-2 text-sm text-accent hover:bg-accent/25"
        >
          Crear
        </button>
      </form>

      {decks === undefined && <p className="text-sm text-muted">Cargando…</p>}

      {decks?.length === 0 && (
        <p className="text-sm text-muted">Todavía no hay mazos. Crea el primero arriba.</p>
      )}

      <ul className="flex flex-col gap-2">
        {decks?.map((deck) => (
          <li
            key={deck.id}
            className="flex items-center justify-between gap-4 rounded border border-edge bg-panel px-4 py-3"
          >
            <Link to={`/decks/${deck.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-medium">{deck.name}</span>
              <span className="text-xs text-muted">
                {FORMAT_LABELS[deck.format]} · {deckSize(deck)} cartas
                {countBoard(deck, 'side') > 0 ? ` · ${countBoard(deck, 'side')} de banda` : ''}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (confirm(`¿Borrar «${deck.name}»?`)) void deleteDeck(deck.id)
              }}
              className="text-xs text-muted hover:text-red-400"
            >
              Borrar
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
