import { useCallback, useEffect, useRef } from 'react'

const MESSAGE = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?'

/**
 * Avisa antes de perder cambios sin guardar: recargar, cerrar la pestaña o
 * volver atrás con el navegador. La app no usa un data router (todavía), así
 * que la vuelta atrás se intercepta a mano con un `popstate` en vez del
 * `useBlocker` de react-router.
 *
 * La entrada centinela se empuja una sola vez por página (al montar), no en
 * cada cambio de `when`: si se empujara una por cada vez que hay cambios sin
 * guardar (p.ej. editar → guardar → editar otra vez), se irían acumulando
 * entradas duplicadas y «atrás» dejaría de llevar a la página anterior real.
 *
 * Devuelve `goBack`, para que un botón «atrás» propio de la página use el
 * mismo aviso sin acabar mostrando el diálogo dos veces (una por el propio
 * botón y otra por el `popstate` que dispara su navegación).
 */
export function useConfirmLeave(when: boolean): () => void {
  const whenRef = useRef(when)
  whenRef.current = when
  // Marca que la confirmación ya se hizo desde `goBack`: el próximo popstate
  // sólo tiene que completar la navegación, no volver a preguntar.
  const suppressRef = useRef(false)

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!whenRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    window.history.pushState(null, '', window.location.href)

    const onPopState = () => {
      if (suppressRef.current) {
        suppressRef.current = false
        window.history.back()
        return
      }
      if (!whenRef.current) {
        // Sin cambios sin guardar: se deja pasar el «atrás» de verdad, sin
        // molestar. Consume la entrada centinela y ya está.
        window.history.back()
        return
      }
      if (window.confirm(MESSAGE)) {
        window.history.back()
      } else {
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
    // Sólo al montar/desmontar la página: `whenRef` ya lleva el valor vivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goBack = useCallback(() => {
    if (whenRef.current && !window.confirm(MESSAGE)) return
    suppressRef.current = true
    window.history.back()
  }, [])

  return goBack
}
