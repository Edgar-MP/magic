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
