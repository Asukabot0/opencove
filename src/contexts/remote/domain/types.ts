export interface RemoteTarget {
  id: string
  workspaceId: string
  name: string
  host: string
  port: number
  username: string
  authMethod: string
  keyPath: string | null
  forwardAgent: boolean
  source: string
  importedFrom: string | null
  secretRef: string | null
  connectTimeout: number
  createdAt: string
  updatedAt: string
}

export interface RemoteTargetRepository {
  findById(id: string): RemoteTarget | null
  findByWorkspaceId(workspaceId: string): RemoteTarget[]
  create(target: RemoteTarget): void
  update(target: RemoteTarget): void
  delete(id: string): void
}
