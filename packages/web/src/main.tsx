import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.js'
import './styles.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de las cartas no cambian: no hace falta revalidar.
      staleTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Falta #root')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
