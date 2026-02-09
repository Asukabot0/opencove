import type { AgentLaunchMode, AgentProviderId } from '../../../shared/types/api'

interface BuildAgentLaunchCommandInput {
  provider: AgentProviderId
  mode: AgentLaunchMode
  prompt?: string
  model: string | null
  resumeSessionId: string | null
}

export interface AgentLaunchCommand {
  command: string
  args: string[]
  launchMode: AgentLaunchMode
  effectiveModel: string | null
  resumeSessionId: string | null
}

function normalizeOptionalValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizePrompt(value: string | undefined): string {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (normalized.length === 0) {
    throw new Error('Agent prompt cannot be empty')
  }

  return normalized
}

export function buildAgentLaunchCommand(input: BuildAgentLaunchCommandInput): AgentLaunchCommand {
  const effectiveModel = normalizeOptionalValue(input.model)
  const resumeSessionId = normalizeOptionalValue(input.resumeSessionId)

  if (input.provider === 'claude-code') {
    const args = ['--dangerously-skip-permissions']

    if (effectiveModel) {
      args.push('--model', effectiveModel)
    }

    if (input.mode === 'resume') {
      if (resumeSessionId) {
        args.push('--resume', resumeSessionId)
      } else {
        args.push('--continue')
      }

      return {
        command: 'claude',
        args,
        launchMode: 'resume',
        effectiveModel,
        resumeSessionId,
      }
    }

    args.push(normalizePrompt(input.prompt))

    return {
      command: 'claude',
      args,
      launchMode: 'new',
      effectiveModel,
      resumeSessionId: null,
    }
  }

  if (input.mode === 'resume') {
    const args = ['resume']

    if (resumeSessionId) {
      args.push(resumeSessionId)
    } else {
      args.push('--last')
    }

    if (effectiveModel) {
      args.push('--model', effectiveModel)
    }

    return {
      command: 'codex',
      args,
      launchMode: 'resume',
      effectiveModel,
      resumeSessionId,
    }
  }

  const args = ['--full-auto']

  if (effectiveModel) {
    args.push('--model', effectiveModel)
  }

  args.push(normalizePrompt(input.prompt))

  return {
    command: 'codex',
    args,
    launchMode: 'new',
    effectiveModel,
    resumeSessionId: null,
  }
}
