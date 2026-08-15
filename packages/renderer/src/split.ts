import type { ProxyDesign } from '@magic/shared'
import type { RenderEnv, Surface } from './env.js'
import { BATTLE } from './frames.js'
import { PREVIEW_WIDTH, renderCard, type RenderOptions } from './render.js'

/**
 * Composición de una carta Split (Fire // Ice, Life // Death): dos hechizos
 * completos, cada uno un `ProxyDesign` normal (ver `splitPartnerId` en
 * `@magic/shared`), que se renderizan por separado con `renderCard` (sin
 * tocarlo) y se juntan aquí en un único lienzo apaisado, cada mitad rotada
 * 90° — igual que una carta Split real: la carta física sigue midiendo lo
 * mismo que cualquier otra, pero para leer cada mitad hay que girarla.
 *
 * El lienzo combinado usa la misma proporción que `BATTLE` (el ancho y el
 * alto de una carta normal intercambiados): así, igual que con Battle, el
 * PDF de impresión ya sabe colocarlo girado en una sola casilla de la rejilla
 * sin ningún cambio en `pdf.ts` — `place()` allí ya rota cualquier imagen más
 * ancha que alta para que quepa en el hueco de 63×88 mm.
 *
 * Dentro de ese lienzo, cada mitad se ajusta «contain» (sin recortar ni
 * deformar, centrada) a su hueco: dos hechizos completos a tamaño normal no
 * caben sin encogerse en el sitio de una sola carta, así que salen un poco
 * más pequeños que a toda plana — es la misma concesión que hace cualquier
 * Split real (cada mitad es más compacta que una carta entera).
 *
 * Verificado por muestreo de píxeles en `scripts/.tmp-split.ts`: con esta
 * orientación, girando el lienzo entero 90° a la derecha se lee del derecho
 * la mitad izquierda, y girándolo 90° a la izquierda se lee la derecha —
 * igual que Fire // Ice.
 */

export interface SplitRenderOptions {
  /** Ancho del lienzo combinado en px. El alto sale de `BATTLE.aspect`. */
  width?: number
  background?: string
  /** Arte de cada mitad, si no viene resuelto en `design.art.url`. */
  leftArt?: Blob | string
  rightArt?: Blob | string
}

export interface SplitLayout {
  surface: Surface
  width: number
  height: number
}

/**
 * Renderiza las dos mitades de una Split y las compone en un único lienzo
 * apaisado. `left` es la mitad que se lee girando la carta a la derecha
 * (sentido horario), `right` la que se lee girándola a la izquierda.
 */
export async function renderSplit(
  left: ProxyDesign,
  right: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH, background = '#000000', leftArt, rightArt }: SplitRenderOptions = {},
): Promise<Surface> {
  const height = Math.round(width / BATTLE.aspect)
  const halfWidth = width / 2

  const renderOpts = (art?: Blob | string): RenderOptions => ({
    // Se renderiza cada mitad a un tamaño generoso: luego se encoge al
    // ajustarla a su hueco, y hacerlo desde más resolución evita que se vea
    // borrosa. El alto del lienzo combinado es una buena referencia porque,
    // tras rotar 90°, se convierte en el ancho de la mitad renderizada.
    width: height,
    background,
    ...(art ? { art } : {}),
  })

  const [leftSurface, rightSurface] = await Promise.all([
    renderCard(left, env, renderOpts(leftArt)),
    renderCard(right, env, renderOpts(rightArt)),
  ])

  const surface = env.createSurface(width, height)
  const { ctx } = surface
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  drawHalf(ctx, leftSurface, { x: 0, width: halfWidth, height }, 'left')
  drawHalf(ctx, rightSurface, { x: halfWidth, width: halfWidth, height }, 'right')

  return surface
}

/**
 * Dibuja una mitad ya renderizada (retrato) rotada 90° dentro de su hueco,
 * ajustada «contain» y centrada.
 *
 * `side: 'left'` gira 90° en sentido antihorario: al girar luego el lienzo
 * entero en sentido horario (a la derecha), esa rotación se deshace y la
 * mitad queda del derecho. `side: 'right'` es lo simétrico, para leerse
 * girando el lienzo a la izquierda.
 */
function drawHalf(
  ctx: CanvasRenderingContext2D,
  card: Surface,
  slot: { x: number; width: number; height: number },
  side: 'left' | 'right',
): void {
  // Tras rotar 90° la imagen retrato (card.width × card.height), su caja pasa
  // a medir card.height (ancho) × card.width (alto). Se encoge lo que haga
  // falta para que quepa en el hueco sin desbordar ni deformarse.
  const scale = Math.min(slot.width / card.height, slot.height / card.width)
  const drawWidth = card.width * scale
  const drawHeight = card.height * scale

  const cx = slot.x + slot.width / 2
  const cy = slot.height / 2

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((side === 'left' ? -1 : 1) * (Math.PI / 2))
  // Tras `rotate`, los ejes locales ya están girados: se dibuja centrada en el
  // origen con su ancho/alto ORIGINALES (sin rotar), que es lo que espera
  // `drawImage` en el sistema de coordenadas ya girado.
  ctx.drawImage(card.asImage(), -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}
