import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ProxyDesign } from '@magic/shared'
import { createNodeEnv } from './env-node.js'
import { M15, artBoxOf } from './frames.js'
import { PREVIEW_WIDTH, boxToPixels, renderCard } from './render.js'

/**
 * Test de regresión de la composición. No compara contra un PNG de referencia
 * (los assets no están en git y cualquier retoque de las texturas lo rompería),
 * sino que mira píxeles concretos: si la geometría se descoloca, salta.
 *
 * Necesita los assets: `pnpm assets`. Sin ellos se salta.
 */

const assetDir = join(dirname(fileURLToPath(import.meta.url)), '../assets')
const hasAssets = existsSync(join(assetDir, 'm15/regular/m15FrameR.png'))

const design = (overrides: Partial<ProxyDesign> = {}): ProxyDesign => ({
  id: 'test',
  layout: 'card',
  frameSet: 'm15',
  variant: 'regular',
  edited: false,
  frameColor: 'red',
  loyalty: '',
  abilities: [],
  chapters: [],
  flags: { legendary: false, nyx: false, stamp: false, showPt: false },
  art: { x: 0, y: 0, scale: 1 },
  text: {
    name: 'Rayo',
    mana: '{R}',
    type: 'Instante',
    oracle: 'Hace 3 puntos de daño a cualquier objetivo.',
    flavor: '',
    note: '',
    pt: '',
    artist: 'Nadie',
    info: 'TST · 1 · C',
  },
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

interface Probe {
  pixel(x: number, y: number): [number, number, number, number]
  /** Cuántos píxeles oscuros hay en una región normalizada. */
  darkCount(box: { x: number; y: number; width: number; height: number }): number
  /** Luminancia media de una región normalizada. */
  mean(box: { x: number; y: number; width: number; height: number }): number
  /** Cuántos píxeles claros hay en una región normalizada. */
  lightCount(box: { x: number; y: number; width: number; height: number }): number
  width: number
  height: number
}

/**
 * Ilustración de prueba de un solo color. Sin arte, las variantes que lo dejan
 * ver por detrás salen negras y no se puede medir nada.
 */
async function solidArt(color: string): Promise<Blob> {
  const env = createNodeEnv({ assetDir })
  const surface = env.createSurface(600, 440)
  surface.ctx.fillStyle = color
  surface.ctx.fillRect(0, 0, 600, 440)
  return surface.toBlob('image/png')
}

async function render(input: ProxyDesign, art?: Blob): Promise<Probe> {
  const env = createNodeEnv({ assetDir })
  const surface = await renderCard(input, env, {
    width: PREVIEW_WIDTH,
    ...(art ? { art } : {}),
  })
  const { width, height } = surface
  const data = surface.ctx.getImageData(0, 0, width, height).data

  const pixel = (x: number, y: number): [number, number, number, number] => {
    const i = (Math.round(y) * width + Math.round(x)) * 4
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0]
  }

  return {
    width,
    height,
    pixel,
    darkCount(box) {
      const target = boxToPixels(box, { width, height })
      let count = 0
      for (let y = target.y; y < target.y + target.height; y += 1) {
        for (let x = target.x; x < target.x + target.width; x += 1) {
          const [r, g, b] = pixel(x, y)
          if (r < 90 && g < 90 && b < 90) count += 1
        }
      }
      return count
    },
    mean(box) {
      const target = boxToPixels(box, { width, height })
      let sum = 0
      let count = 0
      for (let y = target.y; y < target.y + target.height; y += 1) {
        for (let x = target.x; x < target.x + target.width; x += 1) {
          const [r, g, b] = pixel(x, y)
          sum += (r + g + b) / 3
          count += 1
        }
      }
      return count === 0 ? 0 : sum / count
    },
    lightCount(box) {
      const target = boxToPixels(box, { width, height })
      let count = 0
      for (let y = target.y; y < target.y + target.height; y += 1) {
        for (let x = target.x; x < target.x + target.width; x += 1) {
          const [r, g, b] = pixel(x, y)
          if (r > 205 && g > 205 && b > 205) count += 1
        }
      }
      return count
    },
  }
}

const luminance = ([r, g, b]: [number, number, number, number]) => (r + g + b) / 3

describe.skipIf(!hasAssets)('renderCard', () => {
  it('respeta la proporción de una carta', async () => {
    const probe = await render(design())
    expect(probe.width).toBe(PREVIEW_WIDTH)
    // 63 × 88 mm son 0,716 de proporción; toleramos medio por ciento.
    expect(probe.width / probe.height).toBeCloseTo(63 / 88, 2)
  })

  it('deja el borde de la carta negro', async () => {
    const probe = await render(design())
    for (const [x, y] of [
      [4, 4],
      [probe.width - 5, 4],
      [4, probe.height - 5],
      [probe.width - 5, probe.height - 5],
    ] as const) {
      expect(luminance(probe.pixel(x, y))).toBeLessThan(40)
    }
  })

  it('pinta el marco en la zona de la caja de texto', async () => {
    const probe = await render(design({ text: { ...design().text, oracle: '' } }))
    const rules = M15.text.rules
    const center = boxToPixels(rules, { width: probe.width, height: probe.height })
    const pixel = probe.pixel(center.x + center.width / 2, center.y + center.height / 2)
    // La caja de texto del marco rojo es un beige claro, no el negro del fondo.
    expect(luminance(pixel)).toBeGreaterThan(120)
  })

  it('escribe el texto de reglas dentro de su caja', async () => {
    const withText = await render(design())
    const withoutText = await render(design({ text: { ...design().text, oracle: '' } }))

    expect(withText.darkCount(M15.text.rules)).toBeGreaterThan(200)
    expect(withoutText.darkCount(M15.text.rules)).toBe(0)
  })

  it('no se sale de la caja de texto con un texto larguísimo', async () => {
    const long = 'Palabra larguísima que se repite. '.repeat(30)
    const overflowing = await render(design({ text: { ...design().text, oracle: long } }))
    const empty = await render(design({ text: { ...design().text, oracle: '' } }))

    // Justo debajo de la caja de reglas la carta debe verse igual que sin texto:
    // el marco ya es oscuro ahí, así que lo que se compara es la diferencia.
    const below = {
      x: M15.text.rules.x,
      y: M15.text.rules.y + M15.text.rules.height + 0.004,
      width: M15.text.rules.width,
      height: 0.012,
    }
    expect(overflowing.darkCount(below)).toBe(empty.darkCount(below))
    // Y dentro sí hay texto, o el test no probaría nada.
    expect(overflowing.darkCount(M15.text.rules)).toBeGreaterThan(1000)
  })

  it('dibuja la caja de fuerza/resistencia sólo cuando toca', async () => {
    const creature = await render(
      design({
        flags: { legendary: false, nyx: false, stamp: false, showPt: true },
        text: { ...design().text, pt: '3/4' },
      }),
    )
    const instant = await render(design())

    // La caja pálida más el "3/4" cambian mucho esa esquina, que en un instante
    // es el marco oscuro de siempre.
    expect(creature.darkCount(M15.text.pt)).toBeLessThan(instant.darkCount(M15.text.pt) - 500)
  })

  it('dibuja la corona de legendaria por encima del título', async () => {
    const plain = await render(design())
    const legend = await render(
      design({ flags: { legendary: true, nyx: false, stamp: false, showPt: false } }),
    )

    // La corona ocupa la franja entre el borde y la caja del título.
    const strip = { x: 0.3, y: 0.028, width: 0.4, height: 0.014 }
    expect(luminance(plain.pixel(0.5 * plain.width, 0.035 * plain.height))).toBeLessThan(60)
    expect(legend.darkCount(strip)).toBeLessThan(plain.darkCount(strip))
  })

  it('mezcla el segundo color a la derecha en las híbridas', async () => {
    const probe = await render(
      design({
        frameColor: 'white',
        secondColor: 'black',
        text: { ...design().text, oracle: '' },
      }),
    )

    // Medias de dos franjas verticales del marco, no píxeles sueltos: así la
    // prueba no depende de dónde caiga exactamente una caja.
    const strip = (x: number) => ({ x, y: 0.06, width: 0.08, height: 0.88 })
    const left = probe.mean(strip(0.06))
    const right = probe.mean(strip(0.86))

    expect(left).toBeGreaterThan(right + 15)

    // Y sin segundo color las dos franjas se parecen.
    const plain = await render(design({ frameColor: 'white', text: { ...design().text, oracle: '' } }))
    expect(Math.abs(plain.mean(strip(0.06)) - plain.mean(strip(0.86)))).toBeLessThan(15)
  })

  it('no deja que la línea de tipo se meta debajo del símbolo de expansión', async () => {
    // Un símbolo cualquiera de los assets, para no depender de la red.
    const setSymbol = join(assetDir, 'symbols/W.svg')
    const longType = 'Legendary Artifact Creature — Phyrexian Avatar Warrior'

    const withType = await render(design({ setSymbol, text: { ...design().text, type: longType } }))
    const withoutType = await render(design({ setSymbol, text: { ...design().text, type: '' } }))

    // Franja que ocupa el símbolo: desde su borde izquierdo hasta donde acababa
    // la caja del tipo. Si el texto se colara, habría más píxeles oscuros.
    const symbolWidth = (M15.setSymbol.height * withType.height) / withType.width
    const strip = {
      x: M15.setSymbol.x - symbolWidth,
      y: M15.text.type.y,
      width: M15.text.type.x + M15.text.type.width - (M15.setSymbol.x - symbolWidth),
      height: M15.text.type.height,
    }

    expect(withType.darkCount(strip)).toBe(withoutType.darkCount(strip))
    // Y el tipo se ha dibujado, o el test no probaría nada.
    expect(withType.darkCount(M15.text.type)).toBeGreaterThan(withoutType.darkCount(M15.text.type))
  })

  it('las variantes cambian dónde llega el arte', () => {
    // Sin arte no se puede medir en píxeles, así que se comprueba la geometría.
    expect(artBoxOf(M15, 'regular')).toEqual(M15.art)
    expect(artBoxOf(M15, 'extendedArt').height).toBeGreaterThan(M15.art.height)
    expect(artBoxOf(M15, 'borderless')).toEqual({ x: 0, y: 0, width: 1, height: 0.9224 })
  })

  it('la variante sin bordes lleva el arte hasta el canto', async () => {
    const art = await solidArt('#808080')
    const plain = await render(design({ frameColor: 'green' }), art)
    const full = await render(design({ frameColor: 'green', variant: 'borderless' }), art)

    // A media altura, el canto de la carta: negro en la normal, arte en la otra.
    const edge = { x: 0.008, y: 0.4, width: 0.015, height: 0.2 }
    expect(plain.mean(edge)).toBeLessThan(40)
    expect(full.mean(edge)).toBeGreaterThan(90)
  })

  it('escribe el texto de reglas en claro cuando va sobre el arte', async () => {
    const art = await solidArt('#808080')
    const conText = await render(design({ variant: 'borderless' }), art)
    const sinText = await render(
      design({ variant: 'borderless', text: { ...design().text, oracle: '', flavor: '' } }),
      art,
    )

    // Sobre el gris medio, el texto blanco añade píxeles claros.
    expect(conText.lightCount(M15.text.rules)).toBeGreaterThan(
      sinText.lightCount(M15.text.rules) + 200,
    )
    // Y en la variante normal el mismo texto va en negro.
    const plain = await render(design(), art)
    expect(plain.darkCount(M15.text.rules)).toBeGreaterThan(200)
  })

  it('dibuja la cajita de la etiqueta sólo si tiene texto', async () => {
    const art = await solidArt('#808080')
    const conNota = await render(
      design({ text: { ...design().text, note: 'Shivan Dragon' } }),
      art,
    )
    const sinNota = await render(design(), art)

    // La cajita es oscura con el texto en claro, así que aparecen ambos.
    expect(conNota.darkCount(M15.note)).toBeGreaterThan(sinNota.darkCount(M15.note) + 500)
    expect(conNota.lightCount(M15.note)).toBeGreaterThan(sinNota.lightCount(M15.note) + 50)
  })

  it('la etiqueta no se sale de su caja aunque el texto sea larguísimo', async () => {
    const art = await solidArt('#808080')
    const largo = await render(
      design({ text: { ...design().text, note: 'Un nombre absurdamente largo que no cabe ni de lejos' } }),
      art,
    )
    const sin = await render(design(), art)

    // Justo debajo de la caja la carta debe verse igual que sin etiqueta.
    const below = { x: M15.note.x, y: M15.note.y + M15.note.height + 0.003, width: M15.note.width, height: 0.01 }
    expect(largo.darkCount(below)).toBe(sin.darkCount(below))
  })

  it('dibuja la marca de agua de tierra básica', async () => {
    const withMark = await render(
      design({
        frameColor: 'blueLand',
        basicWatermark: 'u',
        text: { ...design().text, oracle: '', mana: '' },
      }),
    )
    const without = await render(
      design({ frameColor: 'blueLand', text: { ...design().text, oracle: '', mana: '' } }),
    )

    const box = M15.basicWatermark
    const center = boxToPixels(box, { width: withMark.width, height: withMark.height })
    const at = (p: Probe) => p.pixel(center.x + center.width / 2, center.y + center.height / 2)

    // El símbolo azul cambia el color del centro de la caja.
    expect(at(withMark)).not.toEqual(at(without))
  })
})
