import type { Env } from './env.js'

/**
 * Configuración para los tests. `DATABASE_URL` apunta al Postgres del
 * `docker-compose`; los tests que no tocan la base de datos no llegan a usarlo
 * (Prisma no conecta hasta la primera consulta).
 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    WEB_DIST: './dist-de-mentira',
    DATA_DIR: './data-de-mentira',
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://magic:magic@localhost:5463/magic',
    AUTH_SECRET: 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres',
    MAX_ART_BYTES: 10 * 1024 * 1024,
    MAX_ART_BYTES_PER_USER: 200 * 1024 * 1024,
    ...overrides,
  }
}
