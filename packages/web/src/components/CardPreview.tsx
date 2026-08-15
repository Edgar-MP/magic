import { useEffect, useMemo, useRef, useState } from 'react'
import { getBlob } from '@magic/cards'
import {
  PREVIEW_WIDTH,
  paintCard,
  renderCardLayers,
  type ArtImage,
  type CardLayers,
} from '@magic/renderer'
import type { ArtPlacement, ProxyDesign } from '@magic/shared'
import { browserEnv } from '../env-browser.js'

/**
 * Vista previa de un proxy.
 *
 * La carta se compone en dos piezas: la capa de marco y textos, que es la parte
 * costosa (máscaras, capas y la bisección del autoajuste), y la ilustración. La
 * capa sólo se recalcula cuando cambia algo que no es el arte; encuadrar es
 * repintar el arte y volver a estampar la capa, que va a la velocidad del monitor.
 *
 * Con `onArtChange`, la carta es el control de encuadre: arrastrar mueve y la
 * rueda hace zoom. El encuadre en curso vive en una ref y sólo se guarda al
 * soltar, para no escribir en IndexedDB en cada píxel.
 */
export function CardPreview({
  design,
  width = PREVIEW_WIDTH,
  className,
  onArtChange,
  shareToken,
}: {
  design: ProxyDesign
  width?: number
  className?: string
  onArtChange?: (art: ArtPlacement) => void
  /**
   * Token de un mazo compartido: si no hay blob local y el diseño trae
   * `art.blobId` (imagen del dueño original, no descargada en este
   * navegador), se intenta `GET /v1/share/:token/art/:blobId` como tercera
   * vía, después del blob local y de `art.url`.
   */
  shareToken?: string
}) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const layers = useRef<CardLayers | null>(null)
  const art = useRef<{ key: string; image: ArtImage } | null>(null)
  const placement = useRef<ArtPlacement>(design.art)
  const dragging = useRef(false)
  const frame = useRef<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const artKey = design.art.blobId ?? design.art.url ?? ''
  const hasArt = artKey !== ''
  const interactive = Boolean(onArtChange) && hasArt
  // Todas las plantillas son verticales salvo Battle, que es apaisada (se
  // juega girada 90°): el hueco tiene que reservar su proporción real o el
  // lienzo (que sí respeta su propio ancho/alto) deja hueco vacío debajo.
  const isLandscape = design.layout === 'battle'

  // Mientras se arrastra, el encuadre bueno es el de la ref y no el de las props.
  if (!dragging.current) placement.current = design.art

  /**
   * Firma de todo lo que obliga a recomponer la capa. Deja fuera el arte y las
   * marcas de tiempo, que cambian sin afectar al dibujo.
   */
  const signature = useMemo(() => {
    const { art: _art, updatedAt: _updated, createdAt: _created, ...rest } = design
    return JSON.stringify(rest)
  }, [design])

  const paint = () => {
    const current = layers.current
    const target = canvas.current
    if (!current || !target) return
    const ctx = target.getContext('2d')
    if (!ctx) return
    paintCard(ctx, current, art.current?.image, placement.current)
  }

  /** Repinta como mucho una vez por fotograma. */
  const schedulePaint = () => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      paint()
    })
  }

  /**
   * Cancelar deja la ref a null sin falta. Si se queda con el id viejo, el
   * guardia de `schedulePaint` cree que hay un fotograma en cola para siempre y
   * no vuelve a pintar nunca: en StrictMode, que monta, desmonta y vuelve a
   * montar, eso dejaba el arrastre sin repintar hasta soltar el ratón.
   */
  const cancelPaint = () => {
    if (frame.current === null) return
    cancelAnimationFrame(frame.current)
    frame.current = null
  }

  // El lienzo se crea una vez y se reutiliza: sustituirlo en cada render hacía
  // parpadear la vista previa.
  useEffect(() => {
    const element = document.createElement('canvas')
    element.style.width = '100%'
    element.style.height = 'auto'
    element.style.display = 'block'
    canvas.current = element
    holder.current?.replaceChildren(element)

    return () => {
      canvas.current = null
      cancelPaint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Capa de marco y textos.
  useEffect(() => {
    let cancelled = false

    // Un pequeño retardo para no recomponer en cada tecla que se pulsa.
    const timer = setTimeout(() => {
      void renderCardLayers(design, browserEnv, { width })
        .then((result) => {
          if (cancelled) return
          layers.current = result
          if (canvas.current) {
            canvas.current.width = result.width
            canvas.current.height = result.height
          }
          setError(null)
          paint()
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message)
        })
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `signature` resume el diseño sin el arte: es lo que obliga a recomponer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, width])

  // Ilustración: se carga una vez por imagen y se queda en memoria.
  useEffect(() => {
    if (art.current?.key === artKey) return

    if (artKey === '') {
      art.current = null
      schedulePaint()
      return
    }

    let cancelled = false
    void (async () => {
      try {
        let source: Blob | string | undefined = design.art.blobId
          ? await getBlob(design.art.blobId)
          : design.art.url

        // Sin blob local ni URL: si venimos de una vista de mazo compartido,
        // el arte puede estar en el servidor del dueño original.
        if (!source && design.art.blobId && shareToken) {
          const response = await fetch(`/v1/share/${shareToken}/art/${design.art.blobId}`)
          if (response.ok) source = await response.blob()
        }

        if (!source) return
        const image = await browserEnv.loadImage(source)
        if (cancelled) return
        art.current = { key: artKey, image }
        schedulePaint()
      } catch {
        // Sin ilustración la carta se sigue viendo; no merece un error visible.
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey])

  // Un encuadre que llega de fuera (el zoom, «centrar y ajustar») se repinta.
  useEffect(() => {
    if (!dragging.current) schedulePaint()
  }, [design.art])

  /**
   * La rueda se registra a mano y no como prop de React: React los pone en modo
   * pasivo, donde `preventDefault` no surte efecto y la página haría scroll
   * mientras intentas hacer zoom.
   */
  useEffect(() => {
    const element = holder.current
    if (!element || !interactive || !onArtChange) return

    let commit: ReturnType<typeof setTimeout> | undefined

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      const scale = Math.min(4, Math.max(0.5, placement.current.scale * factor))
      placement.current = { ...placement.current, scale }
      schedulePaint()

      // Se guarda cuando la rueda para, no en cada muesca.
      clearTimeout(commit)
      commit = setTimeout(() => onArtChange(placement.current), 250)
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      clearTimeout(commit)
    }
  }, [interactive, onArtChange])

  const start = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null)

  return (
    <div className={className}>
      <div
        ref={holder}
        className={`overflow-hidden rounded-xl bg-black/40 ${
          isLandscape ? 'aspect-[7/5]' : 'aspect-[63/88]'
        } ${interactive ? (grabbing ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        // `touch-none` evita que el navegador se quede el gesto para hacer scroll.
        style={interactive ? { touchAction: 'none' } : undefined}
        onPointerDown={(event) => {
          if (!interactive) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragging.current = true
          start.current = {
            x: placement.current.x,
            y: placement.current.y,
            pointerX: event.clientX,
            pointerY: event.clientY,
          }
          setGrabbing(true)
        }}
        onPointerMove={(event) => {
          const from = start.current
          if (!from || !dragging.current) return

          // El desplazamiento va en fracciones de la ventana de arte, y la
          // ventana mide casi todo el ancho de la carta: con el ancho del
          // elemento el arte sigue al ratón casi exactamente.
          const box = event.currentTarget.getBoundingClientRect()
          placement.current = {
            ...placement.current,
            x: from.x + (event.clientX - from.pointerX) / box.width,
            y: from.y + (event.clientY - from.pointerY) / box.width,
          }
          schedulePaint()
        }}
        onPointerUp={() => {
          if (!dragging.current) return
          dragging.current = false
          start.current = null
          setGrabbing(false)
          // Un solo guardado por arrastre.
          onArtChange?.(placement.current)
        }}
        onPointerCancel={() => {
          dragging.current = false
          start.current = null
          setGrabbing(false)
        }}
      />

      {interactive && (
        <p className="mt-1.5 text-center text-[11px] text-muted">
          Arrastra la carta para mover la ilustración · rueda para el zoom
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">
          {error}
          {/* Sólo sugerir los assets cuando el fallo es de carga, no en cualquier error. */}
          {/No se pudo cargar|Failed to fetch/.test(error) && (
            <>
              . ¿Has ejecutado <code>pnpm assets</code>?
            </>
          )}
        </p>
      )}
    </div>
  )
}
