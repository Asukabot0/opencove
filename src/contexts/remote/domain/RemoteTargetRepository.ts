import type { RemoteTarget } from './RemoteTarget'

export interface RemoteTargetRepository {
  findById(id: string): RemoteTarget | null
  findByHost(host: string, port: number): RemoteTarget | null
  findByWorkspaceId(workspaceId: string): RemoteTarget[]
  create(target: RemoteTarget): void
  update(target: RemoteTarget): void
  delete(id: string): void
}
