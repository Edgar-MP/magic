import { useEffect } from 'react'

const MESSAGE = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?'

/**
 * Avisa antes de perder cambios sin guardar: recargar, cerrar la pestaña o
 * volver atrás con el navegador. La app no usa un data router (todavía),
 * así que la vuelta atrás se intercepta a mano con un `popstate` en vez del
 * `useBlocker` de react-router.
 */
export function useConfirmLeave(when: boolean): void {
  useEffect(() => {
    if (!when) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    // Entrada centinela: así el primer «atrás» dispara nuestro popstate en
    // vez de sacar de la página directamente.
    window.history.pushState(null, '', window.location.href)

    const onPopState = () => {
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
  }, [when])
}

/** Para los enlaces/botones propios de la página: mismo aviso, a mano. */
export function confirmLeave(when: boolean): boolean {
  return !when || window.confirm(MESSAGE)
}
