export interface RollingTextBuffer {
  set: (text: string) => void
  append: (chunk: string) => void
  snapshot: () => string
}

interface RollingTextBufferState {
  chunks: string[]
  head: number
  length: number
}

function trimToMax(state: RollingTextBufferState, maxChars: number): void {
  if (state.length <= maxChars) {
    return
  }

  let excess = state.length - maxChars

  while (excess > 0 && state.head < state.chunks.length) {
    const headChunk = state.chunks[state.head] ?? ''
    if (headChunk.length <= excess) {
      excess -= headChunk.length
      state.length -= headChunk.length
      state.head += 1
      continue
    }

    state.chunks[state.head] = headChunk.slice(excess)
    state.length -= excess
    excess = 0
  }

  if (state.head > 64) {
    state.chunks = state.chunks.slice(state.head)
    state.head = 0
  }
}

export function createRollingTextBuffer(options: {
  maxChars: number
  initial?: string
}): RollingTextBuffer {
  const state: RollingTextBufferState = {
    chunks: [],
    head: 0,
    length: 0,
  }

  const maxChars = Math.max(0, Math.floor(options.maxChars))

  const set = (text: string) => {
    const normalized = maxChars > 0 && text.length > maxChars ? text.slice(-maxChars) : text

    state.chunks = normalized.length === 0 ? [] : [normalized]
    state.head = 0
    state.length = normalized.length
  }

  const append = (chunk: string) => {
    if (chunk.length === 0 || maxChars === 0) {
      return
    }

    if (chunk.length >= maxChars) {
      set(chunk.slice(-maxChars))
      return
    }

    state.chunks.push(chunk)
    state.length += chunk.length
    trimToMax(state, maxChars)
  }

  const snapshot = () => {
    if (state.length === 0 || state.head >= state.chunks.length) {
      return ''
    }

    return state.chunks.slice(state.head).join('')
  }

  set(options.initial ?? '')

  return {
    set,
    append,
    snapshot,
  }
}
