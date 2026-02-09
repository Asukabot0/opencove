interface PtySize {
  cols: number
  rows: number
}

interface ResolveStablePtySizeInput {
  previous: PtySize | null
  measured: PtySize
  preventRowShrink: boolean
}

function toPositiveInteger(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null
  }

  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : null
}

export function resolveStablePtySize({
  previous,
  measured,
  preventRowShrink,
}: ResolveStablePtySizeInput): PtySize | null {
  const cols = toPositiveInteger(measured.cols)
  const rows = toPositiveInteger(measured.rows)

  if (!cols || !rows) {
    return null
  }

  if (!previous) {
    return { cols, rows }
  }

  const nextRows = preventRowShrink ? Math.max(previous.rows, rows) : rows

  if (previous.cols === cols && previous.rows === nextRows) {
    return null
  }

  return {
    cols,
    rows: nextRows,
  }
}
