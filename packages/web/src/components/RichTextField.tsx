import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { docToText, textToHtml } from '../lib/rich-text.js'

/**
 * Campo de texto con negrita y cursiva de verdad (botones, no escribir
 * `**a mano**`). Por debajo se guarda como texto plano con ese mismo marcado:
 * es lo que ya entiende el tokenizador del renderizador, así que el proxy
 * sigue guardando un `string` normal en el campo que sea (reglas, la
 * habilidad de un planeswalker…) — no hace falta tocar el esquema, la
 * sincronización ni la impresión.
 */
export function RichTextField({
  label,
  value,
  onChange,
  hint,
  compact,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  hint?: string
  /** Para usarlo suelto dentro de una fila (la habilidad de un planeswalker). */
  compact?: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        strike: false,
        dropcursor: false,
        gapcursor: false,
      }),
    ],
    content: textToHtml(value),
    onUpdate: ({ editor }) => onChange(docToText(editor.getJSON())),
    editorProps: {
      attributes: {
        class: `${compact ? 'min-h-12' : 'min-h-24'} rounded-b px-2 py-1.5 text-sm outline-none [&_p]:my-0.5 first:[&_p]:mt-0 last:[&_p]:mb-0`,
      },
    },
  })

  // Resincroniza desde fuera (cambiar de proxy, deshacer, importar…) sin tocar
  // lo que se está escribiendo: nunca mientras el editor tiene el foco.
  useEffect(() => {
    if (!editor || editor.isFocused) return
    if (docToText(editor.getJSON()) === value) return
    editor.commands.setContent(textToHtml(value))
  }, [editor, value])

  if (!editor) return null

  const field = (
    <div className="rounded border border-edge bg-ink focus-within:border-accent">
      <div className="flex gap-1 border-b border-edge p-1">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrita"
        >
          <strong>N</strong>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Cursiva"
        >
          <em>K</em>
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )

  if (!label) return field

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      {field}
      {hint && <span className="text-[11px] text-muted/70">{hint}</span>}
    </label>
  )
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`size-6 rounded text-xs ${
        active ? 'bg-accent/25 text-accent' : 'text-muted hover:bg-edge hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
