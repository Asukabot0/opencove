#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * P1-0 Feasibility spike: Verify ssh2 and ssh-config work in Node/Electron main process.
 *
 * Usage: node scripts/spike-ssh-compat.mjs
 *
 * keytar verdict: SKIP — Electron safeStorage API is the recommended replacement.
 * See .omc/research/ssh-native-module-compat.md for full findings.
 */

import { Client } from 'ssh2'
import SSHConfig from 'ssh-config'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const results = { ssh2: 'UNKNOWN', sshConfig: 'UNKNOWN', keytar: 'SKIPPED' }

// --- ssh2: verify module loads and Client can be instantiated ---
try {
  const client = new Client()
  if (typeof client.connect === 'function' && typeof client.on === 'function') {
    results.ssh2 = 'PASS'
    console.log('[ssh2]       PASS — Client instantiated, connect/on methods available')
  } else {
    results.ssh2 = 'FAIL'
    console.log('[ssh2]       FAIL — Client missing expected methods')
  }
  client.end()
} catch (err) {
  results.ssh2 = 'FAIL'
  console.log(`[ssh2]       FAIL — ${err.message}`)
}

// --- ssh-config: verify module loads and can parse config ---
try {
  const sshConfigPath = join(homedir(), '.ssh', 'config')
  if (existsSync(sshConfigPath)) {
    const raw = readFileSync(sshConfigPath, 'utf8')
    const config = SSHConfig.parse(raw)
    const hosts = config.filter(section => section.param === 'Host').map(section => section.value)
    results.sshConfig = 'PASS'
    console.log(
      `[ssh-config] PASS — parsed ${hosts.length} host(s): ${hosts.slice(0, 5).join(', ')}${hosts.length > 5 ? '...' : ''}`,
    )
  } else {
    // No config file is valid — module still loads fine
    const config = SSHConfig.parse('Host test\n  HostName 127.0.0.1\n  Port 22\n  User root')
    const computed = config.compute('test')
    results.sshConfig = 'PASS'
    console.log(
      `[ssh-config] PASS — no ~/.ssh/config found, synthetic parse OK (HostName=${computed.HostName})`,
    )
  }
} catch (err) {
  results.sshConfig = 'FAIL'
  console.log(`[ssh-config] FAIL — ${err.message}`)
}

// --- keytar: SKIPPED ---
console.log('[keytar]     SKIPPED — use Electron safeStorage API instead (no native dep needed)')

// --- summary ---
console.log('\n=== Spike Summary ===')
for (const [lib, status] of Object.entries(results)) {
  console.log(`  ${lib}: ${status}`)
}

const allPassed = results.ssh2 === 'PASS' && results.sshConfig === 'PASS'
console.log(
  `\nVerdict: ${allPassed ? 'ALL PASS — safe to proceed with SSH implementation' : 'ISSUES FOUND — see above'}`,
)
process.exit(allPassed ? 0 : 1)
