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
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    console.error('Configuración inválida:', parsed.error.flatten().fieldErrors)
    throw new Error('Configuración inválida')
  }
  return parsed.data
}
