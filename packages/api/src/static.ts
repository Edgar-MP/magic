import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

/**
 * Servidor de ficheros de la web compilada.
 *
 * Está escrito a mano en vez de con `serveStatic` porque hacen falta tres cosas
 * muy concretas: cabeceras de caché distintas según el fichero (los marcos no
 * cambian nunca, el índice de cartas sí), el fallback a `index.html` que necesita
 * React Router, y responder a HEAD además de GET.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
}

const YEAR = 60 * 60 * 24 * 365

/**
 * Rutas cuyo contenido no cambia nunca sin cambiar de nombre: los bundles llevan
 * hash y los marcos son ficheros fijos. Se pueden cachear para siempre.
 */
function isImmutable(pathname: string): boolean {
  return pathname.startsWith('/assets/') || pathname.startsWith('/card-assets/')
}

export function cacheControlFor(pathname: string): string {
  if (isImmutable(pathname)) return `public, max-age=${YEAR}, immutable`
  // El índice de cartas cambia con cada expansión: se revalida con ETag.
  if (pathname === '/card-index.json') return 'public, max-age=300, must-revalidate'
  // El HTML nunca se cachea, o un despliegue nuevo no llegaría a los navegadores.
  if (pathname === '/' || pathname.endsWith('.html')) return 'no-cache'
  return 'public, max-age=3600'
}

/**
 * Convierte la ruta pedida en una ruta de disco dentro de `root`, o `undefined`
 * si no es una ruta legítima.
 *
 * El `..` se rechaza mirando los segmentos **antes** de normalizar: `normalize`
 * colapsa un `/../../etc/passwd` en `/etc/passwd`, que al unirlo al raíz ya no se
 * escapa, pero deja pasar la petición y acabaría sirviendo el `index.html` del
 * SPA para una ruta que nadie pide de buena fe. Mejor un 400 y que se vea.
 *
 * Ojo: por HTTP este rechazo casi nunca se dispara, porque Hono ya normaliza la
 * ruta antes de llegar aquí (un `/%2e%2e/etc/passwd` llega como `/etc/passwd`).
 * Se queda igualmente como segunda barrera y porque esta función también se usa
 * suelta. Lo que de verdad garantiza que nada de fuera se sirve es la
 * comprobación de que la ruta resuelta cae dentro del raíz.
 */
export function resolveInsideRoot(root: string, pathname: string): string | undefined {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Un porcentaje mal escrito: no es una ruta válida.
    return undefined
  }

  if (decoded.includes('\0')) return undefined
  if (decoded.split(/[\\/]/).includes('..')) return undefined

  const relative = normalize(decoded).replace(/^[/\\]+/, '')
  const absolute = resolve(join(root, relative))
  const base = resolve(root)

  // Segunda barrera: aunque lo anterior falle, nada fuera del raíz se sirve.
  if (absolute !== base && !absolute.startsWith(base + sep)) return undefined
  return absolute
}

interface FileInfo {
  path: string
  size: number
  etag: string
}

async function statFile(path: string): Promise<FileInfo | undefined> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return undefined
    return {
      path,
      size: info.size,
      // Tamaño y fecha bastan: el contenido no cambia sin que cambie uno de los dos.
      etag: `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`,
    }
  } catch {
    return undefined
  }
}

/** ¿La petición es de un documento? Entonces una ruta desconocida es del SPA. */
function wantsDocument(pathname: string, accept: string | undefined): boolean {
  if (accept?.includes('text/html')) return true
  // Sin extensión parece una ruta de la aplicación (`/decks/abc`).
  return extname(pathname) === ''
}

export interface StaticResult {
  status: number
  headers: Record<string, string>
  /** Sin cuerpo en un 304 o en un HEAD. */
  body?: ReadableStream
}

export interface ServeStaticOptions {
  root: string
  pathname: string
  method: string
  accept?: string | undefined
  ifNoneMatch?: string | undefined
}

/**
 * Resuelve una petición de fichero estático. Devuelve la respuesta a construir,
 * sin tocar Hono, para poder probarlo sin levantar un servidor.
 */
export async function serveStaticFile({
  root,
  pathname,
  method,
  accept,
  ifNoneMatch,
}: ServeStaticOptions): Promise<StaticResult | undefined> {
  const direct = resolveInsideRoot(root, pathname === '/' ? '/index.html' : pathname)
  if (!direct) return { status: 400, headers: { 'Content-Type': 'text/plain' } }

  let file = await statFile(direct)
  let servedPath = pathname

  if (!file) {
    // Nada en disco: si esperaban un documento, es una ruta del SPA.
    if (!wantsDocument(pathname, accept)) return undefined

    const fallback = resolveInsideRoot(root, '/index.html')
    if (!fallback) return undefined
    file = await statFile(fallback)
    if (!file) return undefined
    servedPath = '/index.html'
  }

  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(file.path).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cacheControlFor(servedPath),
    ETag: file.etag,
    'Content-Length': String(file.size),
  }

  if (ifNoneMatch && ifNoneMatch.split(',').some((tag) => tag.trim() === file.etag)) {
    return { status: 304, headers }
  }

  if (method === 'HEAD') return { status: 200, headers }

  return {
    status: 200,
    headers,
    body: Readable.toWeb(createReadStream(file.path)) as ReadableStream,
  }
}
