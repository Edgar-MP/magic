import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CardVariant, ProxyDesign, SyncPush } from '@magic/shared'
import { createApp } from '../src/app.js'
import { prisma } from '../src/db/client.js'
import type { Env } from '../src/env.js'
import { testEnv } from '../src/test-env.js'

/**
 * Utilidades de los tests de integración. Necesitan el Postgres del
 * `docker-compose` levantado y las migraciones aplicadas.
 */

export interface TestApp {
  app: ReturnType<typeof createApp>
  env: Env
  cleanup: () => Promise<void>
}

export async function createTestApp(overrides: Partial<Env> = {}): Promise<TestApp> {
  const dataDir = await mkdtemp(join(tmpdir(), 'magic-api-'))
  const env = testEnv({ DATA_DIR: dataDir, ...overrides })

  return {
    app: createApp(env),
    env,
    cleanup: () => rm(dataDir, { recursive: true, force: true }),
  }
}

export interface TestUser {
  id: string
  email: string
  password: string
  /** Cookie de sesión, para mandarla en las peticiones siguientes. */
  cookie: string
}

/**
 * Crea una cuenta pasando por el registro de verdad y se queda con la cookie.
 * Así los tests ejercitan el mismo camino que la aplicación.
 */
export async function registerUser(app: TestApp['app']): Promise<TestUser> {
  const email = `${randomUUID()}@ejemplo.test`
  const password = 'contrasena-de-prueba'

  const response = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Alguien' }),
  })

  if (!response.ok) {
    throw new Error(`el registro falló: ${response.status} ${await response.text()}`)
  }

  const cookie = response.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })

  return { id: user.id, email, password, cookie }
}

/** Petición autenticada con JSON. */
export function asUser(user: TestUser, body?: unknown): RequestInit {
  return {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: user.cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

/** Un mazo mínimo para empujar. */
export function makeDeck(overrides: Partial<SyncPush['decks'][number]> = {}) {
  const now = Date.now()
  return {
    id: randomUUID(),
    name: 'Mazo de prueba',
    format: 'casual' as const,
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Un diseño de proxy mínimo pero válido según el esquema. */
export function makeDesign(overrides: Partial<ProxyDesign> = {}): ProxyDesign {
  const now = Date.now()
  return {
    id: randomUUID(),
    frameSet: 'm15',
    variant: 'regular' as CardVariant,
    edited: false,
    frameColor: 'red',
    flags: { legendary: false, nyx: false, stamp: false, showPt: false },
    art: { x: 0, y: 0, scale: 1 },
    text: {
      name: 'Rayo',
      mana: '{R}',
      type: 'Instante',
      oracle: '',
      flavor: '',
      note: '',
      pt: '',
      artist: '',
      info: '',
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

export function makeProxy(overrides: Partial<SyncPush['proxies'][number]> = {}) {
  const design = makeDesign()
  return {
    id: design.id,
    design,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
    ...overrides,
  }
}

/** Deja la base de datos vacía entre ficheros de test. */
export async function resetDb(): Promise<void> {
  // El orden importa por las claves ajenas; borrar los usuarios arrastra el resto.
  await prisma.$transaction([
    prisma.deck.deleteMany(),
    prisma.collectionItem.deleteMany(),
    prisma.proxy.deleteMany(),
    prisma.artBlob.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.user.deleteMany(),
  ])
}
