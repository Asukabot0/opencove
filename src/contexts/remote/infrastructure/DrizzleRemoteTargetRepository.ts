import { and, eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { remoteTargets } from '../../../platform/persistence/sqlite/schema'
import type { RemoteTarget } from '../domain/RemoteTarget'
import type { RemoteTargetRepository } from '../domain/RemoteTargetRepository'
import type { AuthMethod, RemoteTargetSource } from '../domain/types'

function rowToRemoteTarget(row: typeof remoteTargets.$inferSelect): RemoteTarget {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    authMethod: row.authMethod as AuthMethod,
    keyPath: row.keyPath,
    forwardAgent: row.forwardAgent !== 0,
    source: row.source as RemoteTargetSource,
    importedFrom: row.importedFrom,
    secretRef: row.secretRef,
    connectTimeout: row.connectTimeout,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class DrizzleRemoteTargetRepository implements RemoteTargetRepository {
  constructor(private readonly db: BetterSQLite3Database) {}

  findById(id: string): RemoteTarget | null {
    const row = this.db.select().from(remoteTargets).where(eq(remoteTargets.id, id)).get()
    return row ? rowToRemoteTarget(row) : null
  }

  findByHost(host: string, port: number): RemoteTarget | null {
    const row = this.db
      .select()
      .from(remoteTargets)
      .where(and(eq(remoteTargets.host, host), eq(remoteTargets.port, port)))
      .get()
    return row ? rowToRemoteTarget(row) : null
  }

  findByWorkspaceId(workspaceId: string): RemoteTarget[] {
    const rows = this.db
      .select()
      .from(remoteTargets)
      .where(eq(remoteTargets.workspaceId, workspaceId))
      .all()
    return rows.map(rowToRemoteTarget)
  }

  create(target: RemoteTarget): void {
    this.db
      .insert(remoteTargets)
      .values({
        id: target.id,
        workspaceId: target.workspaceId,
        name: target.name,
        host: target.host,
        port: target.port,
        username: target.username,
        authMethod: target.authMethod,
        keyPath: target.keyPath,
        forwardAgent: target.forwardAgent ? 1 : 0,
        source: target.source,
        importedFrom: target.importedFrom,
        secretRef: target.secretRef,
        connectTimeout: target.connectTimeout,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      })
      .run()
  }

  update(target: RemoteTarget): void {
    this.db
      .update(remoteTargets)
      .set({
        workspaceId: target.workspaceId,
        name: target.name,
        host: target.host,
        port: target.port,
        username: target.username,
        authMethod: target.authMethod,
        keyPath: target.keyPath,
        forwardAgent: target.forwardAgent ? 1 : 0,
        source: target.source,
        importedFrom: target.importedFrom,
        secretRef: target.secretRef,
        connectTimeout: target.connectTimeout,
        updatedAt: target.updatedAt,
      })
      .where(eq(remoteTargets.id, target.id))
      .run()
  }

  delete(id: string): void {
    this.db.delete(remoteTargets).where(eq(remoteTargets.id, id)).run()
  }
}
