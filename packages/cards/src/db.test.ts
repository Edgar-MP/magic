import { describe, expect, it } from 'vitest'
import type { ProxyDesign } from '@magic/shared'
import { normalizeProxy } from './db.js'

/**
 * Los proxies guardados por versiones anteriores no tienen los campos que se
 * añadieron después. Al renderizarlos petaba con «Cannot read properties of
 * undefined (reading 'trim')», así que se completan al leerlos.
 */

/** Un proxy tal como lo guardaba la primera versión. */
const legacy = {
  id: 'viejo',
  frameSet: 'm15',
  frameColor: 'red',
  flags: { legendary: false, nyx: false, stamp: false, showPt: true },
  art: { x: 0, y: 0, scale: 1 },
  text: {
    name: 'Rayo',
    mana: '{R}',
    type: 'Instante',
    oracle: 'Hace 3 daños.',
    flavor: '',
    pt: '',
    artist: 'Nadie',
    info: 'TST · 1',
  },
  createdAt: 0,
  updatedAt: 0,
} as unknown as ProxyDesign

describe('normalizeProxy', () => {
  it('rellena los campos que faltan', () => {
    const fixed = normalizeProxy(legacy)
    expect(fixed.variant).toBe('regular')
    expect(fixed.edited).toBe(false)
    expect(fixed.text.note).toBe('')
  })

  it('no toca lo que ya venía puesto', () => {
    const fixed = normalizeProxy(legacy)
    expect(fixed.text.name).toBe('Rayo')
    expect(fixed.frameColor).toBe('red')
    expect(fixed.flags.showPt).toBe(true)
  })

  it('devuelve el mismo objeto si ya está completo', () => {
    const complete = normalizeProxy(legacy)
    expect(normalizeProxy(complete)).toBe(complete)
  })

  it('aguanta un proxy con el texto a medias', () => {
    const broken = { ...legacy, text: { name: 'Sólo el nombre' } } as unknown as ProxyDesign
    const fixed = normalizeProxy(broken)
    expect(fixed.text.note).toBe('')
    expect(fixed.variant).toBe('regular')
  })
})
