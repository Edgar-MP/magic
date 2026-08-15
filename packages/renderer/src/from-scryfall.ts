import type {
  Adventure,
  Card,
  ClassLevel,
  Color,
  FrameColor,
  PlaneswalkerAbility,
  ProxyDesign,
  SagaChapter,
} from '@magic/shared'
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

function abilitiesFrom(oracle: string): PlaneswalkerAbility[] {
  const abilities: PlaneswalkerAbility[] = []
  for (const line of oracle.split('\n')) {
    const match = ABILITY_LINE.exec(line.trim())
    if (match?.[1] && match[2]) {
      abilities.push({ cost: match[1].replace('−', '-'), text: match[2] })
    }
  }
  return abilities
}

function planeswalkerAbilitiesOf(card: Card): PlaneswalkerAbility[] {
  const printed = card.printed_text ?? card.card_faces?.[0]?.printed_text ?? ''
  const fromPrinted = printed ? abilitiesFrom(printed) : []
  if (fromPrinted.length > 0) return fromPrinted

  const oracle = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? ''
  return abilitiesFrom(oracle)
}

/**
 * El oracle de una saga es un capítulo por línea, con su número (o rango de
 * números, cuando varios capítulos comparten efecto: `I, II — …`) delante de
 * una raya larga (`—`, em dash, no un guion normal).
 */
const CHAPTER_LINE = /^([IVX]+(?:\s*,\s*[IVX]+)*)\s*—\s*(.+)$/su

function chaptersFrom(oracle: string): SagaChapter[] {
  const chapters: SagaChapter[] = []
  for (const line of oracle.split('\n')) {
    const match = CHAPTER_LINE.exec(line.trim())
    if (match?.[1] && match[2]) {
      chapters.push({ chapter: match[1].replace(/\s*,\s*/g, ', '), text: match[2] })
    }
  }
  return chapters
}

function sagaChaptersOf(card: Card): SagaChapter[] {
  const printed = card.printed_text ?? card.card_faces?.[0]?.printed_text ?? ''
  const fromPrinted = printed ? chaptersFrom(printed) : []
  if (fromPrinted.length > 0) return fromPrinted

  const oracle = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? ''
  return chaptersFrom(oracle)
}

/**
 * El oracle de una Class (comprobado contra Scryfall real, «Wizard Class» /
 * «Ranger Class»: a diferencia de Saga/Battle/Adventure, NO es de doble cara
 * — todo vive en el `oracle_text` de la raíz, un solo bloque) es el texto del
 * nivel 1 (con su recordatorio entre paréntesis) seguido de una línea
 * `{coste}: Level N` por cada nivel siguiente, con el texto de ese nivel
 * debajo hasta la próxima línea de coste o el final.
 */
const LEVEL_LINE = /^(\{[^}]+\}(?:\{[^}]+\})*)\s*:\s*Level\s*\d+\s*$/u

function levelsFrom(oracle: string): ClassLevel[] {
  const lines = oracle.split('\n')

  const levels: ClassLevel[] = [{ cost: '', typeLine: '', text: '' }]
  let currentText: string[] = []
  let found = false

  for (const line of lines) {
    const match = LEVEL_LINE.exec(line.trim())
    if (match?.[1]) {
      found = true
      const current = levels[levels.length - 1]
      if (current) current.text = currentText.join('\n')
      currentText = []
      const levelNumber = levels.length + 1
      levels.push({ cost: match[1], typeLine: `Level ${levelNumber}`, text: '' })
      continue
    }
    currentText.push(line)
  }
  const last = levels[levels.length - 1]
  if (last) last.text = currentText.join('\n')

  return found ? levels : []
}

function classLevelsOf(card: Card): ClassLevel[] {
  const printed = card.printed_text ?? ''
  const fromPrinted = printed ? levelsFrom(printed) : []
  if (fromPrinted.length > 0) return fromPrinted

  const oracle = card.oracle_text ?? ''
  const fromOracle = levelsFrom(oracle)
  return fromOracle.length > 0 ? fromOracle : [{ cost: '', typeLine: '', text: oracle }]
}

/**
 * Hechizo de aventura (`layout: 'adventure'`, como Bonecrusher Giant //
 * Stomp): `card_faces[0]` es la criatura principal, `card_faces[1]` el
 * hechizo pequeño. Se rellena aparte del resto del diseño, que ya usa
 * `card_faces[0]` para todo lo demás.
 */
function adventureOf(card: Card): Adventure | null {
  if (card.layout !== 'adventure') return null
  const spell = card.card_faces?.[1]
  if (!spell) return null
  return {
    name: spell.printed_name ?? spell.name,
    mana: spell.mana_cost ?? '',
    type: spell.printed_type_line ?? spell.type_line ?? '',
    oracle: spell.printed_text ?? spell.oracle_text ?? '',
  }
}

/**
 * Split (`layout: 'split'`, como Fire // Ice, Life // Death): a diferencia de
 * Adventure/Battle, las dos caras son hechizos completos e independientes del
 * mismo tamaño, sin marco de criatura de fondo — así que, a diferencia de
 * `adventure`, aquí no se rellena un campo embebido: se crean DOS
 * `ProxyDesign` normales (uno por `cardToDesign`, con `card_faces[0]`, y otro
 * con `splitPartnerDesignOf`, con `card_faces[1]`), enlazados por
 * `splitPartnerId`/`isSplitPartner` — quien llame decide si los persiste.
 */
export function isSplitCard(card: Card): boolean {
  return card.layout === 'split' && (card.card_faces?.length ?? 0) >= 2
}

/**
 * La segunda mitad de una Split, como `ProxyDesign` independiente ya
 * vinculado (`isSplitPartner: true`) a `firstId`. Quien llame tiene que
 * vincular también `splitPartnerId` en la primera mitad (normalmente el
 * resultado de `cardToDesign`) antes de guardar ambos.
 */
export function splitPartnerDesignOf(
  card: Card,
  { id, now, firstId }: CardToDesignOptions & { firstId: string },
): ProxyDesign | null {
  const spell = card.card_faces?.[1]
  if (!isSplitCard(card) || !spell) return null

  const frame = chooseFrame(card)

  return {
    id,
    sourceCardId: card.id,
    layout: 'card',
    frameSet: 'm15',
    variant: 'regular',
    edited: false,
    frameColor: frame.frameColor,
    ...(frame.secondColor ? { secondColor: frame.secondColor } : {}),
    flags: {
      legendary: isLegendary(card),
      nyx: false,
      stamp: wantsStamp(card),
      showPt: false,
    },
    art: { x: 0, y: 0, scale: 1 },
    text: {
      name: spell.printed_name ?? spell.name,
      mana: spell.mana_cost ?? '',
      type: spell.printed_type_line ?? spell.type_line ?? '',
      oracle: spell.printed_text ?? spell.oracle_text ?? '',
      flavor: spell.flavor_text ?? '',
      note: '',
      pt: '',
      artist: spell.artist ?? card.artist ?? '',
      info: infoLine(card),
    },
    loyalty: '',
    abilities: [],
    chapters: [],
    levels: [],
    defense: '',
    backFaceId: null,
    isBackFace: false,
    splitPartnerId: firstId,
    isSplitPartner: true,
    flipPartnerId: null,
    isFlipPartner: false,
    adventure: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Flip (`layout: 'flip'`, como Erayo, Soratami Ascendant // Erayo's Essence,
 * Nezumi Graverobber // Nezumi Shadow-Watcher, del bloque clásico de
 * Kamigawa): al igual que Split, las dos caras son cartas completas e
 * independientes (cada una con su propio nombre/coste/tipo/texto/PT), así que
 * se modelan igual: DOS `ProxyDesign` normales (uno por `cardToDesign`, con
 * `card_faces[0]`, y otro con `flipPartnerDesignOf`, con `card_faces[1]`),
 * enlazados por `flipPartnerId`/`isFlipPartner` — quien llame decide si los
 * persiste. Lo que cambia frente a Split es sólo la composición física (ver
 * `renderFlip` en el renderizador): en la carta real, las dos caras comparten
 * la misma superficie impresa, cada una en su mitad, la segunda cabeza abajo;
 * aquí, en cambio, cada cara se sigue modelando como un `ProxyDesign`
 * COMPLETO (con su propio marco entero), porque `renderFlip` renderiza cada
 * cara entera con `renderCard` y la encoge a su mitad — no hay layout
 * `'flip'` especial, igual que no lo hay `'split'`.
 */
export function isFlipCard(card: Card): boolean {
  return card.layout === 'flip' && (card.card_faces?.length ?? 0) >= 2
}

/**
 * La segunda cara de una Flip, como `ProxyDesign` independiente ya vinculado
 * (`isFlipPartner: true`) a `firstId`. Quien llame tiene que vincular también
 * `flipPartnerId` en la primera cara (normalmente el resultado de
 * `cardToDesign`) antes de guardar ambas.
 */
export function flipPartnerDesignOf(
  card: Card,
  { id, now, firstId }: CardToDesignOptions & { firstId: string },
): ProxyDesign | null {
  const face = card.card_faces?.[1]
  if (!isFlipCard(card) || !face) return null

  const frame = chooseFrame(card)
  const power = face.power
  const toughness = face.toughness
  const pt = power !== undefined && toughness !== undefined ? `${power}/${toughness}` : (face.loyalty ?? '')

  return {
    id,
    sourceCardId: card.id,
    layout: 'card',
    frameSet: 'm15',
    variant: 'regular',
    edited: false,
    frameColor: frame.frameColor,
    ...(frame.secondColor ? { secondColor: frame.secondColor } : {}),
    flags: {
      legendary: isLegendary(card),
      nyx: false,
      stamp: wantsStamp(card),
      showPt: pt !== '',
    },
    art: { x: 0, y: 0, scale: 1 },
    text: {
      name: face.printed_name ?? face.name,
      mana: face.mana_cost ?? '',
      type: face.printed_type_line ?? face.type_line ?? '',
      oracle: face.printed_text ?? face.oracle_text ?? '',
      flavor: face.flavor_text ?? '',
      note: '',
      pt,
      artist: face.artist ?? card.artist ?? '',
      info: infoLine(card),
    },
    loyalty: '',
    abilities: [],
    chapters: [],
    levels: [],
    defense: '',
    backFaceId: null,
    isBackFace: false,
    splitPartnerId: null,
    isSplitPartner: false,
    flipPartnerId: firstId,
    isFlipPartner: true,
    adventure: null,
    createdAt: now,
    updatedAt: now,
  }
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
  /**
   * Sólo para Split: el id que va a tener la otra mitad (creada aparte con
   * `splitPartnerDesignOf`), para dejarlo enlazado en `splitPartnerId`.
   */
  splitPartnerId?: string
  /**
   * Sólo para Flip: el id que va a tener la otra cara (creada aparte con
   * `flipPartnerDesignOf`), para dejarlo enlazado en `flipPartnerId`.
   */
  flipPartnerId?: string
}

export function cardToDesign(
  card: Card,
  { id, now, useOfficialArt = true, splitPartnerId, flipPartnerId }: CardToDesignOptions,
): ProxyDesign {
  const face = card.card_faces?.[0]
  const split = isSplitCard(card)
  const flip = isFlipCard(card)
  const frame = chooseFrame(card)
  const pt = ptOf(card)
  const watermark = basicWatermarkOf(card)
  const planeswalker = hasType(card, 'Planeswalker')
  const abilities = planeswalker ? planeswalkerAbilitiesOf(card) : []
  const loyalty = card.loyalty ?? face?.loyalty ?? ''
  const saga = card.layout === 'saga' || hasType(card, 'Saga')
  const chapters = saga ? sagaChaptersOf(card) : []
  const classCard = card.layout === 'class' || hasType(card, 'Class')
  const levels = classCard ? classLevelsOf(card) : []
  // Las Battle reales son de doble cara (`layout: 'transform'`): la cara
  // frontal (de casillas) es la única que cubrimos, y su `defense` viene en
  // `card_faces[0]`, no en la raíz.
  const battle = card.layout === 'battle' || hasType(card, 'Battle')
  const defense = battle ? (card.defense ?? face?.defense ?? '') : ''
  const adventure = adventureOf(card)

  const artUrl = useOfficialArt
    ? (card.image_uris?.art_crop ?? face?.image_uris?.art_crop)
    : undefined

  return {
    id,
    sourceCardId: card.id,
    layout: planeswalker
      ? 'planeswalker'
      : saga
        ? 'saga'
        : battle
          ? 'battle'
          : classCard
            ? 'class'
            : 'card',
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
      name: card.printed_name ?? card.name.split(' // ')[0] ?? card.name,
      // Una Adventure/Split/Flip real es de doble cara: igual que Battle, el
      // `mana_cost`/`type_line`/`oracle_text` de la raíz junta los de las dos
      // caras («{2}{R} // {1}{R}»), así que hay que quedarse con el de la cara
      // principal (para Split y Flip, `card_faces[0]`; la otra mitad/cara la
      // crea aparte `splitPartnerDesignOf`/`flipPartnerDesignOf`).
      mana:
        (adventure || split || flip ? face?.mana_cost : undefined) ??
        card.mana_cost ??
        face?.mana_cost ??
        '',
      // Una Battle real es de doble cara (`transform`): el `type_line` de la
      // raíz junta las dos («Battle — Siege // Creature — …»), así que aquí
      // hay que quedarse con el de la cara frontal, no con el combinado.
      type:
        card.printed_type_line ??
        (battle || adventure || split || flip ? face?.type_line : undefined) ??
        card.type_line ??
        face?.type_line ??
        '',
      // Las básicas llevan el símbolo grande en vez del `({T}: Add {U}.)` que
      // Scryfall pone como texto de reglas.
      oracle: watermark
        ? ''
        : (card.printed_text ??
          (adventure || split || flip ? face?.oracle_text : undefined) ??
          card.oracle_text ??
          face?.oracle_text ??
          ''),
      flavor: card.flavor_text ?? face?.flavor_text ?? '',
      // La etiqueta la escribe quien haga el proxy: en blanco por defecto.
      note: '',
      pt,
      artist: (split || flip ? face?.artist : undefined) ?? card.artist ?? face?.artist ?? '',
      info: infoLine(card),
    },
    loyalty,
    abilities,
    chapters,
    levels,
    defense,
    backFaceId: null,
    isBackFace: false,
    splitPartnerId: split ? (splitPartnerId ?? null) : null,
    isSplitPartner: false,
    flipPartnerId: flip ? (flipPartnerId ?? null) : null,
    isFlipPartner: false,
    adventure,
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
