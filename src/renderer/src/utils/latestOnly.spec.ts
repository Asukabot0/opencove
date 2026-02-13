import { describe, expect, it } from 'vitest'
import { createLatestOnlyRequestStore } from './latestOnly'

describe('createLatestOnlyRequestStore', () => {
  it('treats the most recent token as latest per key', () => {
    const store = createLatestOnlyRequestStore<string>()

    const first = store.start('codex')
    expect(store.isLatest('codex', first)).toBe(true)

    const second = store.start('codex')
    expect(store.isLatest('codex', first)).toBe(false)
    expect(store.isLatest('codex', second)).toBe(true)

    const other = store.start('claude')
    expect(store.isLatest('claude', other)).toBe(true)
    expect(store.isLatest('claude', second)).toBe(false)
  })
})
