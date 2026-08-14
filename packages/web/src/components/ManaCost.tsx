import { paths, tokenizeManaCost } from '@magic/renderer'

/** Pinta un coste de maná con los SVG de Scryfall. */
export function ManaCost({ cost, size = 14 }: { cost: string | undefined; size?: number }) {
  const symbols = tokenizeManaCost(cost ?? '')
  if (symbols.length === 0) return null

  return (
    <span className="inline-flex items-center gap-[2px] align-middle">
      {symbols.map((symbol, i) => (
        <img
          key={`${symbol}-${i}`}
          src={`/card-assets/${paths.symbol(symbol)}`}
          alt={symbol}
          title={symbol}
          width={size}
          height={size}
          className="inline-block rounded-full"
        />
      ))}
    </span>
  )
}

const COLOR_DOT: Record<string, string> = {
  W: '#f8f6d8',
  U: '#c1d7e9',
  B: '#bab1ab',
  R: '#e49977',
  G: '#a3c095',
}

/** Puntitos de identidad de color, para las listas. */
export function ColorIdentity({ colors }: { colors: string[] }) {
  if (colors.length === 0) {
    return <span className="inline-block size-2.5 rounded-full bg-neutral-600" title="Incolora" />
  }

  return (
    <span className="inline-flex gap-0.5">
      {colors.map((c) => (
        <span
          key={c}
          title={c}
          className="inline-block size-2.5 rounded-full"
          style={{ background: COLOR_DOT[c] ?? '#666' }}
        />
      ))}
    </span>
  )
}
