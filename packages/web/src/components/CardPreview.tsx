import { useEffect, useRef, useState } from 'react'
import { getBlob } from '@magic/cards'
import { PREVIEW_WIDTH, renderCard } from '@magic/renderer'
import type { ArtPlacement, ProxyDesign } from '@magic/shared'
import { browserEnv } from '../env-browser.js'

/**
 * Vista previa de un proxy. Vuelve a renderizar cuando cambia el diseño, con un
 * pequeño retardo para no recomponer la carta en cada tecla que se pulsa.
 *
 * Si se le pasa `onArtChange`, la carta se convierte en el control de encuadre:
 * arrastrar mueve la ilustración y la rueda hace zoom, que es lo natural cuando
 * lo que estás mirando es el resultado.
 */
export function CardPreview({
  design,
  width = PREVIEW_WIDTH,
  className,
  onArtChange,
}: {
  design: ProxyDesign
  width?: number
  className?: string
  onArtChange?: (art: ArtPlacement) => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // El arrastre lee el encuadre de partida de una ref para no depender del
  // diseño en el manejador y tener que recrearlo en cada movimiento.
  const art = useRef(design.art)
  art.current = design.art
  const drag = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const blob = design.art.blobId ? await getBlob(design.art.blobId) : undefined
          const surface = await renderCard(design, browserEnv, {
            width,
            ...(blob ? { art: blob } : {}),
          })
          if (cancelled || !holder.current) return

          const canvas = surface.canvas as HTMLCanvasElement
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          holder.current.replaceChildren(canvas)
          setError(null)
        } catch (e) {
          if (!cancelled) setError((e as Error).message)
        }
      })()
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [design, width])

  const hasArt = Boolean(design.art.blobId ?? design.art.url)
  const interactive = Boolean(onArtChange) && hasArt

  /**
   * La rueda se registra a mano y no como prop de React: React los pone en modo
   * pasivo, donde `preventDefault` no surte efecto y la página haría scroll
   * mientras intentas hacer zoom.
   */
  useEffect(() => {
    const element = holder.current
    if (!element || !interactive || !onArtChange) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.0015)
      const scale = Math.min(4, Math.max(0.5, art.current.scale * factor))
      onArtChange({ ...art.current, scale })
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [interactive, onArtChange])

  return (
    <div className={className}>
      <div
        ref={holder}
        className={`overflow-hidden rounded-xl bg-black/40 aspect-[63/88] ${
          interactive ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        // `touch-none` evita que el navegador se quede el gesto para hacer scroll.
        style={interactive ? { touchAction: 'none' } : undefined}
        onPointerDown={(event) => {
          if (!interactive) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = {
            x: art.current.x,
            y: art.current.y,
            pointerX: event.clientX,
            pointerY: event.clientY,
          }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const start = drag.current
          if (!start || !onArtChange) return

          // El desplazamiento del diseño está en fracciones de la ventana de
          // arte, y la ventana mide casi todo el ancho de la carta: usar el ancho
          // del elemento hace que el arte siga al ratón casi exactamente.
          const box = event.currentTarget.getBoundingClientRect()
          onArtChange({
            ...art.current,
            x: start.x + (event.clientX - start.pointerX) / box.width,
            y: start.y + (event.clientY - start.pointerY) / box.width,
          })
        }}
        onPointerUp={() => {
          drag.current = null
          setDragging(false)
        }}
        onPointerCancel={() => {
          drag.current = null
          setDragging(false)
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
