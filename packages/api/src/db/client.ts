import { PrismaClient } from '#prisma'

/**
 * Una sola instancia para todo el proceso.
 *
 * Se importa por `#prisma` (declarado en "imports" del package.json) y no por una
 * ruta relativa: así el especificador resuelve igual desde `src/` que desde el
 * bundle de `dist/`, que están a profundidades distintas.
 */
export const prisma = new PrismaClient()

export type { Prisma } from '#prisma'
