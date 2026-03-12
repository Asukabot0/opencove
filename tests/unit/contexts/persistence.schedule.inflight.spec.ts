import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersistWriteResult } from '../../../src/shared/contracts/dto'

describe('workspace persistence (schedule in-flight)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('flushes the latest pending persisted state after an in-flight write finishes', async () => {
    vi.useFakeTimers()

    const writes: Array<string | null> = []
    const callbacks: string[] = []
    let resolveFirstWrite: ((result: PersistWriteResult) => void) | null = null

    const writePersistedState = vi
      .fn()
      .mockImplementationOnce(
        async (state: { activeWorkspaceId: string | null }): Promise<PersistWriteResult> => {
          writes.push(state.activeWorkspaceId)
          return await new Promise<PersistWriteResult>(resolve => {
            resolveFirstWrite = resolve
          })
        },
      )
      .mockImplementationOnce(
        async (state: { activeWorkspaceId: string | null }): Promise<PersistWriteResult> => {
          writes.push(state.activeWorkspaceId)
          return { ok: true, level: 'full', bytes: 2 }
        },
      )

    vi.doMock(
      '../../../src/contexts/workspace/presentation/renderer/utils/persistence/write',
      () => ({
        writePersistedState,
      }),
    )

    const { flushScheduledPersistedStateWrite, schedulePersistedStateWrite } =
      await import('../../../src/contexts/workspace/presentation/renderer/utils/persistence/schedule')
    const { toPersistedState } =
      await import('../../../src/contexts/workspace/presentation/renderer/utils/persistence/toPersistedState')

    schedulePersistedStateWrite(() => toPersistedState([], 'workspace-1'), {
      onResult: () => {
        callbacks.push('workspace-1')
      },
    })
    flushScheduledPersistedStateWrite()

    schedulePersistedStateWrite(() => toPersistedState([], 'workspace-2'), {
      onResult: () => {
        callbacks.push('workspace-2')
      },
    })
    flushScheduledPersistedStateWrite()

    expect(writePersistedState).toHaveBeenCalledTimes(1)
    expect(writes).toEqual(['workspace-1'])

    resolveFirstWrite?.({ ok: true, level: 'full', bytes: 1 })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(writePersistedState).toHaveBeenCalledTimes(2)
    expect(writes).toEqual(['workspace-1', 'workspace-2'])
    expect(callbacks).toEqual(['workspace-1', 'workspace-2'])
  })
})
