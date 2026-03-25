import type { AuthMethod, RemoteTargetSource } from './types'

export interface RemoteTarget {
  id: string
  workspaceId: string
  name: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  keyPath: string | null
  forwardAgent: boolean
  source: RemoteTargetSource
  importedFrom: string | null
  secretRef: string | null
  connectTimeout: number
  createdAt: string
  updatedAt: string
}
