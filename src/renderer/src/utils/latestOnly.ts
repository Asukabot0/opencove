export interface LatestOnlyRequestStore<Key> {
  start: (key: Key) => number
  isLatest: (key: Key, token: number) => boolean
}

export function createLatestOnlyRequestStore<Key>(): LatestOnlyRequestStore<Key> {
  const latestTokenByKey = new Map<Key, number>()

  return {
    start(key) {
      const next = (latestTokenByKey.get(key) ?? 0) + 1
      latestTokenByKey.set(key, next)
      return next
    },
    isLatest(key, token) {
      return (latestTokenByKey.get(key) ?? 0) === token
    },
  }
}
