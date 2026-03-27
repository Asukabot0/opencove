import { randomUUID } from 'node:crypto'
import type { RemoteTarget } from '../domain/RemoteTarget'
import type { RemoteTargetRepository } from '../domain/RemoteTargetRepository'
import type { AuthMethod } from '../domain/types'
import type {
  CreateRemoteTargetInput,
  UpdateRemoteTargetInput,
  DeleteRemoteTargetResult,
} from '../../../shared/contracts/dto/remote'

export function listTargets(repo: RemoteTargetRepository, workspaceId: string): RemoteTarget[] {
  return repo.findByWorkspaceId(workspaceId)
}

export function getTarget(repo: RemoteTargetRepository, id: string): RemoteTarget | null {
  return repo.findById(id)
}

export function createTarget(
  repo: RemoteTargetRepository,
  input: CreateRemoteTargetInput,
): RemoteTarget {
  const now = new Date().toISOString()
  const target: RemoteTarget = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    name: input.name,
    host: input.host,
    port: input.port ?? 22,
    username: input.username,
    authMethod: (input.authMethod as AuthMethod) ?? 'key',
    keyPath: input.keyPath ?? null,
    forwardAgent: input.forwardAgent ?? false,
    source: 'manual',
    importedFrom: null,
    secretRef: null,
    connectTimeout: input.connectTimeout ?? 10000,
    createdAt: now,
    updatedAt: now,
  }
  repo.create(target)
  return target
}

export function updateTarget(
  repo: RemoteTargetRepository,
  input: UpdateRemoteTargetInput,
): RemoteTarget | null {
  const existing = repo.findById(input.id)
  if (!existing) {
    return null
  }

  const updated: RemoteTarget = {
    ...existing,
    name: input.name ?? existing.name,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    username: input.username ?? existing.username,
    authMethod: (input.authMethod as AuthMethod) ?? existing.authMethod,
    keyPath: input.keyPath !== undefined ? input.keyPath : existing.keyPath,
    forwardAgent: input.forwardAgent ?? existing.forwardAgent,
    connectTimeout: input.connectTimeout ?? existing.connectTimeout,
    updatedAt: new Date().toISOString(),
  }
  repo.update(updated)
  return updated
}

export function deleteTarget(
  repo: RemoteTargetRepository,
  id: string,
  _force?: boolean,
): DeleteRemoteTargetResult {
  const existing = repo.findById(id)
  if (!existing) {
    return { deleted: false, hasActiveSessions: false, count: 0 }
  }

  // TODO: query active sessions when TerminalSessionManager is wired
  repo.delete(id)
  return { deleted: true, hasActiveSessions: false, count: 0 }
}

export function deleteTargetsByWorkspaceId(
  repo: RemoteTargetRepository,
  workspaceId: string,
): void {
  const targets = repo.findByWorkspaceId(workspaceId)
  for (const target of targets) {
    repo.delete(target.id)
  }
}
