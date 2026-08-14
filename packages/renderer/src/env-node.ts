import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import type { RenderEnv, Surface } from './env.js'
import { withAssetCache } from './env.js'
import { FONT_FAMILY, paths, type FontRole } from './frames.js'

/**
 * Adaptador de Node, para los tests de render y para generar PDF sin navegador.
 * `@napi-rs/canvas` implementa la misma API que el canvas del DOM (incluido
 * cargar SVG), así que el cast a los tipos del DOM es seguro y queda aquí.
 */

const defaultAssetDir = join(dirname(fileURLToPath(import.meta.url)), '../assets')

const registered = new Set<FontRole>()

export interface NodeEnvOptions {
  assetDir?: string
}

export function createNodeEnv({ assetDir = defaultAssetDir }: NodeEnvOptions = {}): RenderEnv {
  const env: RenderEnv = {
    createSurface(width, height): Surface {
      const canvas = createCanvas(width, height)
      const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
      return {
        canvas,
        ctx,
        width,
        height,
        asImage: () => canvas as unknown as CanvasImageSource,
        async toBlob(type = 'image/png') {
          const buffer =
            type === 'image/jpeg' ? await canvas.encode('jpeg', 92) : await canvas.encode('png')
          return new Blob([new Uint8Array(buffer)], { type })
        },
      }
    },

    async loadAsset(path) {
      const image = await loadImage(await readFile(join(assetDir, path)))
      return image as unknown as CanvasImageSource & { width: number; height: number }
    },

    async loadImage(source) {
      const image = await loadImage(await toImageData(source))
      return image as unknown as CanvasImageSource & { width: number; height: number }
    },

    async ensureFonts(roles) {
      for (const role of roles) {
        if (registered.has(role)) continue
        GlobalFonts.registerFromPath(join(assetDir, paths.font(role)), FONT_FAMILY[role])
        registered.add(role)
      }
    },
  }

  return withAssetCache(env)
}

/**
 * En Node hay que bajarse las URL a mano (el arte oficial de Scryfall, los
 * símbolos de expansión); en el navegador eso lo hace el propio `<img>`.
 */
async function toImageData(source: Blob | string): Promise<Buffer | string> {
  if (typeof source !== 'string') return Buffer.from(await source.arrayBuffer())
  if (!/^https?:\/\//.test(source)) return source

  const response = await fetch(source, { headers: { 'User-Agent': 'magic-renderer/0.1' } })
  if (!response.ok) throw new Error(`${response.status} al bajar ${source}`)
  return Buffer.from(await response.arrayBuffer())
}
