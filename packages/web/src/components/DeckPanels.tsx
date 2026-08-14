import type { Card, DeckStats, Issue } from '@magic/shared'
import { COLORS } from '@magic/shared'
import { ColorIdentity } from './ManaCost.js'

/** Panel de validación del formato. */
export function Issues({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) {
    return (
      <p className="rounded border border-green-900/60 bg-green-950/30 px-3 py-2 text-sm text-green-300">
        El mazo es legal.
      </p>
    )
  }

  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')

  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 && (
        <ul className="rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {errors.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          {warnings.map((issue, i) => (
            <li key={i}>{issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Curva de maná, reparto de colores y recuento por tipo. */
export function Stats({ stats }: { stats: DeckStats }) {
  const peak = Math.max(1, ...stats.curve.map((b) => b.count))

  return (
    <div className="flex flex-col gap-4 rounded border border-edge bg-panel p-3">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Curva de maná
        </h3>
        <div className="flex h-24 items-end gap-1">
          {stats.curve.map((bucket) => (
            <div key={bucket.cmc} className="flex flex-1 flex-col items-center gap-1">
              <span className="tabular text-[10px] text-muted">{bucket.count || ''}</span>
              <div
                className="w-full rounded-t bg-accent/70"
                style={{ height: `${(bucket.count / peak) * 100}%`, minHeight: bucket.count ? 2 : 0 }}
              />
              <span className="tabular text-[10px] text-muted">
                {bucket.cmc === 7 ? '7+' : bucket.cmc}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Media {stats.averageCmc.toFixed(2)} · {stats.lands} tierras · {stats.spells} hechizos
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Colores</h3>
        <ul className="flex flex-wrap gap-3 text-sm">
          {COLORS.filter((c) => stats.colors[c] > 0).map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <ColorIdentity colors={[c]} />
              <span className="tabular">{stats.colors[c]}</span>
            </li>
          ))}
          {stats.colorless > 0 && (
            <li className="flex items-center gap-1.5">
              <ColorIdentity colors={[]} />
              <span className="tabular">{stats.colorless}</span>
            </li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Tipos</h3>
        <ul className="flex flex-col gap-0.5 text-sm">
          {stats.types.map((t) => (
            <li key={t.type} className="flex justify-between">
              <span>{TYPE_LABELS[t.type] ?? t.type}</span>
              <span className="tabular text-muted">{t.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const TYPE_LABELS: Record<string, string> = {
  Creature: 'Criaturas',
  Instant: 'Instantáneos',
  Sorcery: 'Conjuros',
  Artifact: 'Artefactos',
  Enchantment: 'Encantamientos',
  Planeswalker: 'Planeswalkers',
  Battle: 'Batallas',
  Land: 'Tierras',
}

/** Categoría en la que se agrupa una carta en la lista del mazo. */
export function categoryOf(card: Card | undefined): string {
  if (!card) return 'Otras'
  const type = card.type_line ?? ''
  for (const [needle, label] of [
    ['Land', 'Tierras'],
    ['Creature', 'Criaturas'],
    ['Planeswalker', 'Planeswalkers'],
    ['Battle', 'Batallas'],
    ['Instant', 'Instantáneos'],
    ['Sorcery', 'Conjuros'],
    ['Artifact', 'Artefactos'],
    ['Enchantment', 'Encantamientos'],
  ] as const) {
    if (new RegExp(`\\b${needle}\\b`).test(type)) return label
  }
  return 'Otras'
}

export const CATEGORY_ORDER = [
  'Criaturas',
  'Planeswalkers',
  'Instantáneos',
  'Conjuros',
  'Artefactos',
  'Encantamientos',
  'Batallas',
  'Tierras',
  'Otras',
]
