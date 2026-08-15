import { describe, expect, it } from 'vitest'
import { cardSchema } from '@magic/shared'
import { cardToDesign } from './from-scryfall.js'

const teferi = cardSchema.parse({
  id: 'teferi',
  name: 'Teferi, Hero of Dominaria',
  layout: 'normal',
  mana_cost: '{3}{W}{U}',
  type_line: 'Legendary Planeswalker — Teferi',
  colors: ['W', 'U'],
  color_identity: ['W', 'U'],
  legalities: {},
  set: 'dom',
  loyalty: '4',
  oracle_text:
    '+1: Draw a card. At the beginning of the next end step, untap two lands.\n' +
    "−3: Put target nonland permanent into its owner's library third from the top.\n" +
    '−8: You get an emblem with "Whenever you draw a card, exile target permanent an opponent controls."',
})

const songOfFreyalise = cardSchema.parse({
  id: 'song-of-freyalise',
  name: 'Song of Freyalise',
  layout: 'saga',
  mana_cost: '{1}{G}',
  type_line: 'Enchantment — Saga',
  colors: ['G'],
  color_identity: ['G'],
  legalities: {},
  set: 'dom',
  oracle_text:
    '(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\n' +
    'I, II — Until your next turn, creatures you control gain "{T}: Add one mana of any color."\n' +
    'III — Put a +1/+1 counter on each creature you control. Those creatures gain vigilance, trample, and indestructible until end of turn.',
})

/**
 * Battle real (Scryfall): son de doble cara (`layout: 'transform'`, nunca
 * `'battle'`), con la cara frontal de casillas y `defense` sólo en esa cara,
 * no en la raíz de la carta.
 */
const invasionOfGobakhan = cardSchema.parse({
  id: 'invasion-of-gobakhan',
  name: 'Invasion of Gobakhan // Prava, Warrior Empress',
  layout: 'transform',
  type_line: 'Battle — Siege // Legendary Creature — Human Soldier',
  colors: ['W'],
  color_identity: ['W'],
  legalities: {},
  set: 'mom',
  card_faces: [
    {
      name: 'Invasion of Gobakhan',
      mana_cost: '{2}{W}',
      type_line: 'Battle — Siege',
      defense: '3',
      oracle_text:
        "When this Siege enters, look at target opponent's hand. You may exile a nonland card from it. " +
        'For as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast.',
    },
    {
      name: 'Prava, Warrior Empress',
      type_line: 'Legendary Creature — Human Soldier',
      power: '4',
      toughness: '4',
    },
  ],
})

/**
 * Adventure real (Scryfall): `layout: 'adventure'`, con `card_faces[0]` la
 * criatura principal y `card_faces[1]` el hechizo pequeño. El `mana_cost`,
 * `type_line` y `oracle_text` de la raíz juntan los de las dos caras (o van a
 * `null`, como el `oracle_text` de la raíz), igual que en Battle.
 */
const bonecrusherGiant = cardSchema.parse({
  id: 'bonecrusher-giant',
  name: 'Bonecrusher Giant',
  layout: 'adventure',
  mana_cost: '{2}{R} // {1}{R}',
  type_line: 'Creature — Giant // Instant — Adventure',
  colors: ['R'],
  color_identity: ['R'],
  legalities: {},
  set: 'eld',
  card_faces: [
    {
      name: 'Bonecrusher Giant',
      mana_cost: '{2}{R}',
      type_line: 'Creature — Giant',
      power: '4',
      toughness: '3',
      oracle_text:
        "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.",
    },
    {
      name: 'Stomp',
      mana_cost: '{1}{R}',
      type_line: 'Instant — Adventure',
      oracle_text: "Damage can't be prevented this turn. Stomp deals 2 damage to any target.",
    },
  ],
})

describe('cardToDesign', () => {
  it('detecta un planeswalker y saca sus habilidades del oracle', () => {
    const design = cardToDesign(teferi, { id: 'x', now: 0 })
    expect(design.layout).toBe('planeswalker')
    expect(design.loyalty).toBe('4')
    expect(design.abilities).toEqual([
      { cost: '+1', text: 'Draw a card. At the beginning of the next end step, untap two lands.' },
      {
        cost: '-3',
        text: "Put target nonland permanent into its owner's library third from the top.",
      },
      {
        cost: '-8',
        text: 'You get an emblem with "Whenever you draw a card, exile target permanent an opponent controls."',
      },
    ])
  })

  it('detecta una saga y saca sus capítulos del oracle', () => {
    const design = cardToDesign(songOfFreyalise, { id: 'x', now: 0 })
    expect(design.layout).toBe('saga')
    expect(design.chapters).toEqual([
      {
        chapter: 'I, II',
        text: 'Until your next turn, creatures you control gain "{T}: Add one mana of any color."',
      },
      {
        chapter: 'III',
        text: 'Put a +1/+1 counter on each creature you control. Those creatures gain vigilance, trample, and indestructible until end of turn.',
      },
    ])
  })

  it('detecta una battle y saca la defensa de la cara frontal', () => {
    const design = cardToDesign(invasionOfGobakhan, { id: 'x', now: 0 })
    expect(design.layout).toBe('battle')
    expect(design.defense).toBe('3')
    expect(design.text.name).toBe('Invasion of Gobakhan')
    expect(design.text.type).toBe('Battle — Siege')
    expect(design.text.mana).toBe('{2}{W}')
  })

  it('detecta un hechizo de aventura y lo separa de la criatura principal', () => {
    const design = cardToDesign(bonecrusherGiant, { id: 'x', now: 0 })
    expect(design.layout).toBe('card')
    expect(design.text.name).toBe('Bonecrusher Giant')
    expect(design.text.mana).toBe('{2}{R}')
    expect(design.text.type).toBe('Creature — Giant')
    expect(design.text.oracle).toBe(
      "Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell's controller.",
    )
    expect(design.adventure).toEqual({
      name: 'Stomp',
      mana: '{1}{R}',
      type: 'Instant — Adventure',
      oracle: "Damage can't be prevented this turn. Stomp deals 2 damage to any target.",
    })
  })

  it('una carta normal no lleva capa de planeswalker', () => {
    const bolt = cardSchema.parse({
      id: 'bolt',
      name: 'Lightning Bolt',
      layout: 'normal',
      mana_cost: '{R}',
      type_line: 'Instant',
      colors: ['R'],
      color_identity: ['R'],
      legalities: {},
      set: 'lea',
      oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    })
    const design = cardToDesign(bolt, { id: 'y', now: 0 })
    expect(design.layout).toBe('card')
    expect(design.abilities).toEqual([])
  })
})
