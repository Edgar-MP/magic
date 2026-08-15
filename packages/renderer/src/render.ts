import type { ArtPlacement, ProxyDesign } from '@magic/shared'
import type { RenderEnv, Surface } from './env.js'
import type { Box, FrameSet, TextBox, VariantSpec } from './frames.js'
import {
  ADVENTURE,
  BATTLE,
  CLASS,
  FONT_FAMILY,
  FRAME_ACCENT,
  FRAME_SETS,
  M15,
  PLANESWALKER,
  SAGA,
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
  if (design.layout === 'planeswalker') return renderPlaneswalkerLayers(design, env, { width })
  if (design.layout === 'saga') return renderSagaLayers(design, env, { width })
  if (design.layout === 'battle') return renderBattleLayers(design, env, { width })
  if (design.layout === 'class') return renderClassLayers(design, env, { width })

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
  if (design.adventure) await drawAdventureBox(ctx, env, design, design.adventure, scale)

  return { overlay, artBox: artBoxOf(set, variant.id), width, height }
}

/**
 * Recuadro de hechizo de aventura: se superpone al arte del marco normal con
 * un segundo hechizo más pequeño (nombre, maná, tipo y reglas), como en las
 * cartas de Throne of Eldraine. No hay marco propio en el juego de assets
 * (ni en CardConjurer, ver `frames.ts`), así que el fondo es un rectángulo
 * semitransparente con el color de maná del hechizo, reutilizando
 * `FRAME_ACCENT` (la misma paleta que ya usa el resto del renderizador para
 * acentos de color) y el mismo degradado de dos colores que `drawFrame` usa
 * para las cartas híbridas.
 */
async function drawAdventureBox(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  adventure: NonNullable<ProxyDesign['adventure']>,
  scale: Scale,
): Promise<void> {
  const box = px(ADVENTURE.box, scale)
  const accent = FRAME_ACCENT[design.frameColor]
  const accent2 =
    design.secondColor && design.secondColor !== design.frameColor
      ? FRAME_ACCENT[design.secondColor]
      : undefined

  ctx.save()
  roundedRect(ctx, box.x, box.y, box.width, box.height, box.height * 0.03)
  ctx.clip()

  // Fondo con el color de acento, a la misma opacidad que las bandas de
  // habilidad de planeswalker (0.5, ver `drawPlaneswalkerAbilities`), más una
  // capa oscura debajo del texto para que se lea igual de bien con cualquier
  // color de acento (algunos, como el blanco, son demasiado claros).
  if (accent2) {
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y)
    gradient.addColorStop(0, accent)
    gradient.addColorStop(1, accent2)
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = accent
  }
  ctx.globalAlpha = 0.55
  ctx.fillRect(box.x, box.y, box.width, box.height)
  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#000000'
  ctx.fillRect(box.x, box.y, box.width, box.height)
  ctx.globalAlpha = 1
  ctx.restore()

  ctx.save()
  roundedRect(ctx, box.x, box.y, box.width, box.height, box.height * 0.03)
  ctx.strokeStyle = accent
  ctx.lineWidth = Math.max(1, scale.height * 0.003)
  ctx.stroke()
  ctx.restore()

  drawOneLine(ctx, adventure.name, ADVENTURE.nameMana, scale, {
    color: '#ffffff',
    shadow: true,
    maxWidth: reservedTitleWidth(adventure.mana, ADVENTURE.nameMana, ADVENTURE.nameMana, scale),
  })
  await drawManaCost(ctx, env, { ...design, text: { ...design.text, mana: adventure.mana } }, ADVENTURE.nameMana, scale)
  drawOneLine(ctx, adventure.type, ADVENTURE.type, scale, { color: '#ffffff', shadow: true })

  const tokens = tokenize(adventure.oracle)
  if (tokens.length === 0) return

  const rulesPx = px(ADVENTURE.oracle, scale)
  const nominal = ADVENTURE.oracle.size * scale.height

  ctx.save()
  ctx.beginPath()
  ctx.rect(rulesPx.x, rulesPx.y, rulesPx.width, rulesPx.height)
  ctx.clip()

  const measureText = (text: string, fontSize: number, italic: boolean) => {
    ctx.font = fontString(ADVENTURE.oracle, fontSize, italic)
    return ctx.measureText(text).width
  }
  const layout = layoutAutofit(tokens, {
    width: rulesPx.width,
    height: rulesPx.height,
    fontSize: nominal,
    minFontSize: nominal * 0.4,
    measureText,
  })

  let y = rulesPx.y + Math.max(0, (rulesPx.height - layout.height) / 2)
  const style: DrawStyle = { color: '#ffffff', shadow: true }
  for (const line of layout.lines) {
    y += line.spaceBefore
    if (line.divider) {
      y += layout.lineHeight
      continue
    }
    await drawLine(ctx, env, line, ADVENTURE.oracle, layout.fontSize, rulesPx.x, y, style)
    y += layout.lineHeight
  }
  ctx.restore()
}

/**
 * Plantilla de planeswalker: sin fuerza/resistencia ni caja de reglas normal,
 * con una caja de habilidades de lealtad (coste + texto, en filas) y un
 * escudo con la lealtad inicial abajo a la derecha.
 */
async function renderPlaneswalkerLayers(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH }: { width?: number } = {},
): Promise<CardLayers> {
  const height = Math.round(width / PLANESWALKER.aspect)

  await env.ensureFonts(['title', 'titleSmallCaps', 'body', 'bodyItalic'])

  const overlay = env.createSurface(width, height)
  const { ctx } = overlay
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = { width, height }

  const frame = await env.loadAsset(paths.planeswalkerFrame(design.frameColor)).catch(() => undefined)
  if (frame) ctx.drawImage(frame, 0, 0, scale.width, scale.height)

  const symbolWidthPx = await drawPlaneswalkerSetSymbol(ctx, env, design, scale)
  drawOneLine(ctx, design.text.name, PLANESWALKER.title, scale, {
    maxWidth: reservedTitleWidth(design.text.mana, PLANESWALKER.title, PLANESWALKER.mana, scale),
  })
  await drawManaCost(ctx, env, design, PLANESWALKER.mana, scale)
  drawOneLine(ctx, design.text.type, PLANESWALKER.type, scale, {
    maxWidth: PLANESWALKER.type.width * scale.width - symbolWidthPx,
  })
  drawNote(ctx, design.text.note, PLANESWALKER.note, scale, FRAME_ACCENT[design.frameColor])
  await drawPlaneswalkerStamp(ctx, env, design, scale)
  await drawPlaneswalkerAbilities(ctx, env, design, scale)
  await drawPlaneswalkerBadges(ctx, env, design, scale)
  drawInfoLine(ctx, design, PLANESWALKER.info, scale)
  drawOneLine(ctx, design.loyalty, PLANESWALKER.loyalty, scale, { color: '#ffffff' })

  return { overlay, artBox: PLANESWALKER.art, width, height }
}

async function drawPlaneswalkerSetSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<number> {
  if (!design.setSymbol) return 0
  const symbol = await env.loadImage(design.setSymbol).catch(() => undefined)
  if (!symbol) return 0

  // `y` es el centro vertical (para que el símbolo quede alineado con la
  // línea de tipo sea cual sea su forma), igual que en el marco normal.
  const box = px(PLANESWALKER.setSymbol, scale)
  const height = box.height
  const width = height * (symbol.width / symbol.height)
  ctx.drawImage(symbol, box.x - width, box.y - height / 2, width, height)
  return Math.max(0, PLANESWALKER.title.width * scale.width - (box.x - width - PLANESWALKER.title.x * scale.width))
}

async function drawPlaneswalkerStamp(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (!design.flags.stamp) return
  const stamp = await env.loadAsset(paths.holoStamp(M15, design.frameColor)).catch(() => undefined)
  if (!stamp) return
  const target = px(PLANESWALKER.holoStamp, scale)
  ctx.drawImage(stamp, target.x, target.y, target.width, target.height)
}

/**
 * Las filas de habilidades se reparten a partes iguales dentro de la caja: no
 * es exactamente el reparto fino de las cartas reales (que ajustan cada fila a
 * mano), pero con 2 a 5 habilidades da un resultado casi idéntico y no hace
 * falta que cada proxy calibre la altura de cada una.
 */
function planeswalkerRows(design: ProxyDesign, scale: Scale): { y: number; height: number }[] {
  const box = px(PLANESWALKER.abilities, scale)
  const count = Math.max(1, design.abilities.length)
  const rowHeight = box.height / count
  return design.abilities.map((_, i) => ({ y: box.y + i * rowHeight, height: rowHeight }))
}

async function drawPlaneswalkerAbilities(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (design.abilities.length === 0) return
  const box = px(PLANESWALKER.abilities, scale)
  const rows = planeswalkerRows(design, scale)

  ctx.save()
  for (const [i, row] of rows.entries()) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    ctx.fillRect(box.x, row.y, box.width, row.height)
  }
  // Las líneas que separan una habilidad de la siguiente.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = Math.max(1, scale.height * 0.0015)
  for (const row of rows.slice(1)) {
    ctx.beginPath()
    ctx.moveTo(box.x, row.y)
    ctx.lineTo(box.x + box.width, row.y)
    ctx.stroke()
  }
  ctx.restore()

  const nominal = scale.height * 0.0262

  // El texto no puede salirse de la caja de habilidades pase lo que pase
  // (muchas habilidades, una muy larga…): se recorta al rectángulo.
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.clip()

  for (const [i, ability] of design.abilities.entries()) {
    const row = rows[i]
    if (!row) continue

    // El texto empieza justo después de la insignia (que se dibuja pegada
    // al borde izquierdo de la carta, no al de esta caja — por eso el punto
    // de partida es `badgeX`, no `box.x`; sumar los dos duplicaba el hueco).
    // Más pequeña cuantas más habilidades hay, así que el hueco se adapta.
    // Con pocas habilidades (una o dos) la fila es muy alta: sin el tope, la
    // insignia crecía sin límite y acababa siendo enorme, más grande que el
    // propio texto de la habilidad.
    const badgeHeight = Math.min(row.height * 0.8, scale.height * 0.068)
    const badgeX = scale.width * 0.03
    const badgeWidth = badgeHeight * 1.4
    const textStartX = badgeX + badgeWidth + scale.width * 0.025
    const rowBox: TextBox = {
      x: textStartX / scale.width,
      y: row.y / scale.height,
      width: (box.x + box.width - textStartX - scale.width * 0.015) / scale.width,
      height: row.height / scale.height,
      size: nominal / scale.height,
      font: 'body',
    }
    const rowPx = px(rowBox, scale)

    const tokens = tokenize(ability.text)
    const measureText = (text: string, fontSize: number, italic: boolean) => {
      ctx.font = fontString(rowBox, fontSize, italic)
      return ctx.measureText(text).width
    }
    const layout = layoutAutofit(tokens, {
      width: rowPx.width,
      height: rowPx.height,
      fontSize: nominal,
      // Con muchas habilidades la fila puede ser muy baja: hay que poder
      // bajar bastante el cuerpo para que el texto quepa partido en líneas
      // en vez de desbordar hacia la siguiente fila.
      minFontSize: nominal * 0.3,
      measureText,
    })
    // Fila clara -> texto negro; fila oscura -> texto blanco. Si no, con la
    // banda a 0.5 de opacidad el negro sobre negro no se lee.
    const style: DrawStyle = i % 2 === 0 ? {} : { color: '#ffffff' }

    let y = rowPx.y + Math.max(0, (rowPx.height - layout.height) / 2)
    for (const line of layout.lines) {
      y += line.spaceBefore
      if (!line.divider) await drawLine(ctx, env, line, rowBox, layout.fontSize, rowPx.x, y, style)
      y += layout.lineHeight
    }
  }
  ctx.restore()
}

async function drawPlaneswalkerBadges(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  const box = px(PLANESWALKER.abilities, scale)
  const rows = planeswalkerRows(design, scale)

  for (const [i, ability] of design.abilities.entries()) {
    const row = rows[i]
    if (!row) continue

    // La insignia cuelga a propósito del borde izquierdo (como en las cartas
    // oficiales), pero nunca debe sobresalir por arriba o por abajo de su
    // propia fila: si no, con pocas habilidades (fila muy alta) o un coste
    // que fuerza la insignia a su tamaño máximo, la punta inferior del
    // escudo se salía por debajo de la caja.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, row.y, box.x + box.width, row.height)
    ctx.clip()

    const sign = ability.cost.trim().startsWith('+')
      ? 'plus'
      : ability.cost.trim().startsWith('-') || ability.cost.trim().startsWith('−')
        ? 'minus'
        : 'neutral'
    const pip = await env.loadAsset(paths.planeswalkerPip(sign)).catch(() => undefined)

    const badgeHeight = Math.min(row.height * 0.8, scale.height * 0.068)
    const badgeWidth = pip ? badgeHeight * (pip.width / pip.height) : badgeHeight * 1.4
    const badgeX = scale.width * 0.03
    const badgeY = row.y + row.height / 2 - badgeHeight / 2

    if (pip) ctx.drawImage(pip, badgeX, badgeY, badgeWidth, badgeHeight)

    ctx.save()
    const nominal = badgeHeight * 0.52
    ctx.font = `${nominal}px "${FONT_FAMILY.titleSmallCaps}"`
    // El coste puede tener más de un carácter (`+10`, `-13`, `X`…): si no
    // cupiera en la insignia, se encoge en vez de salirse de ella.
    const { scaleX, fontSize } = condenseToWidth(
      ctx.measureText(ability.cost).width,
      badgeWidth * 0.74,
      nominal,
    )
    if (fontSize !== nominal) ctx.font = `${fontSize}px "${FONT_FAMILY.titleSmallCaps}"`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    // La insignia de "menos" es la de "más" al revés: la parte ancha (donde
    // cabe el número) queda arriba en vez de abajo. Con el mismo desplazamiento
    // hacia abajo que a la de "más", el número se salía por la punta inferior.
    const textX = badgeX + badgeWidth / 2
    const textY = row.y + row.height / 2 + badgeHeight * (sign === 'minus' ? 0.03 : 0.18)
    ctx.translate(textX, textY)
    ctx.scale(scaleX, 1)
    ctx.fillText(ability.cost, 0, 0)
    ctx.restore()
    ctx.restore()
  }
}

/**
 * Plantilla de saga: pergamino con el arte a la derecha en vez de arriba, y
 * una cinta dorada vertical a la izquierda del texto con el número romano de
 * cada capítulo en una insignia hexagonal.
 */
async function renderSagaLayers(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH }: { width?: number } = {},
): Promise<CardLayers> {
  const height = Math.round(width / SAGA.aspect)

  await env.ensureFonts(['title', 'titleSmallCaps', 'body', 'bodyItalic'])

  const overlay = env.createSurface(width, height)
  const { ctx } = overlay
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = { width, height }

  const frame = await env.loadAsset(paths.sagaFrame(design.frameColor)).catch(() => undefined)
  if (frame) ctx.drawImage(frame, 0, 0, scale.width, scale.height)

  const symbolWidthPx = await drawSagaSetSymbol(ctx, env, design, scale)
  drawOneLine(ctx, design.text.name, SAGA.title, scale, {
    maxWidth: reservedTitleWidth(design.text.mana, SAGA.title, SAGA.mana, scale),
  })
  await drawManaCost(ctx, env, design, SAGA.mana, scale)
  drawOneLine(ctx, design.text.type, SAGA.type, scale, {
    maxWidth: SAGA.type.width * scale.width - symbolWidthPx,
  })
  drawNote(ctx, design.text.note, SAGA.note, scale, FRAME_ACCENT[design.frameColor])
  await drawSagaChapters(ctx, env, design, scale)
  drawInfoLine(ctx, design, SAGA.info, scale)

  return { overlay, artBox: SAGA.art, width, height }
}

async function drawSagaSetSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<number> {
  if (!design.setSymbol) return 0
  const symbol = await env.loadImage(design.setSymbol).catch(() => undefined)
  if (!symbol) return 0

  const box = px(SAGA.setSymbol, scale)
  const height = box.height
  const width = height * (symbol.width / symbol.height)
  ctx.drawImage(symbol, box.x - width, box.y - height / 2, width, height)
  return Math.max(0, SAGA.type.width * scale.width - (box.x - width - SAGA.type.x * scale.width))
}

/**
 * Filas de capítulos repartidas a partes iguales dentro de la cinta, igual
 * que `planeswalkerRows` reparte las habilidades de lealtad.
 */
function sagaRows(design: ProxyDesign, scale: Scale): { y: number; height: number }[] {
  const box = px(SAGA.chapters, scale)
  const count = Math.max(1, design.chapters.length)
  const rowHeight = box.height / count
  return design.chapters.map((_, i) => ({ y: box.y + i * rowHeight, height: rowHeight }))
}

async function drawSagaChapters(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (design.chapters.length === 0) return

  const box = px(SAGA.chapters, scale)
  const badgeBox = px({ x: SAGA.chapterBadge.x, y: SAGA.chapters.y, width: SAGA.chapterBadge.width, height: SAGA.chapters.height }, scale)
  const textBox = px({ x: SAGA.chapterText.x, y: SAGA.chapters.y, width: SAGA.chapterText.width, height: SAGA.chapters.height }, scale)
  const rows = sagaRows(design, scale)
  const badge = await env.loadAsset(paths.sagaChapterBadge()).catch(() => undefined)

  // El texto no puede salirse de la caja de capítulos pase lo que pase.
  ctx.save()
  ctx.beginPath()
  ctx.rect(textBox.x, box.y, textBox.width, box.height)
  ctx.clip()

  const nominal = scale.height * 0.0262

  for (const [i, chapter] of design.chapters.entries()) {
    const row = rows[i]
    if (!row) continue

    const rowBox: TextBox = {
      x: SAGA.chapterText.x,
      y: row.y / scale.height,
      width: SAGA.chapterText.width,
      height: row.height / scale.height,
      size: nominal / scale.height,
      font: 'body',
    }
    const rowPx = px(rowBox, scale)

    const tokens = tokenize(chapter.text)
    const measureText = (text: string, fontSize: number, italic: boolean) => {
      ctx.font = fontString(rowBox, fontSize, italic)
      return ctx.measureText(text).width
    }
    const layout = layoutAutofit(tokens, {
      width: rowPx.width,
      height: rowPx.height,
      fontSize: nominal,
      minFontSize: nominal * 0.3,
      measureText,
    })

    let y = rowPx.y + Math.max(0, (rowPx.height - layout.height) / 2)
    for (const line of layout.lines) {
      y += line.spaceBefore
      if (!line.divider) await drawLine(ctx, env, line, rowBox, layout.fontSize, rowPx.x, y)
      y += layout.lineHeight
    }
  }
  ctx.restore()

  // Separadores finos entre capítulos, como el borde inferior de cada fila.
  ctx.save()
  ctx.strokeStyle = 'rgba(120,95,40,0.35)'
  ctx.lineWidth = Math.max(1, scale.height * 0.0012)
  for (const row of rows.slice(1)) {
    ctx.beginPath()
    ctx.moveTo(textBox.x, row.y)
    ctx.lineTo(textBox.x + textBox.width, row.y)
    ctx.stroke()
  }
  ctx.restore()

  if (!badge) return
  for (const [i, chapter] of design.chapters.entries()) {
    const row = rows[i]
    if (!row) continue

    // La insignia tiene que caber en el ancho real de la cinta dorada: si se
    // dimensiona sólo por alto (como en planeswalker), en cintas estrechas se
    // sale por encima del texto de al lado.
    const badgeWidth = Math.min(badgeBox.width * 0.94, row.height * 0.82 * (badge.width / badge.height))
    const badgeHeight = badgeWidth * (badge.height / badge.width)
    const badgeX = badgeBox.x + badgeBox.width / 2 - badgeWidth / 2
    const badgeY = row.y + row.height / 2 - badgeHeight / 2
    ctx.drawImage(badge, badgeX, badgeY, badgeWidth, badgeHeight)

    ctx.save()
    const nominal = badgeHeight * 0.4
    ctx.font = `${nominal}px "${FONT_FAMILY.titleSmallCaps}"`
    const { scaleX, fontSize } = condenseToWidth(
      ctx.measureText(chapter.chapter).width,
      badgeWidth * 0.72,
      nominal,
    )
    if (fontSize !== nominal) ctx.font = `${fontSize}px "${FONT_FAMILY.titleSmallCaps}"`
    ctx.fillStyle = '#3a2c0f'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.translate(badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + nominal * 0.34)
    ctx.scale(scaleX, 1)
    ctx.fillText(chapter.chapter, 0, 0)
    ctx.restore()
  }
}

/**
 * Plantilla de Class: mismo pergamino de Saga pero con el arte a la
 * izquierda y la columna de niveles a la derecha. A diferencia de Saga no
 * hay numeral romano en una insignia: cada nivel salvo el primero abre con
 * una barra divisoria dorada (el asset `class/header.png`) con su coste de
 * mejora a la izquierda y la etiqueta de nivel («Level 2»…) a la derecha,
 * calcada de cómo se ve en una Class real (comprobado contra Wizard Class de
 * Scryfall).
 */
async function renderClassLayers(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH }: { width?: number } = {},
): Promise<CardLayers> {
  const height = Math.round(width / CLASS.aspect)

  await env.ensureFonts(['title', 'titleSmallCaps', 'body', 'bodyItalic'])

  const overlay = env.createSurface(width, height)
  const { ctx } = overlay
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = { width, height }

  const frame = await env.loadAsset(paths.classFrame(design.frameColor)).catch(() => undefined)
  if (frame) ctx.drawImage(frame, 0, 0, scale.width, scale.height)

  const symbolWidthPx = await drawClassSetSymbol(ctx, env, design, scale)
  drawOneLine(ctx, design.text.name, CLASS.title, scale, {
    maxWidth: reservedTitleWidth(design.text.mana, CLASS.title, CLASS.mana, scale),
  })
  await drawManaCost(ctx, env, design, CLASS.mana, scale)
  drawOneLine(ctx, design.text.type, CLASS.type, scale, {
    maxWidth: CLASS.type.width * scale.width - symbolWidthPx,
  })
  drawNote(ctx, design.text.note, CLASS.note, scale, FRAME_ACCENT[design.frameColor])
  await drawClassLevels(ctx, env, design, scale)
  drawInfoLine(ctx, design, CLASS.info, scale)

  return { overlay, artBox: CLASS.art, width, height }
}

async function drawClassSetSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<number> {
  if (!design.setSymbol) return 0
  const symbol = await env.loadImage(design.setSymbol).catch(() => undefined)
  if (!symbol) return 0

  const box = px(CLASS.setSymbol, scale)
  const symbolHeight = box.height
  const symbolW = symbolHeight * (symbol.width / symbol.height)
  ctx.drawImage(symbol, box.x - symbolW, box.y - symbolHeight / 2, symbolW, symbolHeight)
  return Math.max(0, CLASS.type.width * scale.width - (box.x - symbolW - CLASS.type.x * scale.width))
}

/**
 * Filas de niveles repartidas a partes iguales dentro de la columna, igual
 * que `sagaRows` reparte los capítulos.
 */
function classRows(design: ProxyDesign, scale: Scale): { y: number; height: number }[] {
  const box = px(CLASS.levels, scale)
  const count = Math.max(1, design.levels.length)
  const rowHeight = box.height / count
  return design.levels.map((_, i) => ({ y: box.y + i * rowHeight, height: rowHeight }))
}

async function drawClassLevels(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (design.levels.length === 0) return

  const box = px(CLASS.levels, scale)
  const rows = classRows(design, scale)
  const divider = await env.loadAsset(paths.classDivider()).catch(() => undefined)

  // El texto no puede salirse de la columna pase lo que pase.
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.width, box.height)
  ctx.clip()

  const nominal = scale.height * 0.0262
  // Alto de la barra divisoria: proporcional al ancho de la columna (misma
  // relación de aspecto que `class/header.png`, 633×101), con un tope para
  // que en niveles con poca altura de fila no se coma todo el sitio del texto.
  const dividerAspect = 101 / 633

  for (const [i, level] of design.levels.entries()) {
    const row = rows[i]
    if (!row) continue

    const dividerHeight = i === 0 ? 0 : Math.min(box.width * dividerAspect, row.height * 0.34)

    if (i > 0 && divider) {
      ctx.drawImage(divider, box.x, row.y, box.width, dividerHeight)

      const manaBoxPx: TextBox = {
        x: CLASS.levels.x,
        y: row.y / scale.height,
        width: (CLASS.levels.width * 0.55),
        height: dividerHeight / scale.height,
        size: (dividerHeight * 0.62) / scale.height,
        font: 'title',
      }
      await drawManaCostString(ctx, env, level.cost, manaBoxPx, scale)

      if (level.typeLine.trim() !== '') {
        const labelBox: TextBox = {
          x: CLASS.levels.x,
          y: row.y / scale.height,
          width: CLASS.levels.width,
          height: dividerHeight / scale.height,
          size: (dividerHeight * 0.42) / scale.height,
          font: 'title',
          align: 'right',
          oneLine: true,
          middle: true,
        }
        drawOneLine(ctx, level.typeLine, labelBox, scale, { color: '#1a1a1a' })
      }
    }

    const rowBox: TextBox = {
      x: CLASS.levels.x,
      y: (row.y + dividerHeight) / scale.height,
      width: CLASS.levels.width,
      height: (row.height - dividerHeight) / scale.height,
      size: nominal / scale.height,
      font: 'body',
    }
    const rowPx = px(rowBox, scale)

    const tokens = tokenize(level.text)
    const measureText = (text: string, fontSize: number, italic: boolean) => {
      ctx.font = fontString(rowBox, fontSize, italic)
      return ctx.measureText(text).width
    }
    const layout = layoutAutofit(tokens, {
      width: rowPx.width,
      height: rowPx.height,
      fontSize: nominal,
      minFontSize: nominal * 0.3,
      measureText,
    })

    let y = rowPx.y + Math.max(0, (rowPx.height - layout.height) / 2)
    for (const line of layout.lines) {
      y += line.spaceBefore
      if (!line.divider) await drawLine(ctx, env, line, rowBox, layout.fontSize, rowPx.x, y)
      y += layout.lineHeight
    }
  }
  ctx.restore()

  // Separadores finos entre niveles, como en Saga.
  ctx.save()
  ctx.strokeStyle = 'rgba(120,95,40,0.35)'
  ctx.lineWidth = Math.max(1, scale.height * 0.0012)
  for (const row of rows.slice(1)) {
    ctx.beginPath()
    ctx.moveTo(box.x, row.y)
    ctx.lineTo(box.x + box.width, row.y)
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Plantilla de Battle: apaisada, con el arte arriba, la franja de tipo y un
 * panel de reglas opaco abajo, y la insignia de defensa (una estrella de
 * ocho puntas ya recortada en el marco) en la esquina inferior derecha.
 */
async function renderBattleLayers(
  design: ProxyDesign,
  env: RenderEnv,
  { width = PREVIEW_WIDTH }: { width?: number } = {},
): Promise<CardLayers> {
  const height = Math.round(width / BATTLE.aspect)

  await env.ensureFonts(['title', 'titleSmallCaps', 'body', 'bodyItalic'])

  const overlay = env.createSurface(width, height)
  const { ctx } = overlay
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = { width, height }

  const frame = await env.loadAsset(paths.battleFrame(design.frameColor)).catch(() => undefined)
  if (frame) ctx.drawImage(frame, 0, 0, scale.width, scale.height)

  const symbolWidthPx = await drawBattleSetSymbol(ctx, env, design, scale)
  drawOneLine(ctx, design.text.name, BATTLE.title, scale, {
    maxWidth: reservedTitleWidth(design.text.mana, BATTLE.title, BATTLE.mana, scale),
  })
  await drawManaCost(ctx, env, design, BATTLE.mana, scale)
  drawOneLine(ctx, design.text.type, BATTLE.type, scale, {
    maxWidth: BATTLE.type.width * scale.width - symbolWidthPx,
  })
  drawNote(ctx, design.text.note, BATTLE.note, scale, FRAME_ACCENT[design.frameColor])
  await drawBattleStamp(ctx, env, design, scale)
  await drawBattleRules(ctx, env, design, scale)
  await drawBattleDefense(ctx, env, design, scale)
  drawInfoLine(ctx, design, BATTLE.info, scale)

  return { overlay, artBox: BATTLE.art, width, height }
}

async function drawBattleSetSymbol(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<number> {
  if (!design.setSymbol) return 0
  const symbol = await env.loadImage(design.setSymbol).catch(() => undefined)
  if (!symbol) return 0

  const box = px(BATTLE.setSymbol, scale)
  const height = box.height
  const width = height * (symbol.width / symbol.height)
  ctx.drawImage(symbol, box.x - width, box.y - height / 2, width, height)
  return Math.max(0, BATTLE.type.width * scale.width - (box.x - width - BATTLE.type.x * scale.width))
}

async function drawBattleStamp(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (!design.flags.stamp) return
  const stamp = await env.loadAsset('battle/holostamp.png').catch(() => undefined)
  if (!stamp) return
  const target = px(BATTLE.holoStamp, scale)
  ctx.drawImage(stamp, target.x, target.y, target.width, target.height)
}

/** Texto de reglas normal (sin capítulos ni habilidades), en el panel inferior. */
async function drawBattleRules(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  const tokens = tokenize(design.text.oracle, { flavor: design.text.flavor })
  if (tokens.length === 0) return

  const box = px(BATTLE.rules, scale)
  const nominal = BATTLE.rules.size * scale.height

  const measureText = (text: string, fontSize: number, italic: boolean) => {
    ctx.font = fontString(BATTLE.rules, fontSize, italic)
    return ctx.measureText(text).width
  }

  const layout = layoutAutofit(tokens, {
    width: box.width,
    height: box.height,
    fontSize: nominal,
    measureText,
  })

  let y = box.y + Math.max(0, (box.height - layout.height) / 2)
  for (const line of layout.lines) {
    y += line.spaceBefore
    if (line.divider) {
      drawDivider(ctx, box.x, y + layout.lineHeight / 2, box.width)
      y += layout.lineHeight
      continue
    }
    await drawLine(ctx, env, line, BATTLE.rules, layout.fontSize, box.x, y)
    y += layout.lineHeight
  }
}

/**
 * Casillas de defensa iniciales: el marco ya trae la estrella recortada
 * (transparente), así que primero se rellena de un color liso a través de su
 * máscara —igual que `fillMasked` con el borde o la corona de legendaria— y
 * luego se escribe el número encima, en blanco.
 */
async function drawBattleDefense(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  design: ProxyDesign,
  scale: Scale,
): Promise<void> {
  if (design.defense.trim() === '') return

  const mask = await env.loadAsset(paths.battleDefenseMask()).catch(() => undefined)
  if (mask) fillMasked(ctx, env, '#1a1a1a', mask, scale)

  drawOneLine(ctx, design.defense, BATTLE.defense, scale, { color: '#ffffff' })
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
      maxWidth: reservedTitleWidth(design.text.mana, title, mana, scale),
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
  manaCost: string,
  title: TextBox,
  mana: TextBox | undefined,
  scale: Scale,
): number {
  const width = title.width * scale.width
  const symbols = tokenizeManaCost(manaCost).length
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
  await drawManaCostString(ctx, env, design.text.mana, manaBox, scale)
}

/**
 * Igual que `drawManaCost`, pero para un coste suelto que no viene de
 * `design.text.mana` — el coste de mejora de un nivel de Class, por ejemplo.
 */
async function drawManaCostString(
  ctx: CanvasRenderingContext2D,
  env: RenderEnv,
  manaCost: string,
  manaBox: TextBox,
  scale: Scale,
): Promise<void> {
  const symbols = tokenizeManaCost(manaCost)
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
