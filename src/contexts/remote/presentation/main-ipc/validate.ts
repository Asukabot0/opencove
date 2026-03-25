import type {
  CreateRemoteTargetInput,
  UpdateRemoteTargetInput,
  DeleteRemoteTargetInput,
  ImportSshConfigInput,
} from '../../../../shared/contracts/dto/remote'

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isOptionalString(v: unknown): boolean {
  return v === undefined || v === null || typeof v === 'string'
}

function isOptionalNumber(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isFinite(v))
}

function isOptionalBoolean(v: unknown): boolean {
  return v === undefined || typeof v === 'boolean'
}

const VALID_AUTH_METHODS = ['key', 'password', 'agent', 'keyboard-interactive']

export function validateCreateTarget(input: unknown): CreateRemoteTargetInput | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const o = input as Record<string, unknown>

  if (!isNonEmptyString(o.workspaceId)) {
    return null
  }
  if (!isNonEmptyString(o.name)) {
    return null
  }
  if (!isNonEmptyString(o.host)) {
    return null
  }
  if (!isNonEmptyString(o.username)) {
    return null
  }
  if (!isOptionalNumber(o.port)) {
    return null
  }
  if (o.authMethod !== undefined && !VALID_AUTH_METHODS.includes(o.authMethod as string)) {
    return null
  }
  if (!isOptionalString(o.keyPath)) {
    return null
  }
  if (!isOptionalBoolean(o.forwardAgent)) {
    return null
  }
  if (!isOptionalNumber(o.connectTimeout)) {
    return null
  }

  return input as CreateRemoteTargetInput
}

export function validateUpdateTarget(input: unknown): UpdateRemoteTargetInput | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const o = input as Record<string, unknown>

  if (!isNonEmptyString(o.id)) {
    return null
  }
  if (!isOptionalString(o.name)) {
    return null
  }
  if (!isOptionalString(o.host)) {
    return null
  }
  if (!isOptionalNumber(o.port)) {
    return null
  }
  if (!isOptionalString(o.username)) {
    return null
  }
  if (o.authMethod !== undefined && !VALID_AUTH_METHODS.includes(o.authMethod as string)) {
    return null
  }
  if (!isOptionalString(o.keyPath)) {
    return null
  }
  if (!isOptionalBoolean(o.forwardAgent)) {
    return null
  }
  if (!isOptionalNumber(o.connectTimeout)) {
    return null
  }

  return input as UpdateRemoteTargetInput
}

export function validateDeleteTarget(input: unknown): DeleteRemoteTargetInput | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const o = input as Record<string, unknown>

  if (!isNonEmptyString(o.id)) {
    return null
  }
  if (!isOptionalBoolean(o.force)) {
    return null
  }

  return input as DeleteRemoteTargetInput
}

export function validateImportSshConfig(input: unknown): ImportSshConfigInput | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const o = input as Record<string, unknown>

  if (!isNonEmptyString(o.workspaceId)) {
    return null
  }
  if (!isOptionalString(o.configPath)) {
    return null
  }
  if (o.conflictStrategy !== undefined) {
    if (!['skip', 'overwrite', 'create-duplicate'].includes(o.conflictStrategy as string)) {
      return null
    }
  }

  return input as ImportSshConfigInput
}
