import { build } from 'esbuild'

/**
 * Empaqueta el servidor en un único fichero.
 *
 * El motivo es `@magic/shared`: su `main` apunta al TypeScript de `src`, que es
 * lo que quieren Vite y tsx, pero Node no sabe importar TypeScript desde
 * `node_modules`. Empaquetando, el código compartido queda dentro del bundle y
 * en ejecución no hay que resolver ningún paquete del workspace. A cambio,
 * desarrollo y tests siguen usando las fuentes directamente.
 *
 * Se dejan fuera las dependencias de verdad: son código de terceros que ya está
 * en node_modules, y Prisma además carga su motor buscando ficheros por disco,
 * así que empaquetarlo lo rompería.
 */
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  logLevel: 'info',
  // `@magic/shared` se resuelve a su fuente para que entre en el bundle; sin
  // esto, `packages: 'external'` lo dejaría fuera al ser un especificador de
  // paquete y volveríamos al problema original.
  alias: { '@magic/shared': '../shared/src/index.ts' },
  packages: 'external',
  // `#prisma` es un import interno del paquete (ver "imports" en package.json):
  // resuelve igual desde cualquier profundidad, así que el bundle lo encuentra
  // esté en `dist/` o en `src/`.
  external: ['#prisma'],
})
