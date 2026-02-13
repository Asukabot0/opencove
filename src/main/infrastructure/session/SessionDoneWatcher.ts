import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import type { AgentProviderId } from '../../../shared/types/api'
import { detectDoneSignalFromSessionLine } from './DoneSignalDetector'

interface SessionDoneWatcherOptions {
  provider: AgentProviderId
  sessionId: string
  filePath: string
  onDone: (sessionId: string) => void
  onError?: (error: unknown) => void
}

function isFileMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const record = error as { code?: unknown }
  return record.code === 'ENOENT'
}

const READ_CHUNK_BYTES = 64 * 1024

export class SessionDoneWatcher {
  private readonly provider: AgentProviderId
  private readonly sessionId: string
  private readonly filePath: string
  private readonly onDone: (sessionId: string) => void
  private readonly onError?: (error: unknown) => void

  private watcher: fs.FSWatcher | null = null
  private offset = 0
  private remainder = ''
  private decoder = new StringDecoder('utf8')
  private disposed = false
  private processing = false
  private hasPendingRead = false
  private hasTriggeredDone = false

  public constructor(options: SessionDoneWatcherOptions) {
    this.provider = options.provider
    this.sessionId = options.sessionId
    this.filePath = options.filePath
    this.onDone = options.onDone
    this.onError = options.onError
  }

  public start(): void {
    if (this.disposed) {
      return
    }

    this.scheduleRead()

    try {
      this.watcher = fs.watch(this.filePath, () => {
        this.scheduleRead()
      })
    } catch (error) {
      if (isFileMissingError(error)) {
        return
      }

      this.onError?.(error)
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true

    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private scheduleRead(): void {
    if (this.disposed || this.hasTriggeredDone) {
      return
    }

    if (this.processing) {
      this.hasPendingRead = true
      return
    }

    this.processing = true

    void this.readLoop()
  }

  private async readLoop(): Promise<void> {
    try {
      await this.readPendingChunks()
    } catch (error) {
      if (!isFileMissingError(error)) {
        this.onError?.(error)
      }
    } finally {
      this.processing = false
    }
  }

  private async readPendingChunks(): Promise<void> {
    this.hasPendingRead = false
    await this.readFileDelta()

    if (this.hasPendingRead && !this.disposed && !this.hasTriggeredDone) {
      await this.readPendingChunks()
    }
  }

  private async readFileDelta(): Promise<void> {
    const handle = await fsPromises.open(this.filePath, 'r')

    try {
      const stats = await handle.stat()

      if (stats.size < this.offset) {
        this.offset = 0
        this.remainder = ''
        this.decoder = new StringDecoder('utf8')
      }

      if (stats.size === this.offset) {
        return
      }

      const end = stats.size
      let position = this.offset

      while (position < end && !this.disposed && !this.hasTriggeredDone) {
        const bytesToRead = Math.min(READ_CHUNK_BYTES, end - position)
        const buffer = Buffer.allocUnsafe(bytesToRead)
        // eslint-disable-next-line no-await-in-loop
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, position)
        if (bytesRead <= 0) {
          break
        }

        position += bytesRead

        const textChunk = this.decoder.write(buffer.subarray(0, bytesRead))
        if (textChunk.length === 0) {
          continue
        }

        const merged = `${this.remainder}${textChunk}`
        const lines = merged.split('\n')
        this.remainder = lines.pop() ?? ''

        for (const line of lines) {
          if (!detectDoneSignalFromSessionLine(this.provider, line)) {
            continue
          }

          this.hasTriggeredDone = true
          this.onDone(this.sessionId)
          this.dispose()
          return
        }
      }

      this.offset = position
    } finally {
      await handle.close()
    }
  }
}
