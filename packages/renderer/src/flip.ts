import type { ProxyDesign } from '@magic/shared'
import type { RenderEnv, Surface } from './env.js'
import { M15 } from './frames.js'
import { PREVIEW_WIDTH, renderCard, type RenderOptions } from './render.js'

/**
 * Composición de una carta Flip (Erayo, Soratami Ascendant // Erayo's
 * Essence, Nezumi Graverobber // Nezumi Shadow-Watcher, del bloque clásico de
 * Kamigawa): a diferencia de Split, las dos caras NO están una al lado de la
 * otra rotadas 90° — comparten la MISMA cara física de la carta, cada una en
 * su mitad: la cara `top` ocupa la mitad superior en orientación normal, y la
 * cara `bottom` ocupa la mitad inferior IMPRESA DEL REVÉS (rotada 180°), tal
 * como está impresa una Flip real. Girando la carta física 180° enteras, la
 * mitad de abajo pasa a arriba y se lee del derecho — así se juega con la
 * segunda cara sin barajar dos cartas.
 *
 * Cada mitad es un `ProxyDesign` normal completo (ver `flipPartnerId` en
 * `@magic/shared`), renderizado por separado con `renderCard` (sin tocarlo) y
 * encogido «contain» a su mitad del lienzo — igual que la técnica de
 * `split.ts`, pero aquí el lienzo combinado es RETRATO, con la misma
 * proporción que una carta normal (`M15.aspect`), no apaisado: una Flip real
 * mide lo mismo que cualquier otra carta, así que imprime en una sola
 * posición de la rejilla sin necesitar la rotación-en-rejilla que sí hace
 * falta para Split (ver `pdf.ts`: `place()` sólo rota si `image.width >
 * image.height`, y aquí no es el caso).
 *
 * Verificado por inspección del PNG compuesto (`scripts/.tmp-flip.ts`): la
 * mitad de arriba se lee del derecho, la de abajo al revés, y rotando el
 * lienzo entero 180° la de abajo pasa a arriba y se lee del derecho — como
 * una Flip real.
 */

export interface FlipRenderOptions {
  /** Ancho del lienzo combinado en px. El alto sale de `M15.aspect`. */
  width?: number
  background?: string
  /** Arte de cada cara, si no viene resuelto en `design.art.url`. */
  topArt?: Blob | string
  bottomArt?: Blob | string
}

/**
 * Renderiza las dos caras de una Flip y las compone en un único lienzo
 * retrato. `top` es la cara que se lee en la orientación normal de la carta,
 * `bottom` la que se lee girando la carta física 180°.
 */
export async function renderFlip(
  top: ProxyDesign,
  bottom: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH, background = '#000000', topArt, bottomArt }: FlipRenderOptions = {},
): Promise<Surface> {
  const height = Math.round(width / M15.aspect)
  const halfHeight = height / 2

  const renderOpts = (art?: Blob | string): RenderOptions => ({
    // Cada cara se renderiza a un tamaño generoso (el ancho del lienzo
    // combinado, con su alto de carta normal completo) y luego se encoge al
    // ajustarla a su mitad: renderizar desde más resolución evita que se vea
    // borrosa tras el encogido.
    width,
    background,
    ...(art ? { art } : {}),
  })

  const [topSurface, bottomSurface] = await Promise.all([
    renderCard(top, env, renderOpts(topArt)),
    renderCard(bottom, env, renderOpts(bottomArt)),
  ])

  const surface = env.createSurface(width, height)
  const { ctx } = surface
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  drawHalf(ctx, topSurface, { x: 0, y: 0, width, height: halfHeight }, false)
  drawHalf(ctx, bottomSurface, { x: 0, y: halfHeight, width, height: halfHeight }, true)

  return surface
}

/**
 * Dibuja una cara ya renderizada (retrato, carta completa) ajustada
 * «contain» y centrada dentro de su mitad del lienzo, sin rotar (`top`) o
 * rotada 180° (`bottom`).
 */
function drawHalf(
  ctx: CanvasRenderingContext2D,
  card: Surface,
  slot: { x: number; y: number; width: number; height: number },
  rotate180: boolean,
): void {
  // La carta completa (retrato) no cabe entera en la mitad del lienzo sin
  // encogerse: se ajusta «contain» a la mitad disponible, igual concesión que
  // hace cualquier Flip real (cada cara es más compacta que una carta entera).
  const scale = Math.min(slot.width / card.width, slot.height / card.height)
  const drawWidth = card.width * scale
  const drawHeight = card.height * scale

  const cx = slot.x + slot.width / 2
  const cy = slot.y + slot.height / 2

  ctx.save()
  ctx.translate(cx, cy)
  if (rotate180) ctx.rotate(Math.PI)
  ctx.drawImage(card.asImage(), -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}
