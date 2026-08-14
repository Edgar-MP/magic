import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Prisma lee la variable del entorno directamente, no del `Env` que le
    // pasamos, así que hay que dejársela puesta. Apunta al `docker compose`.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://magic:magic@localhost:5463/magic',
    },
    // Los tests de integración comparten una única base de datos, así que no
    // pueden correr a la vez sin pisarse.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
