import { createReadStream } from 'node:fs'
import { stat, cp } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

const assetDir = new URL('../renderer/assets/', import.meta.url).pathname

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.jpg': 'image/jpeg',
}

/**
 * Sirve los marcos, tipografías y símbolos de `packages/renderer/assets` en
 * `/card-assets`. Viven fuera de `public/` porque no se versionan (los baja
 * `pnpm assets`), así que hay que montarlos a mano en desarrollo y copiarlos
 * al compilar.
 */
function cardAssets(): Plugin {
  const prefix = '/card-assets/'

  return {
    name: 'card-assets',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next()

        // `normalize` más el prefijo fijo evitan salir de la carpeta con `..`.
        const relative = normalize(decodeURIComponent(req.url.slice(prefix.length)))
        if (relative.startsWith('..')) return next()

        const file = join(assetDir, relative)
        stat(file).then(
          (info) => {
            if (!info.isFile()) return next()
            res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream')
            res.setHeader('Cache-Control', 'max-age=31536000, immutable')
            createReadStream(file).pipe(res)
          },
          () => next(),
        )
      })
    },

    async closeBundle() {
      try {
        await cp(assetDir, join(import.meta.dirname, 'dist/card-assets'), { recursive: true })
      } catch {
        this.warn('No hay assets que copiar. Ejecuta `pnpm assets` antes de compilar.')
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwind(), cardAssets()],
  server: { port: 5173 },
})
