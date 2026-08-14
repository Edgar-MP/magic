import type { Card, Color, FrameColor, PlaneswalkerAbility, ProxyDesign } from '@magic/shared'
import { hasType, isBasicLand, isLegendary } from '@magic/shared'

/**
 * Convierte una carta de Scryfall en un diseño editable. Es el puente entre los
 * dos módulos: eliges una carta real del mazo y sale un proxy con todo relleno,
 * listo para cambiarle la ilustración.
 */

const COLOR_FRAME: Record<Color, FrameColor> = {
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green',
}

const LAND_FRAME: Record<Color, FrameColor> = {
  W: 'whiteLand',
  U: 'blueLand',
  B: 'blackLand',
  R: 'redLand',
  G: 'greenLand',
}

export interface FrameChoice {
  frameColor: FrameColor
  secondColor?: FrameColor
}

/** ¿Es híbrida? Su coste lleva símbolos con barra: `{G/U}`. */
function isHybrid(card: Card): boolean {
  const cost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? ''
  // `{2/R}` (maná híbrido monocolor) también cuenta.
  return /\{[^}]*\/[^}P]\}/.test(cost) || /\{\d+\/[WUBRG]\}/.test(cost)
}

/**
 * Elige el marco como lo hacen las cartas impresas:
 *  - una tierra usa la textura de tierra, con el color de lo que produce
 *  - un vehículo tiene su propio marco
 *  - un artefacto sin color va con marco de artefacto
 *  - dos colores van en oro, salvo las híbridas, que mezclan los dos colores
 *  - tres o más colores van en oro
 */
export function chooseFrame(card: Card): FrameChoice {
  const colors = card.colors ?? card.card_faces?.[0]?.colors ?? []
  const land = hasType(card, 'Land')

  if (land) {
    // Una tierra se pinta con su identidad de color, no con `colors` (que suele
    // estar vacío en las tierras).
    const identity = card.color_identity
    if (identity.length === 1 && identity[0]) return { frameColor: LAND_FRAME[identity[0]] }
    if (identity.length === 2 && identity[0] && identity[1]) {
      return { frameColor: LAND_FRAME[identity[0]], secondColor: LAND_FRAME[identity[1]] }
    }
    if (identity.length >= 3) return { frameColor: 'goldLand' }
    return { frameColor: 'colorlessLand' }
  }

  if (hasType(card, 'Vehicle')) return { frameColor: 'vehicle' }

  if (colors.length === 0) {
    return { frameColor: hasType(card, 'Artifact') ? 'artifact' : 'colorless' }
  }
  if (colors.length === 1 && colors[0]) return { frameColor: COLOR_FRAME[colors[0]] }
  if (colors.length === 2 && colors[0] && colors[1] && isHybrid(card)) {
    return { frameColor: COLOR_FRAME[colors[0]], secondColor: COLOR_FRAME[colors[1]] }
  }
  return { frameColor: 'gold' }
}

/** ¿Lleva sello holográfico? Sólo las raras y míticas modernas. */
function wantsStamp(card: Card): boolean {
  return card.rarity === 'rare' || card.rarity === 'mythic'
}

/** `3/4`, o vacío si la carta no tiene fuerza/resistencia. */
function ptOf(card: Card): string {
  const face = card.card_faces?.[0]
  const power = card.power ?? face?.power
  const toughness = card.toughness ?? face?.toughness
  if (power === undefined || toughness === undefined) {
    // Los planeswalkers usan la misma caja para la lealtad.
    const loyalty = card.loyalty ?? face?.loyalty
    return loyalty ?? ''
  }
  return `${power}/${toughness}`
}

/**
 * El oracle de un planeswalker es una habilidad por línea, cada una con su
 * coste de lealtad delante (`+1: …`, `−3: …`, `0: …`). Scryfall usa el signo
 * menos de verdad (`−`, U+2212), no un guion.
 */
const ABILITY_LINE = /^([+−-]?(?:X|\d+))\s*:\s*(.+)$/su

function planeswalkerAbilitiesOf(card: Card): PlaneswalkerAbility[] {
  const oracle = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? ''
  const abilities: PlaneswalkerAbility[] = []

  for (const line of oracle.split('\n')) {
    const match = ABILITY_LINE.exec(line.trim())
    if (match?.[1] && match[2]) {
      abilities.push({ cost: match[1].replace('−', '-'), text: match[2] })
    }
  }
  return abilities
}

/** Línea inferior: `M10 · 146 · ES`, como la de las cartas reales. */
function infoLine(card: Card): string {
  return [card.set.toUpperCase(), card.collector_number, card.rarity?.[0]?.toUpperCase()]
    .filter(Boolean)
    .join(' · ')
}

export interface CardToDesignOptions {
  id: string
  now: number
  /** Usa la ilustración oficial de Scryfall como punto de partida. */
  useOfficialArt?: boolean
}

export function cardToDesign(
  card: Card,
  { id, now, useOfficialArt = true }: CardToDesignOptions,
): ProxyDesign {
  const face = card.card_faces?.[0]
  const frame = chooseFrame(card)
  const pt = ptOf(card)
  const watermark = basicWatermarkOf(card)
  const planeswalker = hasType(card, 'Planeswalker')
  const abilities = planeswalker ? planeswalkerAbilitiesOf(card) : []
  const loyalty = card.loyalty ?? face?.loyalty ?? ''

  const artUrl = useOfficialArt
    ? (card.image_uris?.art_crop ?? face?.image_uris?.art_crop)
    : undefined

  return {
    id,
    sourceCardId: card.id,
    layout: planeswalker ? 'planeswalker' : 'card',
    frameSet: 'm15',
    variant: 'regular',
    edited: false,
    frameColor: frame.frameColor,
    ...(frame.secondColor ? { secondColor: frame.secondColor } : {}),
    flags: {
      legendary: isLegendary(card),
      // El marco de Nyx es para los encantamientos legendarios de Theros; no hay
      // forma de saberlo desde los datos, así que se deja al usuario.
      nyx: false,
      stamp: wantsStamp(card),
      showPt: pt !== '',
    },
    art: {
      ...(artUrl ? { url: artUrl } : {}),
      x: 0,
      y: 0,
      scale: 1,
    },
    ...(watermark ? { basicWatermark: watermark } : {}),
    text: {
      name: card.name.split(' // ')[0] ?? card.name,
      mana: card.mana_cost ?? face?.mana_cost ?? '',
      type: card.type_line ?? face?.type_line ?? '',
      // Las básicas llevan el símbolo grande en vez del `({T}: Add {U}.)` que
      // Scryfall pone como texto de reglas.
      oracle: watermark ? '' : (card.oracle_text ?? face?.oracle_text ?? ''),
      flavor: card.flavor_text ?? face?.flavor_text ?? '',
      // La etiqueta la escribe quien haga el proxy: en blanco por defecto.
      note: '',
      pt,
      artist: card.artist ?? face?.artist ?? '',
      info: infoLine(card),
    },
    loyalty,
    abilities,
    createdAt: now,
    updatedAt: now,
  }
}

/** Marca de agua de tierra básica que corresponde a la carta, si es una. */
export function basicWatermarkOf(card: Card): 'w' | 'u' | 'b' | 'r' | 'g' | 'c' | undefined {
  if (!isBasicLand(card)) return undefined
  const [color] = card.color_identity
  if (!color) return 'c'
  return ({ W: 'w', U: 'u', B: 'b', R: 'r', G: 'g' } as const)[color]
}
