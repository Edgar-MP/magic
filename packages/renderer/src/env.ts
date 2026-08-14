import type { FontRole } from './frames.js'

/**
 * El renderizador no sabe si está en un navegador o en Node. Todo lo que
 * depende del entorno (crear lienzos, leer imágenes, registrar tipografías)
 * entra por aquí.
 *
 * Se tipa con los tipos del DOM porque `@napi-rs/canvas` implementa la misma
 * API; el adaptador de Node hace el cast en un único sitio.
 */

export interface Surface {
  canvas: unknown
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  /** Para poder usar el resultado como fuente de `drawImage`. */
  asImage(): CanvasImageSource
  toBlob(type?: string): Promise<Blob>
}

export interface RenderEnv {
  createSurface(width: number, height: number): Surface
  /** Carga un asset por su ruta relativa a `assets/` (PNG o SVG). */
  loadAsset(path: string): Promise<CanvasImageSource & { width: number; height: number }>
  /** Carga una imagen del usuario desde un Blob o una URL. */
  loadImage(source: Blob | string): Promise<CanvasImageSource & { width: number; height: number }>
  /** Registra las tipografías. Idempotente. */
  ensureFonts(roles: FontRole[]): Promise<void>
}

/** Caché de assets: se piden muchas veces y no cambian nunca. */
export function withAssetCache(env: RenderEnv): RenderEnv {
  const cache = new Map<string, Promise<CanvasImageSource & { width: number; height: number }>>()
  return {
    ...env,
    loadAsset(path) {
      const hit = cache.get(path)
      if (hit) return hit
      const promise = env.loadAsset(path).catch((error) => {
        // No cacheamos el fallo: puede ser un asset que aún no se ha descargado.
        cache.delete(path)
        throw error
      })
      cache.set(path, promise)
      return promise
    },
  }
}
