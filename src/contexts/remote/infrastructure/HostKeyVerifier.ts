import { createHmac, createHash } from 'node:crypto'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { mkdirSync } from 'node:fs'

export type HostKeyStatus = 'trusted' | 'unknown' | 'mismatch'

export interface HostKeyVerifyResult {
  status: HostKeyStatus
  existingFingerprint?: string
}

function getKnownHostsPath(): string {
  if (platform() === 'win32') {
    return join(process.env.USERPROFILE ?? homedir(), '.ssh', 'known_hosts')
  }
  return join(homedir(), '.ssh', 'known_hosts')
}

function parseKnownHostsLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n')
  } catch {
    return []
  }
}

function matchHashedHost(hashedEntry: string, host: string, port: number): boolean {
  // Format: |1|<base64-salt>|<base64-hash>
  const parts = hashedEntry.split('|')
  if (parts.length !== 4 || parts[1] !== '1') {return false}

  const salt = Buffer.from(parts[2]!, 'base64')
  const expectedHash = parts[3]!

  const hostStr = port !== 22 ? `[${host}]:${port}` : host
  const computed = createHmac('sha1', salt).update(hostStr).digest('base64')

  return computed === expectedHash
}

function matchPlainHost(entry: string, host: string, port: number): boolean {
  const hostStr = port !== 22 ? `[${host}]:${port}` : host
  const hosts = entry.split(',')
  return hosts.some(h => h.trim() === hostStr)
}

function fingerprintFromKeyData(keyData: string): string {
  const keyBuffer = Buffer.from(keyData, 'base64')
  return createHash('sha256').update(keyBuffer).digest('base64')
}

export function verifyHostKey(
  host: string,
  port: number,
  keyType: string,
  keyData: string,
  knownHostsPath?: string,
): HostKeyVerifyResult {
  const path = knownHostsPath ?? getKnownHostsPath()
  const lines = parseKnownHostsLines(path)
  const incomingFingerprint = fingerprintFromKeyData(keyData)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {continue}

    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) {continue}

    const hostField = parts[0]!
    const entryKeyType = parts[1]!
    const entryKeyData = parts[2]!

    const isHashed = hostField.startsWith('|1|')
    const hostMatches = isHashed
      ? matchHashedHost(hostField, host, port)
      : matchPlainHost(hostField, host, port)

    if (!hostMatches) {continue}

    if (entryKeyType !== keyType) {continue}

    const existingFingerprint = fingerprintFromKeyData(entryKeyData)
    if (existingFingerprint === incomingFingerprint) {
      return { status: 'trusted' }
    }

    return { status: 'mismatch', existingFingerprint }
  }

  return { status: 'unknown' }
}

export function addTrustedKey(
  host: string,
  port: number,
  keyType: string,
  keyData: string,
  knownHostsPath?: string,
): void {
  const path = knownHostsPath ?? getKnownHostsPath()
  const dir = dirname(path)

  mkdirSync(dir, { recursive: true })

  const hostStr = port !== 22 ? `[${host}]:${port}` : host
  const entry = `${hostStr} ${keyType} ${keyData}\n`

  const existingLines = parseKnownHostsLines(path)
  const existingContent = existingLines.join('\n')
  const newContent = existingContent.endsWith('\n')
    ? existingContent + entry
    : existingContent + '\n' + entry

  // Atomic write: temp file + rename
  const tmpPath = path + '.tmp.' + process.pid
  writeFileSync(tmpPath, newContent, 'utf8')
  renameSync(tmpPath, path)
}
