import { randomUUID } from 'node:crypto'
import type { RemoteTarget } from '../domain/RemoteTarget'
import type { RemoteTargetRepository } from '../domain/RemoteTargetRepository'
import { parseSshConfig, inferAuthMethod } from '../infrastructure/SshConfigParser'
import type {
  ImportConflictStrategy,
  ImportSshConfigResult,
} from '../../../shared/contracts/dto/remote'

export function importSshConfig(
  repo: RemoteTargetRepository,
  workspaceId: string,
  configPath?: string,
  conflictStrategy: ImportConflictStrategy = 'skip',
): ImportSshConfigResult {
  const { hosts, unsupportedDirectives } = parseSshConfig(configPath)

  let imported = 0
  let skipped = 0
  let overwritten = 0

  for (const host of hosts) {
    const existing = repo.findByHost(host.hostName, host.port)

    if (existing) {
      if (conflictStrategy === 'skip') {
        skipped++
        continue
      }

      if (conflictStrategy === 'overwrite') {
        repo.update({
          ...existing,
          name: host.host,
          username: host.user ?? existing.username,
          authMethod: inferAuthMethod(host),
          keyPath: host.identityFile,
          forwardAgent: host.forwardAgent,
          source: 'ssh_config',
          importedFrom: configPath ?? '~/.ssh/config',
          updatedAt: new Date().toISOString(),
        })
        overwritten++
        continue
      }
      // create-duplicate: fall through to create
    }

    const now = new Date().toISOString()
    const target: RemoteTarget = {
      id: randomUUID(),
      workspaceId,
      name: host.host,
      host: host.hostName,
      port: host.port,
      username: host.user ?? 'root',
      authMethod: inferAuthMethod(host),
      keyPath: host.identityFile,
      forwardAgent: host.forwardAgent,
      source: 'ssh_config',
      importedFrom: configPath ?? '~/.ssh/config',
      secretRef: null,
      connectTimeout: 10000,
      createdAt: now,
      updatedAt: now,
    }
    repo.create(target)
    imported++
  }

  return { imported, skipped, overwritten, unsupportedDirectives }
}
