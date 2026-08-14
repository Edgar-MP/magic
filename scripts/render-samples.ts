/**
 * Renderiza unas cartas reales de Scryfall a PNG para poder mirarlas.
 *
 *   pnpm tsx scripts/render-samples.ts [nombre de carta…]
 *
 * Es la herramienta de calibración del renderizador: cuando algo está mal
 * colocado, se ve aquí antes de tocar la interfaz.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cardSchema, type CardVariant } from '@magic/shared'
import { cardToDesign, renderCard } from '@magic/renderer'
import { createNodeEnv } from '@magic/renderer/node'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'scripts/.cache/samples')

/** Una de cada tipo: mono, incolora, tierra, legendaria, dos colores, texto largo. */
const DEFAULT_CARDS = [
  'Lightning Bolt',
  'Sol Ring',
  'Island',
  "Atraxa, Praetors' Voice",
  'Deathrite Shaman',
  'Ephemerate',
  'Doubling Season',
]

async function fetchCard(name: string) {
  const url = new URL('https://api.scryfall.com/cards/named')
  url.searchParams.set('exact', name)
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'magic-render-samples/0.1' },
  })
  if (!response.ok) throw new Error(`${name}: ${response.status}`)
  return cardSchema.parse(await response.json())
}

async function setIconUri(code: string): Promise<string | undefined> {
  const response = await fetch(`https://api.scryfall.com/sets/${code}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'magic-render-samples/0.1' },
  })
  if (!response.ok) return undefined
  return ((await response.json()) as { icon_svg_uri?: string }).icon_svg_uri
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  // `--variants` saca las tres variantes de cada carta, para compararlas.
  const allVariants = args.includes('--variants')
  const names = args.filter((a) => !a.startsWith('--'))
  const cards = names.length > 0 ? names : DEFAULT_CARDS

  const env = createNodeEnv()
  await mkdir(outDir, { recursive: true })

  const variants: CardVariant[] = allVariants
    ? ['regular', 'extendedArt', 'borderless']
    : ['regular']

  for (const name of cards) {
    const card = await fetchCard(name)
    const icon = await setIconUri(card.set)
    const slug = name.replace(/[^\w]+/g, '-').toLowerCase()

    for (const variant of variants) {
      const design = cardToDesign(card, { id: 'sample', now: 0 })
      design.variant = variant
      if (icon) design.setSymbol = icon

      const surface = await renderCard(design, env, { width: 750 })
      const blob = await surface.toBlob('image/png')

      const suffix = variant === 'regular' && !allVariants ? '' : `-${variant}`
      const file = join(outDir, `${slug}${suffix}.png`)
      await writeFile(file, Buffer.from(await blob.arrayBuffer()))
      console.log(
        `${card.name} [${variant}]: ${design.frameColor}${design.secondColor ? `+${design.secondColor}` : ''} → ${file}`,
      )
    }

    // Scryfall pide no apretar: una carta cada 100 ms de sobra.
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
