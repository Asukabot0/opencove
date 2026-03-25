import SSHConfig from 'ssh-config'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { AuthMethod } from '../domain/types'

export interface ParsedSshHost {
  host: string
  hostName: string
  user: string | null
  port: number
  identityFile: string | null
  forwardAgent: boolean
}

export interface SshConfigParseResult {
  hosts: ParsedSshHost[]
  unsupportedDirectives: string[]
}

const SUPPORTED_DIRECTIVES = new Set([
  'Host',
  'HostName',
  'User',
  'Port',
  'IdentityFile',
  'ForwardAgent',
])

export function parseSshConfig(configPath?: string): SshConfigParseResult {
  const path = configPath ?? join(homedir(), '.ssh', 'config')

  if (!existsSync(path)) {
    return { hosts: [], unsupportedDirectives: [] }
  }

  const raw = readFileSync(path, 'utf8')
  const config = SSHConfig.parse(raw)

  const unsupportedDirectives = new Set<string>()
  const hosts: ParsedSshHost[] = []

  for (const section of config) {
    if (section.type !== SSHConfig.DIRECTIVE || section.param !== 'Host') {continue}
    const hostPattern = String(section.value ?? '')
    if (!hostPattern || hostPattern.includes('*') || hostPattern.includes('?')) {continue}

    const computed = config.compute(hostPattern)

    // Collect unsupported directives from this section
    if ('config' in section && Array.isArray(section.config)) {
      for (const line of section.config) {
        if (
          line.type === SSHConfig.DIRECTIVE &&
          line.param &&
          !SUPPORTED_DIRECTIVES.has(line.param)
        ) {
          unsupportedDirectives.add(line.param)
        }
      }
    }

    const portRaw = computed.Port
    const port = portRaw ? Number(Array.isArray(portRaw) ? portRaw[0] : portRaw) : 22

    const hostNameRaw = computed.HostName
    const hostName = Array.isArray(hostNameRaw)
      ? (hostNameRaw[0] ?? hostPattern)
      : (hostNameRaw ?? hostPattern)

    const userRaw = computed.User
    const user = Array.isArray(userRaw) ? (userRaw[0] ?? null) : (userRaw ?? null)

    const identityFileRaw = computed.IdentityFile
    const identityFile = Array.isArray(identityFileRaw)
      ? (identityFileRaw[0] ?? null)
      : (identityFileRaw ?? null)

    const forwardAgentRaw = computed.ForwardAgent
    const forwardAgent = Array.isArray(forwardAgentRaw)
      ? forwardAgentRaw[0] === 'yes'
      : forwardAgentRaw === 'yes'

    hosts.push({
      host: hostPattern,
      hostName,
      user,
      port: Number.isFinite(port) ? port : 22,
      identityFile,
      forwardAgent,
    })
  }

  return { hosts, unsupportedDirectives: [...unsupportedDirectives] }
}

export function inferAuthMethod(host: ParsedSshHost): AuthMethod {
  if (host.identityFile) {return 'key'}
  return 'agent'
}
