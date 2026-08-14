import { NavLink, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { Home } from './routes/Home.js'
import { Decks } from './routes/Decks.js'
import { DeckEditor } from './routes/DeckEditor.js'
import { DeckProxies } from './routes/DeckProxies.js'
import { Collection } from './routes/Collection.js'
import { Proxies } from './routes/Proxies.js'
import { ProxyEditor } from './routes/ProxyEditor.js'

const NAV = [
  { to: '/decks', label: 'Mazos' },
  { to: '/proxies', label: 'Proxies' },
  { to: '/collection', label: 'Colección' },
]

export function App() {
  return (
    <Router>
      <div className="flex min-h-full flex-col">
        <header className="border-b border-edge bg-panel">
          <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
            <NavLink to="/" className="mr-4 font-semibold tracking-tight">
              Magic
            </NavLink>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-sm ${
                    isActive ? 'bg-edge text-white' : 'text-muted hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/decks/:id" element={<DeckEditor />} />
            <Route path="/decks/:id/proxies" element={<DeckProxies />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route path="/proxies/:id" element={<ProxyEditor />} />
            <Route path="/collection" element={<Collection />} />
            <Route path="*" element={<p className="text-muted">No hay nada aquí.</p>} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
