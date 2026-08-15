import { getBlob, getProxy } from '@magic/cards'
import { PRINT_WIDTH, renderCard, renderCardBack } from '@magic/renderer'
import type { Card, Deck, ProxyDesign } from '@magic/shared'
import { browserEnv } from '../env-browser.js'
import type { PrintCard } from './pdf.js'

/**
 * Convierte lo que hay que imprimir en imágenes: los proxies se renderizan con
 * el motor de marcos y las cartas sin proxy se bajan del CDN de Scryfall.
 */

/** Renderiza un proxy a PNG al tamaño de impresión. */
export async function renderProxyToPng(design: ProxyDesign): Promise<Uint8Array> {
  const art = design.art.blobId ? await getBlob(design.art.blobId) : undefined

  const surface = await renderCard(design, browserEnv, {
    width: PRINT_WIDTH,
    ...(art ? { art } : {}),
  })
  const blob = await surface.toBlob('image/png')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Reverso a tamaño de impresión. Sin imagen propia usa el reverso clásico de
 * Magic que viene con los assets.
 */
export async function renderBackToPng(image?: Blob): Promise<Uint8Array> {
  const surface = await renderCardBack(browserEnv, {
    width: PRINT_WIDTH,
    ...(image ? { image } : {}),
  })
  const blob = await surface.toBlob('image/png')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Baja la imagen oficial de una carta. `png` de Scryfall es la de más calidad. */
async function fetchOfficial(card: Card): Promise<{ bytes: Uint8Array; type: 'png' | 'jpeg' }> {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris
  const url = uris?.png ?? uris?.large ?? uris?.normal
  if (!url) throw new Error(`${card.name} no tiene imagen en Scryfall`)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${card.name}: ${response.status} al bajar la imagen`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  return { bytes, type: sniffImageType(bytes) }
}

/**
 * Mira los bytes en vez de la extensión: las URL de Scryfall llevan query
 * string (`...png?1699999`), así que fiarse del nombre acaba dándole un PNG a
 * `embedJpg` y reventando con «SOI not found in JPEG».
 */
function sniffImageType(bytes: Uint8Array): 'png' | 'jpeg' {
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (isPng) return 'png'

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  if (isJpeg) return 'jpeg'

  throw new Error('La imagen no es PNG ni JPEG')
}

export interface DeckPrintResult {
  cards: PrintCard[]
  /** Cartas que no se han podido preparar, con el motivo. */
  failed: { name: string; reason: string }[]
}

export interface DeckPrintOptions {
  /** Incluir la banda además del mazo y el comandante. */
  includeSideboard?: boolean
  /** Aviso de progreso: cuántas van de cuántas. */
  onProgress?: (done: number, total: number) => void
}

/**
 * Prepara el mazo entero: usa el proxy de cada carta si lo tiene, y si no la
 * imagen oficial. Respeta las cantidades.
 */
export async function renderDeckForPrint(
  deck: Deck,
  cards: Map<string, Card>,
  { includeSideboard = false, onProgress }: DeckPrintOptions = {},
): Promise<DeckPrintResult> {
  const entries = deck.entries.filter((e) => includeSideboard || e.board !== 'side')

  const result: DeckPrintResult = { cards: [], failed: [] }
  let done = 0

  for (const entry of entries) {
    const card = cards.get(entry.cardId)
    const name = card?.name ?? entry.cardId

    try {
      // Un proxy borrado no se imprime: se cae a la imagen oficial de la carta.
      const design = entry.proxyId ? await getProxy(entry.proxyId) : undefined

      if (design) {
        result.cards.push({ bytes: await renderProxyToPng(design), type: 'png', qty: entry.qty })

        // Doble cara: el dorso va justo detrás en la rejilla de impresión,
        // como una carta más (mismas copias que el frente).
        if (design.backFaceId) {
          const back = await getProxy(design.backFaceId)
          if (back) {
            result.cards.push({ bytes: await renderProxyToPng(back), type: 'png', qty: entry.qty })
          }
        }
      } else if (card) {
        const { bytes, type } = await fetchOfficial(card)
        result.cards.push({ bytes, type, qty: entry.qty })
      } else {
        result.failed.push({ name, reason: 'no está en la caché de cartas' })
      }
    } catch (error) {
      result.failed.push({ name, reason: (error as Error).message })
    }

    done += 1
    onProgress?.(done, entries.length)
  }

  return result
}
