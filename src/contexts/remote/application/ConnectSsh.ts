import type { RemoteTargetRepository } from '../domain/RemoteTargetRepository'
import type { DisconnectReason } from '../domain/types'
import { isPendingDelete } from './ManageRemoteTargets'
import type {
  SshConnectInput,
  SshConnectResult,
  SshConnectError,
} from '@shared/contracts/dto/remote'

export type SshConnectOutcome = SshConnectResult | SshConnectError

export interface SshSessionCreator {
  createSshSession(options: {
    targetId: string
    host: string
    port: number
    username: string
    authMethod: string
    keyPath: string | null
    forwardAgent: boolean
    connectTimeout: number
    cols: number
    rows: number
  }): Promise<{ sessionId: string }>
}

export async function connectSsh(
  repo: RemoteTargetRepository,
  sessionCreator: SshSessionCreator,
  input: SshConnectInput,
): Promise<SshConnectOutcome> {
  const target = repo.findById(input.targetId)
  if (!target) {
    return { error: 'unknown' as DisconnectReason, message: 'Target not found' }
  }

  if (isPendingDelete(input.targetId)) {
    return { error: 'user_cancelled' as DisconnectReason, message: 'Target is being deleted' }
  }

  try {
    const { sessionId } = await sessionCreator.createSshSession({
      targetId: target.id,
      host: target.host,
      port: target.port,
      username: target.username,
      authMethod: target.authMethod,
      keyPath: target.keyPath,
      forwardAgent: target.forwardAgent,
      connectTimeout: target.connectTimeout,
      cols: input.cols,
      rows: input.rows,
    })

    return { sessionId, sessionKind: 'ssh' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const reason = classifyConnectError(message)
    return { error: reason, message }
  }
}

function classifyConnectError(message: string): DisconnectReason {
  const msg = message.toLowerCase()
  if (msg.includes('authentication') || msg.includes('auth')) {return 'auth_failed'}
  if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('ehostunreach'))
    {return 'network_unreachable'}
  if (msg.includes('host key')) {return 'host_key_mismatch'}
  if (msg.includes('timed out') || msg.includes('timeout')) {return 'timeout'}
  if (msg.includes('cancelled') || msg.includes('canceled')) {return 'user_cancelled'}
  return 'unknown'
}
