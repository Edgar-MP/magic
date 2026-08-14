import { Link } from 'react-router-dom'
import { useDecks, useProxies } from '../lib/db-hooks.js'

export function Home() {
  const decks = useDecks()
  const proxies = useProxies()

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Mazos y proxies</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Construye mazos con los datos de Scryfall y crea cartas proxy con tu propia ilustración.
          Todo se guarda en este navegador: no hay cuentas ni servidor.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/decks"
          className="rounded border border-edge bg-panel p-4 transition hover:border-accent"
        >
          <h2 className="font-medium">Mazos</h2>
          <p className="mt-1 text-sm text-muted">
            {decks === undefined ? '…' : `${decks.length} guardados`}. Validación de formato, curva
            de maná e importar y exportar listas.
          </p>
        </Link>

        <Link
          to="/proxies"
          className="rounded border border-edge bg-panel p-4 transition hover:border-accent"
        >
          <h2 className="font-medium">Proxies</h2>
          <p className="mt-1 text-sm text-muted">
            {proxies === undefined ? '…' : `${proxies.length} diseñados`}. Marco completo, tu foto
            como ilustración y PDF A4 para imprimir.
          </p>
        </Link>
      </div>
    </div>
  )
}
