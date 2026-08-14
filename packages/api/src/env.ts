import { z } from 'zod'

/**
 * Configuración del servidor. Se valida al arrancar y no en el primer uso, para
 * que un despliegue mal configurado falle de inmediato con un mensaje claro en
 * vez de a la mitad de una petición.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Carpeta con la web ya compilada (`packages/web/dist`). */
  WEB_DIST: z.string().default('../web/dist'),
  /**
   * Datos persistentes: las ilustraciones que sube la gente. En el VPS es un
   * volumen, así que sobrevive a los despliegues.
   */
  DATA_DIR: z.string().default('./data'),

  DATABASE_URL: z.string().url(),
  /**
   * URL pública, si se sabe (`https://magic.midominio.com`). No es obligatoria:
   * sin ella better-auth la deduce de cada petición, que es lo que permite que la
   * misma imagen sirva para cualquier dominio. Ponerla quita un aviso al arrancar
   * y hace falta el día que se añada entrar con Google o similar.
   */
  PUBLIC_URL: z.string().url().optional(),
  /**
   * Con el que se firman las cookies de sesión. Si cambia, se invalidan todas.
   * En desarrollo hay un valor por defecto; en producción es obligatorio.
   */
  AUTH_SECRET: z.string().min(32).optional(),

  /**
   * Cuotas de las ilustraciones. El registro es abierto, así que sin esto
   * cualquiera con la URL puede llenar el disco del servidor.
   */
  MAX_ART_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_ART_BYTES_PER_USER: z.coerce.number().int().positive().default(200 * 1024 * 1024),
})

export type Env = z.infer<typeof envSchema> & { AUTH_SECRET: string }

/** Sólo para desarrollo y tests: en producción se exige uno de verdad. */
const DEV_SECRET = 'secreto-de-desarrollo-no-usar-en-produccion'

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    console.error('Configuración inválida:', parsed.error.flatten().fieldErrors)
    throw new Error('Configuración inválida')
  }

  const env = parsed.data

  if (env.NODE_ENV === 'production' && !env.AUTH_SECRET) {
    throw new Error('Falta AUTH_SECRET: sin él las sesiones no serían seguras')
  }

  return { ...env, AUTH_SECRET: env.AUTH_SECRET ?? DEV_SECRET }
}
