import type { RenderEnv, Surface } from '@magic/renderer'
import { FONT_FAMILY, paths, withAssetCache, type FontRole } from '@magic/renderer'

/** Los assets los sirve el plugin `card-assets` de Vite. */
const ASSET_BASE = '/card-assets/'

const loaded = new Map<FontRole, Promise<void>>()

function loadHtmlImage(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    image.src = src
  })
}

export function createBrowserEnv(): RenderEnv {
  const env: RenderEnv = {
    createSurface(width, height): Surface {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('El navegador no da contexto 2d')

      return {
        canvas,
        ctx,
        width,
        height,
        asImage: () => canvas,
        toBlob(type = 'image/png') {
          return new Promise((resolve, reject) => {
            canvas.toBlob(
              (blob) => (blob ? resolve(blob) : reject(new Error('toBlob vacío'))),
              type,
              type === 'image/jpeg' ? 0.92 : undefined,
            )
          })
        },
      }
    },

    loadAsset(path) {
      return loadHtmlImage(ASSET_BASE + path)
    },

    async loadImage(source) {
      if (typeof source === 'string') {
        // El arte oficial viene del CDN de Scryfall, que sí manda cabeceras CORS;
        // sin `crossOrigin` el lienzo se marcaría como contaminado y no se
        // podría exportar a PNG ni a PDF.
        return loadHtmlImage(source, /^https?:/.test(source))
      }

      const url = URL.createObjectURL(source)
      try {
        return await loadHtmlImage(url)
      } finally {
        URL.revokeObjectURL(url)
      }
    },

    async ensureFonts(roles) {
      await Promise.all(
        roles.map((role) => {
          const existing = loaded.get(role)
          if (existing) return existing

          const family = FONT_FAMILY[role]
          const face = new FontFace(family, `url(${ASSET_BASE}${paths.font(role)})`)
          const promise = face.load().then((ready) => {
            document.fonts.add(ready)
          })
          loaded.set(role, promise)
          return promise
        }),
      )
    },
  }

  return withAssetCache(env)
}

/** Una sola instancia: la caché de assets se comparte en toda la aplicación. */
export const browserEnv = createBrowserEnv()
