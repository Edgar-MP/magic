import type { ArtPlacement, ProxyDesign } from '@magic/shared'
import type { RenderEnv, Surface } from './env.js'
import type { Box, FrameSet, TextBox, VariantSpec } from './frames.js'
import {
  FONT_FAMILY,
  FRAME_ACCENT,
  FRAME_SETS,
  M15,
  VARIANTS,
  artBoxOf,
  landSymbolPath,
  paths,
  setSymbolBoxOf,
  textBoxOf,
} from './frames.js'
import { condenseToWidth, layoutAutofit, symbolWidth, type Line } from './text/layout.js'
import { tokenize, tokenizeManaCost } from './text/tokenize.js'

/**
 * Compone una carta capa a capa sobre un lienzo. Todas las medidas salen del
 * `FrameSet` en coordenadas normalizadas y se multiplican por el tamaño real,
 * así que el mismo código sirve para la vista previa y para imprimir.
 */

export interface RenderOptions {
  /** Ancho del lienzo en px. El alto sale de la proporción del marco. */
  width?: number
  /** Dibuja el fondo negro de los bordes de la carta. */
  background?: string
  /**
   * Imagen del arte. El renderizador no sabe leer de IndexedDB, así que quien
   * llama resuelve `design.art.blobId` y pasa el Blob aquí. Si no se pasa, se
   * usa `design.art.url`.
   */
  art?: Blob | string
}

/** Ancho por defecto: mitad del asset, suficiente para la vista previa. */
export const PREVIEW_WIDTH = 750
/** Ancho para imprimir: el nativo de los marcos, unos 800 dpi. */
export const PRINT_WIDTH = 2010

/**
 * Todo lo que no es la ilustración, ya compuesto: marco, máscaras, cajas y
 * textos, sobre fondo transparente.
 *
 * Existe para poder mover el arte sin recomponer la carta. Recomponerla cuesta
 * (máscaras, capas y la bisección del autoajuste del texto), así que en el
 * editor esto se calcula una vez y cada fotograma del arrastre sólo repinta el
 * arte y vuelve a estampar esta capa encima.
 */
export interface CardLayers {
  overlay: Surface
  /** Ventana de arte de esta variante, en coordenadas normalizadas. */
  artBox: Box
  width: number
  height: number
}

export async function renderCardLayers(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH }: { width?: number } = {},
): Promise<CardLayers> {
  const set = FRAME_SETS[design.frameSet] ?? M15
  const variant = VARIANTS[design.variant] ?? VARIANTS.regular
  const height = Math.round(width / set.aspect)

  await env.ensureFonts(['title', 'titleSmallCaps', 'body', 'bodyItalic'])

  const overlay = env.createSurface(width, height)
  const { ctx } = overlay
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = { width, height }

  await drawFrame(ctx, env, design, set, variant, scale)
  await drawBasicWatermark(ctx, env, design, set, variant, scale)
  await drawLandSymbol(ctx, env, design, variant, scale)
  await drawPtBox(ctx, env, design, set, variant, scale)
  await drawCrown(ctx, env, design, set, variant, scale)
  await drawStamp(ctx, env, design, set, scale)
  // El símbolo se dibuja antes que el texto porque su ancho decide cuánto sitio
  // le queda a la línea de tipo.
  const symbolWidthPx = await drawSetSymbol(ctx, env, design, set, variant, scale)
  await drawText(ctx, env, design, set, variant, scale, symbolWidthPx)

  return { overlay, artBox: artBoxOf(set, variant.id), width, height }
}

/** Estampa fondo, ilustración y capa de marco sobre un contexto ya creado. */
export function paintCard(
  ctx: CanvasRenderingContext2D,
  layers: CardLayers,
  art: ArtImage | undefined,
  placement: ArtPlacement,
  background = '#000000',
): void {
  const { width, height } = layers

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  if (art) paintArt(ctx, art, layers.artBox, placement, { width, height })

  ctx.drawImage(layers.overlay.asImage(), 0, 0)
}

export async function renderCard(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH, background = '#000000', art }: RenderOptions = {},
): Promise<Surface> {
  const layers = await renderCardLayers(design, env, { width })

  const source = art ?? design.art.url
  // Sin arte se sigue dibujando la carta: es útil ver el marco y el texto.
  const image = source ? await env.loadImage(source).catch(() => undefined) : undefined

  const surface = env.createSurface(layers.width, layers.height)
  paintCard(surface.ctx, layers, image, design.art, background)
  return surface
}

/** Reverso de la carta, para imprimir a doble cara. */
export async function renderCardBack(
  env: RenderEnv,
  { width = PREVIEW_WIDTH, image }: { width?: number; image?: Blob | string } = {},
): Promise<Surface> {
  const height = Math.round(width / M15.aspect)
  const surface = env.createSurface(width, height)
  const { ctx } = surface

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)

  const back = image
    ? await env.loadImage(image).catch(() => undefined)
    : await env.loadAsset(paths.cardBack()).catch(() => undefined)
  if (!back) return surface

  // Se recorta a la proporción de la carta en vez de deformar el reverso.
  const cover = Math.max(width / back.width, height / back.height)
  const drawWidth = back.width * cover
  const drawHeight = back.height * cover
  ctx.drawImage(
    back,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )

  return surface
}

interface Scale {
  width: number
  height: number
}

/** Pasa una caja normalizada a px. */
function px(box: Box, { width, height }: Scale) {
  return {
    x: box.x * width,
    y: box.y * height,
    width: box.width * width,
    height: box.height * height,
  }
}

// --- Capas -------------------------------------------------------------------

export type ArtImage = CanvasImageSource & { width: number; height: number }

/**
 * Dibuja la ilustración recortada a su ventana. Es síncrona a propósito: el
 * arrastre en el editor la llama en cada fotograma con la imagen ya cargada.
 */
export function paintArt(
  ctx: CanvasRenderingContext2D,
  image: ArtImage,
  artBox: Box,
  placement: ArtPlacement,
  scale: Scale,
): void {
  const window_ = px(artBox, scale)

  // `scale: 1` es el zoom mínimo que cubre la ventana entera sin dejar huecos.
  const cover = Math.max(window_.width / image.width, window_.height / image.height)
  const drawWidth = image.width * cover * placement.scale
  const drawHeight = image.height * cover * placement.scale

  const cx = window_.x + window_.width / 2 + placement.x * window_.width
  const cy = window_.y + window_.height / 2 + placement.y * window_.height

  ctx.save()
  ctx.beginPath()
  ctx.rect(window_.x, window_.y, window_.width, window_.height)
  ctx.clip()
  ctx.drawImage(image, cx - drawWidth / 2, cy - drawHeight / 2, drawWidth, drawHeight)
  ctx.restore()
}

async function drawFrame(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
): Promise<void> {
  // El marco de Nyx sólo existe en la variante normal.
  const framePath = (color: Parameters<typeof paths.frame>[1]) =>
    design.flags.nyx && variant.id === 'regular'
      ? paths.nyxFrame(set, color)
      : variant.frameFile(color)

  const frame = await env.loadAsset(framePath(design.frameColor)).catch(() => undefined)
  if (frame) ctx.drawImage(frame, 0, 0, scale.width, scale.height)

  if (design.secondColor && design.secondColor !== design.frameColor) {
    const second = await env.loadAsset(framePath(design.secondColor)).catch(() => undefined)
    if (second) {
      // Segundo color: se dibuja aparte y se desvanece de izquierda a derecha,
      // que es como se ven las cartas híbridas.
      const layer = env.createSurface(scale.width, scale.height)
      layer.ctx.drawImage(second, 0, 0, scale.width, scale.height)

      const gradient = layer.ctx.createLinearGradient(scale.width * 0.35, 0, scale.width * 0.65, 0)
      gradient.addColorStop(0, 'rgba(0,0,0,0)')
      gradient.addColorStop(1, 'rgba(0,0,0,1)')
      layer.ctx.globalCompositeOperation = 'destination-in'
      layer.ctx.fillStyle = gradient
      layer.ctx.fillRect(0, 0, scale.width, scale.height)

      ctx.drawImage(layer.asImage(), 0, 0)
    }
  }

  // En la variante sin bordes el arte llega a los cantos: no hay que taparlo.
  if (!variant.blackBorder) return

  // Las texturas de tierra vienen a sangre y se comerían el borde de la carta,
  // que debe ser negro. Pese al nombre, la máscara que marca el anillo exterior
  // es `m15MaskFrame`; se comprobó dibujándola (la de `Border` es el interior).
  const borderMask = await env.loadAsset(paths.mask(set, 'Frame')).catch(() => undefined)
  if (borderMask) fillMasked(ctx, env, '#000000', borderMask, scale)
}

/** Pinta `color` sólo donde la máscara es opaca. */
function fillMasked(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  color: string,
  mask: CanvasImageSource,
  scale: Scale,
): void {
  const layer = env.createSurface(scale.width, scale.height)
  layer.ctx.fillStyle = color
  layer.ctx.fillRect(0, 0, scale.width, scale.height)
  layer.ctx.globalCompositeOperation = 'destination-in'
  layer.ctx.drawImage(mask, 0, 0, scale.width, scale.height)
  ctx.drawImage(layer.asImage(), 0, 0)
}

/** El símbolo grande centrado en la caja de texto de las tierras básicas. */
async function drawBasicWatermark(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
): Promise<void> {
  if (!design.basicWatermark || variant.hideBasicWatermark) return

  const image = await env
    .loadAsset(paths.basicWatermark(design.basicWatermark))
    .catch(() => undefined)
  if (!image) return

  const box = px(set.basicWatermark, scale)
  // Se ajusta dentro de la caja sin deformarse.
  const fit = Math.min(box.width / image.width, box.height / image.height)
  const width = image.width * fit
  const height = image.height * fit

  ctx.drawImage(
    image,
    box.x + (box.width - width) / 2,
    box.y + (box.height - height) / 2,
    width,
    height,
  )
}

/** Círculo con el símbolo de maná de la tierra, abajo a la izquierda. */
async function drawLandSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  variant: VariantSpec,
  scale: Scale,
): Promise<void> {
  if (!variant.landSymbol || !design.basicWatermark) return

  const image = await env
    .loadAsset(landSymbolPath(design.basicWatermark))
    .catch(() => undefined)
  if (!image) return

  const box = px(variant.landSymbol, scale)
  ctx.drawImage(image, box.x, box.y, box.width, box.height)
}

async function drawPtBox(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
): Promise<void> {
  if (!design.flags.showPt) return

  const file = variant.ptFile?.(design.frameColor) ?? paths.pt(set, design.frameColor)
  const box = await env.loadAsset(file).catch(() => undefined)
  if (!box) return
  const target = px(set.ptFrame, scale)
  ctx.drawImage(box, target.x, target.y, target.width, target.height)
}

async function drawCrown(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
): Promise<void> {
  if (!design.flags.legendary || !variant.supportsCrown) return

  const crown = await env.loadAsset(paths.crown(set, design.frameColor)).catch(() => undefined)
  if (!crown) return

  const target = px(set.crown, scale)
  ctx.drawImage(crown, target.x, target.y, target.width, target.height)
}

async function drawStamp(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  scale: Scale,
): Promise<void> {
  if (!design.flags.stamp) return
  const stamp = await env.loadAsset(paths.holoStamp(set, design.frameColor)).catch(() => undefined)
  if (!stamp) return
  const target = px(set.holoStamp, scale)
  ctx.drawImage(stamp, target.x, target.y, target.width, target.height)
}

/** Devuelve el ancho que ha ocupado, en px, o 0 si no hay símbolo. */
async function drawSetSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
): Promise<number> {
  if (!design.setSymbol) return 0

  const symbol = await env.loadImage(design.setSymbol).catch(() => undefined)
  if (!symbol) return 0

  // Ojo con esta caja: `x` es el borde derecho e `y` el centro vertical, para
  // que el símbolo quede alineado con la línea de tipo sea cual sea su forma.
  const box = px(setSymbolBoxOf(set, variant), scale)
  const height = box.height
  const width = height * (symbol.width / symbol.height)
  ctx.drawImage(symbol, box.x - width, box.y - height / 2, width, height)

  // Lo que se come del ancho de la línea de tipo: desde donde empieza el
  // símbolo hasta donde acababa la caja del tipo.
  const type = textBoxOf(set, variant, 'type')
  if (!type) return 0
  const typeRight = (type.x + type.width) * scale.width
  return Math.max(0, typeRight - (box.x - width))
}

// --- Texto -------------------------------------------------------------------

function fontString(box: TextBox, size: number, italic = false): string {
  const family = italic ? FONT_FAMILY.bodyItalic : FONT_FAMILY[box.font]
  return `${size}px "${family}"`
}

async function drawText(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  scale: Scale,
  symbolWidthPx: number,
): Promise<void> {
  const style = (slot: 'title' | 'type' | 'rules' | 'pt'): DrawStyle => ({
    ...(variant.textColor?.[slot] ? { color: variant.textColor[slot] } : {}),
    ...(variant.textShadow ? { shadow: true } : {}),
  })

  const box = (slot: Parameters<typeof textBoxOf>[2]) => textBoxOf(set, variant, slot)

  const mana = box('mana')
  if (mana) await drawManaCost(ctx, env, design, mana, scale)

  const title = box('title')
  if (title) {
    drawOneLine(ctx, design.text.name, title, scale, {
      // El nombre se comprime para no chocar con el coste de maná.
      maxWidth: reservedTitleWidth(design, title, mana, scale),
      ...style('title'),
    })
  }

  const type = box('type')
  if (type) {
    drawOneLine(ctx, design.text.type, type, scale, {
      // Y el tipo para no meterse debajo del símbolo de expansión.
      maxWidth: type.width * scale.width - symbolWidthPx,
      ...style('type'),
    })
  }

  const pt = box('pt')
  if (pt && design.flags.showPt) drawOneLine(ctx, design.text.pt, pt, scale, style('pt'))

  drawNote(ctx, design.text.note, set.note, scale, FRAME_ACCENT[design.frameColor])

  const info = box('info')
  if (info) drawInfoLine(ctx, design, info, scale)

  const rules = box('rules')
  if (rules) {
    // Igual que el título deja hueco al coste, la caja de reglas deja hueco a
    // la de fuerza/resistencia: si no, con texto largo (reglas + ambientación)
    // la última línea acaba tocando el recuadro.
    const reserved = pt && design.flags.showPt ? reservedRulesBox(rules, pt) : rules
    await drawRules(ctx, env, design, set, variant, reserved, scale)
  }
}

/** El ancho que le queda al título después del coste de maná. */
function reservedTitleWidth(
  design: ProxyDesign,
  title: TextBox,
  mana: TextBox | undefined,
  scale: Scale,
): number {
  const width = title.width * scale.width
  const symbols = tokenizeManaCost(design.text.mana).length
  if (symbols === 0 || !mana) return width

  const size = mana.size * scale.height
  const costWidth = symbols * size * 1.06
  return Math.max(width * 0.35, width - costWidth - size * 0.4)
}

/**
 * La caja de fuerza/resistencia queda en la esquina inferior derecha, y la de
 * reglas cubre casi todo el ancho hasta casi el mismo borde inferior: apenas
 * quedan unos píxeles entre las dos. Con texto largo (reglas + ambientación),
 * el autoajuste rellena la caja de reglas hasta el final y la última línea
 * acaba pegada al recuadro. Se recorta la altura para dejar un hueco real.
 */
function reservedRulesBox(rules: TextBox, pt: TextBox): TextBox {
  // Un margen de verdad, no sólo evitar el solape matemático: pegado al
  // borde también se ve mal aunque técnicamente no se toquen.
  const safeBottom = pt.y - pt.height * 0.4
  const bottom = rules.y + rules.height
  if (bottom <= safeBottom) return rules

  return { ...rules, height: Math.max(0, safeBottom - rules.y) }
}

async function drawManaCost(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  manaBox: TextBox,
  scale: Scale,
): Promise<void> {
  const symbols = tokenizeManaCost(design.text.mana)
  if (symbols.length === 0) return

  const box = px(manaBox, scale)
  // En el coste de maná el tamaño es el diámetro del símbolo, no un cuerpo de
  // letra: aquí no se aplica la reducción que sí llevan los símbolos en línea.
  const size = manaBox.size * scale.height
  const gap = size * 0.06
  const each = size

  // De derecha a izquierda: el último símbolo queda pegado al borde.
  let x = box.x + box.width
  for (const symbol of [...symbols].reverse()) {
    x -= each
    await drawSymbol(ctx, env, symbol, x, box.y, each)
    x -= gap
  }
}

async function drawSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  symbol: string,
  x: number,
  y: number,
  size: number,
): Promise<void> {
  const image = await env.loadAsset(paths.symbol(symbol)).catch(() => undefined)
  if (!image) return

  // Sombra suave, como en las cartas impresas.
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = size * 0.06
  ctx.shadowOffsetX = size * 0.04
  ctx.shadowOffsetY = size * 0.06
  ctx.drawImage(image, x, y, size, size)
  ctx.restore()
}

/** Color y sombra con los que se pinta un texto en una variante concreta. */
interface DrawStyle {
  color?: string
  shadow?: boolean
}

interface OneLineOptions extends DrawStyle {
  maxWidth?: number
}

function drawOneLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: TextBox,
  scale: Scale,
  { maxWidth, color, shadow }: OneLineOptions = {},
): void {
  if (text.trim() === '') return

  const target = px(box, scale)
  const nominal = box.size * scale.height
  const limit = Math.max(nominal * 0.5, maxWidth ?? target.width)

  ctx.save()
  ctx.font = fontString(box, nominal)
  ctx.fillStyle = color ?? box.color ?? '#000000'
  ctx.textBaseline = 'alphabetic'

  const { scaleX, fontSize: size } = condenseToWidth(
    ctx.measureText(text).width,
    limit,
    nominal,
  )
  if (size !== nominal) ctx.font = fontString(box, size)
  if (shadow) applyTextShadow(ctx, size)

  // La caja da el alto de la línea: la base va donde queda el texto centrado.
  const baseline = target.y + target.height * (box.middle ? 0.5 : 1) + size * 0.34

  let x = target.x
  if (box.align === 'center') x = target.x + target.width / 2
  else if (box.align === 'right') x = target.x + target.width

  ctx.textAlign = box.align ?? 'left'
  ctx.translate(x, baseline)
  ctx.scale(scaleX, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/**
 * Etiqueta libre bajo el nombre, en cursiva, como el subtítulo que traen
 * algunas cartas oficiales (un apodo, la carta de la que sale el proxy…).
 * Va pegada al filo de abajo del título y con su mismo ancho: sigue la barra
 * de arriba en vez de ser una pastilla suelta flotando en la ilustración.
 */
function drawNote(
  ctx: CanvasRenderingContext2D,
  text: string | undefined,
  box: TextBox,
  scale: Scale,
  accent: string,
): void {
  // Un diseño guardado antes de que existiera este campo llega sin él: mejor no
  // pintar la etiqueta que reventar la carta entera.
  if (!text || text.trim() === '') return

  const target = px(box, scale)
  const nominal = box.size * scale.height
  const padding = nominal * 0.55

  ctx.save()
  ctx.font = fontString(box, nominal, true)

  const { scaleX, fontSize: size, width: textWidth } = condenseToWidth(
    ctx.measureText(text).width,
    target.width - padding * 2,
    nominal,
  )
  if (size !== nominal) ctx.font = fontString(box, size, true)

  const pillWidth = Math.min(target.width, textWidth + padding * 2)
  const pillX = target.x + (target.width - pillWidth) / 2

  roundedRect(ctx, pillX, target.y, pillWidth, target.height, target.height * 0.35)
  ctx.fillStyle = 'rgba(0,0,0,0.62)'
  ctx.fill()
  // El borde va del color del marco: es lo que hace que la cajita se lea como
  // una continuación de la barra del nombre y no como un rótulo suelto.
  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(1, nominal * 0.09)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.translate(target.x + target.width / 2, target.y + target.height * 0.5 + size * 0.34)
  ctx.scale(scaleX, 1)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/**
 * Rectángulo redondeado a mano. `ctx.roundRect` no está en todas las
 * implementaciones de canvas que usamos, y esto son cuatro líneas.
 */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

/**
 * Sombra oscura bajo el texto claro. Sin ella, un texto blanco sobre una
 * ilustración clara desaparece.
 */
function applyTextShadow(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = size * 0.14
  ctx.shadowOffsetX = size * 0.03
  ctx.shadowOffsetY = size * 0.03
}

/** Línea inferior de artista e información, en blanco sobre el borde negro. */
function drawInfoLine(
  ctx: CanvasRenderingContext2D,
  design: ProxyDesign,
  infoBox: TextBox,
  scale: Scale,
): void {
  const parts = [design.text.info, design.text.artist ? `— ${design.text.artist}` : '']
    .filter((p) => p.trim() !== '')
    .join('   ')
  if (parts === '') return

  // Siempre lleva sombra: en la variante sin bordes cae encima del arte.
  drawOneLine(ctx, parts, infoBox, scale, { shadow: true })
}

async function drawRules(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  set: FrameSet,
  variant: VariantSpec,
  rulesBox: TextBox,
  scale: Scale,
): Promise<void> {
  const tokens = tokenize(design.text.oracle, { flavor: design.text.flavor })
  if (tokens.length === 0) return

  const style: DrawStyle = {
    ...(variant.textColor?.rules ? { color: variant.textColor.rules } : {}),
    ...(variant.textShadow ? { shadow: true } : {}),
  }

  const box = px(rulesBox, scale)
  const nominal = rulesBox.size * scale.height

  const measureText = (text: string, fontSize: number, italic: boolean) => {
    ctx.font = fontString(rulesBox, fontSize, italic)
    return ctx.measureText(text).width
  }

  const layout = layoutAutofit(tokens, {
    width: box.width,
    height: box.height,
    fontSize: nominal,
    measureText,
  })

  // El bloque se centra verticalmente en la caja, como en las cartas reales.
  let y = box.y + Math.max(0, (box.height - layout.height) / 2)

  for (const line of layout.lines) {
    y += line.spaceBefore
    if (line.divider) {
      drawDivider(ctx, box.x, y + layout.lineHeight / 2, box.width, style.color)
      y += layout.lineHeight
      continue
    }
    await drawLine(ctx, env, line, rulesBox, layout.fontSize, box.x, y, style)
    y += layout.lineHeight
  }
}

async function drawLine(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  line: Line,
  rulesBox: TextBox,
  fontSize: number,
  x: number,
  y: number,
  style: DrawStyle = {},
): Promise<void> {
  const baseline = y + fontSize * 0.82
  let cursor = x

  for (const item of line.items) {
    if (item.kind === 'symbol') {
      const size = symbolWidth(fontSize)
      // Los símbolos se alinean con el centro de la x, no con la base.
      await drawSymbol(ctx, env, item.value, cursor, baseline - size * 0.85, size)
      cursor += item.width
      continue
    }

    ctx.save()
    ctx.font = fontString(rulesBox, fontSize, item.italic)
    ctx.fillStyle = style.color ?? '#000000'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    if (style.shadow) applyTextShadow(ctx, fontSize)
    ctx.fillText(item.value, cursor, baseline)
    if (item.bold) {
      // No hay un tipo de letra en negrita: se simula engrosando el trazo
      // encima del mismo texto (el mismo truco que un «falso negrita» de CSS).
      ctx.lineWidth = fontSize * 0.035
      ctx.strokeStyle = ctx.fillStyle
      ctx.strokeText(item.value, cursor, baseline)
    }
    ctx.restore()
    cursor += item.width
  }
}

/** La rayita que separa reglas de ambientación. */
function drawDivider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  color?: string,
): void {
  ctx.save()
  const inset = width * 0.06
  // Sobre el arte la raya va clara; sobre la caja de texto, oscura.
  const tint = color === undefined ? '0,0,0' : '255,255,255'
  const gradient = ctx.createLinearGradient(x + inset, 0, x + width - inset, 0)
  gradient.addColorStop(0, `rgba(${tint},0)`)
  gradient.addColorStop(0.5, `rgba(${tint},0.55)`)
  gradient.addColorStop(1, `rgba(${tint},0)`)
  ctx.strokeStyle = gradient
  ctx.lineWidth = Math.max(1, width * 0.0025)
  ctx.beginPath()
  ctx.moveTo(x + inset, y)
  ctx.lineTo(x + width - inset, y)
  ctx.stroke()
  ctx.restore()
}

/** El editor lo usa para dibujar el recuadro de la ventana de arte encima. */
export { px as boxToPixels }
