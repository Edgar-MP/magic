import type { ReactNode } from 'react'
import { useEffect } from 'react'

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded border border-edge bg-panel shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-white"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
