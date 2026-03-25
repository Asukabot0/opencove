import { describe, expect, it, vi, beforeEach } from 'vitest'
import type {
  CredentialResolver,
  HostKeyVerifier,
  SshCredentialRequest,
} from '../../../src/platform/process/ssh/SshAdapter'

const { mockShellStream, mockClient } = vi.hoisted(() => {
  const mockShellStream = {
    on: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
    setWindow: vi.fn(),
  }
  const mockClient = {
    on: vi.fn(),
    connect: vi.fn(),
    shell: vi.fn(),
    end: vi.fn(),
  }
  return { mockShellStream, mockClient }
})

vi.mock('ssh2', () => {
  function ClientCtor() {
    return mockClient
  }
  return { Client: ClientCtor }
})

describe('SshAdapter', () => {
  let credentialResolver: CredentialResolver
  let hostKeyVerifier: HostKeyVerifier

  beforeEach(() => {
    vi.clearAllMocks()

    credentialResolver = vi.fn()
    hostKeyVerifier = vi.fn().mockResolvedValue(true)

    // Reset mock implementations
    mockClient.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'ready') {
        // Store ready handler to call later
        ;(mockClient as Record<string, unknown>)._readyHandler = handler
      }
      if (event === 'error') {
        ;(mockClient as Record<string, unknown>)._errorHandler = handler
      }
      if (event === 'end') {
        ;(mockClient as Record<string, unknown>)._endHandler = handler
      }
      return mockClient
    })

    mockClient.connect.mockImplementation((config: { hostVerifier?: (key: Buffer) => boolean }) => {
      // Simulate ssh2 calling hostVerifier with a mock host key in wire format
      if (config.hostVerifier) {
        const keyType = 'ssh-ed25519'
        const keyBuf = Buffer.alloc(4 + keyType.length + 32)
        keyBuf.writeUInt32BE(keyType.length, 0)
        keyBuf.write(keyType, 4)
        config.hostVerifier(keyBuf)
      }
      // Auto-trigger ready
      const handler = (mockClient as Record<string, unknown>)._readyHandler as () => void
      if (handler) {
        setTimeout(handler, 0)
      }
    })

    mockClient.shell.mockImplementation(
      (_opts: unknown, cb: (err: Error | null, stream: typeof mockShellStream) => void) => {
        cb(null, mockShellStream)
      },
    )

    mockShellStream.on.mockImplementation(() => mockShellStream)
  })

  async function createAdapter() {
    const { SshAdapter } = await import('../../../src/platform/process/ssh/SshAdapter')
    return new SshAdapter({ credentialResolver, hostKeyVerifier })
  }

  it('opens an SSH session with agent auth', async () => {
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      targetId: 'target-1',
      sshHost: '192.168.1.1',
      sshPort: 22,
      sshUsername: 'user',
      sshAuthMethod: 'agent',
    })

    expect(result.sessionId).toBeDefined()
    expect(result.stream).toBeDefined()
    expect(result.stream.onData).toBeInstanceOf(Function)
    expect(result.stream.onExit).toBeInstanceOf(Function)
    expect(mockClient.connect).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '192.168.1.1',
        port: 22,
        username: 'user',
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
      }),
    )

    adapter.disposeAll()
  })

  it('writes data as buffer to SSH stream', async () => {
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      sshHost: 'test',
      sshUsername: 'user',
      sshAuthMethod: 'agent',
    })

    adapter.write(result.sessionId, 'hello')
    expect(mockShellStream.write).toHaveBeenCalledWith(Buffer.from('hello', 'utf8'))

    adapter.disposeAll()
  })

  it('resizes SSH stream with setWindow', async () => {
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      sshHost: 'test',
      sshUsername: 'user',
      sshAuthMethod: 'agent',
    })

    adapter.resize(result.sessionId, 120, 40)
    expect(mockShellStream.setWindow).toHaveBeenCalledWith(40, 120, 640, 960)

    adapter.disposeAll()
  })

  it('kills SSH session by closing stream and ending client', async () => {
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      sshHost: 'test',
      sshUsername: 'user',
      sshAuthMethod: 'agent',
    })

    adapter.kill(result.sessionId)
    expect(mockShellStream.close).toHaveBeenCalled()
    expect(mockClient.end).toHaveBeenCalled()
  })

  it('manages snapshot buffer with truncation', async () => {
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      sshHost: 'test',
      sshUsername: 'user',
      sshAuthMethod: 'agent',
    })

    expect(adapter.snapshot(result.sessionId)).toBe('')

    adapter.appendSnapshotData(result.sessionId, 'line1\n')
    adapter.appendSnapshotData(result.sessionId, 'line2\n')
    expect(adapter.snapshot(result.sessionId)).toBe('line1\nline2\n')

    adapter.disposeAll()
  })

  it('rejects when host key verification fails', async () => {
    hostKeyVerifier = vi.fn().mockResolvedValue(false)
    const adapter = await createAdapter()

    await expect(
      adapter.open({
        sessionKind: 'ssh',
        cols: 80,
        rows: 24,
        sshHost: 'badhost',
        sshUsername: 'user',
        sshAuthMethod: 'agent',
      }),
    ).rejects.toThrow('Host key verification rejected')
  })

  it('resolves password credential via callback', async () => {
    credentialResolver = vi
      .fn()
      .mockImplementation((req: SshCredentialRequest) =>
        Promise.resolve({ requestId: req.requestId, value: 's3cret' }),
      )
    const adapter = await createAdapter()

    const result = await adapter.open({
      sessionKind: 'ssh',
      cols: 80,
      rows: 24,
      sshHost: 'test',
      sshUsername: 'user',
      sshAuthMethod: 'password',
      targetId: 'target-1',
    })

    expect(credentialResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: 'target-1',
        type: 'password',
      }),
    )
    expect(result.sessionId).toBeDefined()
    expect(mockClient.connect).toHaveBeenCalledWith(expect.objectContaining({ password: 's3cret' }))

    adapter.disposeAll()
  })

  it('rejects when credential is cancelled', async () => {
    credentialResolver = vi
      .fn()
      .mockImplementation((req: SshCredentialRequest) =>
        Promise.resolve({ requestId: req.requestId, value: '', cancelled: true }),
      )
    const adapter = await createAdapter()

    await expect(
      adapter.open({
        sessionKind: 'ssh',
        cols: 80,
        rows: 24,
        sshHost: 'test',
        sshUsername: 'user',
        sshAuthMethod: 'password',
      }),
    ).rejects.toThrow('Credential request cancelled by user')
  })

  it('returns empty snapshot for unknown session', async () => {
    const adapter = await createAdapter()
    expect(adapter.snapshot('nonexistent')).toBe('')
  })
})
