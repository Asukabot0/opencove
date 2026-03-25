import type { DisconnectReason } from '@contexts/remote/domain/types'

export interface RemoteTargetDto {
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

export interface CreateRemoteTargetInput {
  workspaceId: string
  name: string
  host: string
  port?: number
  username: string
  authMethod?: string
  keyPath?: string | null
  forwardAgent?: boolean
  connectTimeout?: number
}

export interface UpdateRemoteTargetInput {
  id: string
  name?: string
  host?: string
  port?: number
  username?: string
  authMethod?: string
  keyPath?: string | null
  forwardAgent?: boolean
  connectTimeout?: number
}

export interface DeleteRemoteTargetInput {
  id: string
  force?: boolean
}

export interface DeleteRemoteTargetResult {
  deleted: boolean
  hasActiveSessions: boolean
  count: number
}

export type ImportConflictStrategy = 'skip' | 'overwrite' | 'create-duplicate'

export interface ImportSshConfigInput {
  workspaceId: string
  configPath?: string
  conflictStrategy?: ImportConflictStrategy
}

export interface ImportSshConfigResult {
  imported: number
  skipped: number
  overwritten: number
  unsupportedDirectives: string[]
}

export interface SshConnectInput {
  targetId: string
  cols: number
  rows: number
}

export interface SshConnectResult {
  sessionId: string
  sessionKind: 'ssh'
}

export interface SshConnectError {
  error: DisconnectReason
  message: string
}

export interface SshCredentialRequestDto {
  requestId: string
  targetId: string
  type: 'password' | 'passphrase' | 'keyboard-interactive'
  prompt?: string
}

export interface SshCredentialResponseDto {
  requestId: string
  value: string
  cancelled?: boolean
}

export type SshConnectionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected'

export interface SshConnectionStateEvent {
  sessionId: string
  state: SshConnectionState
  disconnectReason?: DisconnectReason
}
