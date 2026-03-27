import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalWriteEncoding,
} from '../../../../shared/contracts/dto'
import type { SessionKind } from '../../../../shared/contracts/dto/terminal'
import {
  appendSnapshotData,
  createEmptySnapshotState,
  snapshotToString,
} from '../../../../platform/process/pty/snapshot'
import type { SnapshotState } from '../../../../platform/process/pty/snapshot'
import type {
  TerminalSessionAdapter,
  TerminalSessionOpenOptions,
  TerminalSessionOpenResult,
} from '../../domain/TerminalSessionAdapter'
import type {
  SessionStateWatcherStartInput,
  createSessionStateWatcherController,
} from './sessionStateWatcher'

const PTY_DATA_FLUSH_DELAY_MS = 32
const PTY_DATA_HIGH_VOLUME_FLUSH_DELAY_MS = 64
const PTY_DATA_HIGH_VOLUME_BATCH_CHARS = 32_000
const PTY_DATA_MAX_BATCH_CHARS = 256_000

export interface SessionManagerDeps {
  adapterRegistry: Map<SessionKind, TerminalSessionAdapter>
  sendToAllWindows: <T>(channel: string, payload: T) => void
  sendPtyDataToSubscriber: (contentsId: number, eventPayload: TerminalDataEvent) => void
  trackWebContentsDestroyed: (contentsId: number, onDestroyed: () => void) => boolean
  sessionStateWatcher: ReturnType<typeof createSessionStateWatcherController>
}

export class TerminalSessionManager {
  private readonly adapterRegistry: Map<SessionKind, TerminalSessionAdapter>
  private readonly sessionAdapterMap = new Map<string, TerminalSessionAdapter>()
  private readonly sessionKindMap = new Map<string, SessionKind>()
  private readonly sessionAgentWatcherSupport = new Map<string, boolean>()
  private readonly sendToAllWindows: SessionManagerDeps['sendToAllWindows']
  private readonly sendPtyDataToSubscriber: SessionManagerDeps['sendPtyDataToSubscriber']
  private readonly trackWebContentsDestroyed: SessionManagerDeps['trackWebContentsDestroyed']
  private readonly sessionStateWatcher: SessionManagerDeps['sessionStateWatcher']

  private readonly activeSessions = new Set<string>()
  private readonly terminatedSessions = new Set<string>()
  private readonly snapshots = new Map<string, SnapshotState>()
  private readonly terminalProbeBufferBySession = new Map<string, string>()

  private readonly pendingPtyDataChunksBySession = new Map<string, string[]>()
  private readonly pendingPtyDataCharsBySession = new Map<string, number>()
  private readonly pendingPtyDataFlushTimerBySession = new Map<string, NodeJS.Timeout>()
  private readonly pendingPtyDataFlushDelayBySession = new Map<string, number>()

  private readonly ptyDataSubscribersBySessionId = new Map<string, Set<number>>()
  private readonly ptyDataSessionsByWebContentsId = new Map<number, Set<string>>()
  private readonly ptyDataSubscribedWebContentsIds = new Set<number>()

  constructor(deps: SessionManagerDeps) {
    this.adapterRegistry = deps.adapterRegistry
    this.sendToAllWindows = deps.sendToAllWindows
    this.sendPtyDataToSubscriber = deps.sendPtyDataToSubscriber
    this.trackWebContentsDestroyed = deps.trackWebContentsDestroyed
    this.sessionStateWatcher = deps.sessionStateWatcher
  }

  private getSessionAdapter(sessionId: string): TerminalSessionAdapter | undefined {
    return this.sessionAdapterMap.get(sessionId)
  }

  // --- Subscription lifecycle ---

  private cleanupPtyDataSubscriptions(contentsId: number): void {
    const sessions = this.ptyDataSessionsByWebContentsId.get(contentsId)
    if (!sessions) {
      return
    }

    this.ptyDataSessionsByWebContentsId.delete(contentsId)

    for (const sessionId of sessions) {
      const subscribers = this.ptyDataSubscribersBySessionId.get(sessionId)
      if (!subscribers) {
        continue
      }

      subscribers.delete(contentsId)
      if (subscribers.size === 0) {
        this.ptyDataSubscribersBySessionId.delete(sessionId)
      }

      this.syncSessionProbeBuffer(sessionId)
    }
  }

  private cleanupSessionPtyDataSubscriptions(sessionId: string): void {
    const subscribers = this.ptyDataSubscribersBySessionId.get(sessionId)
    if (!subscribers) {
      return
    }

    this.ptyDataSubscribersBySessionId.delete(sessionId)

    for (const contentsId of subscribers) {
      const sessions = this.ptyDataSessionsByWebContentsId.get(contentsId)
      sessions?.delete(sessionId)
      if (sessions && sessions.size === 0) {
        this.ptyDataSessionsByWebContentsId.delete(contentsId)
      }
    }
  }

  private trackWebContentsSubscriptionLifecycle(contentsId: number): void {
    if (this.ptyDataSubscribedWebContentsIds.has(contentsId)) {
      return
    }

    const tracked = this.trackWebContentsDestroyed(contentsId, () => {
      this.ptyDataSubscribedWebContentsIds.delete(contentsId)
      this.cleanupPtyDataSubscriptions(contentsId)
    })

    if (tracked) {
      this.ptyDataSubscribedWebContentsIds.add(contentsId)
    }
  }

  // --- Probe buffer ---

  hasPtyDataSubscribers(sessionId: string): boolean {
    const subscribers = this.ptyDataSubscribersBySessionId.get(sessionId)
    return Boolean(subscribers && subscribers.size > 0)
  }

  private syncSessionProbeBuffer(sessionId: string): void {
    if (this.hasPtyDataSubscribers(sessionId)) {
      this.terminalProbeBufferBySession.delete(sessionId)
      return
    }

    this.terminalProbeBufferBySession.set(sessionId, '')
  }

  private registerSessionProbeState(sessionId: string): void {
    this.terminalProbeBufferBySession.set(sessionId, '')
  }

  private clearSessionProbeState(sessionId: string): void {
    this.terminalProbeBufferBySession.delete(sessionId)
  }

  private resolveTerminalProbeReplies(
    sessionId: string,
    outputChunk: string,
    adapter: TerminalSessionAdapter,
  ): void {
    if (outputChunk.includes('\u001b[6n')) {
      adapter.write(sessionId, '\u001b[1;1R')
    }

    if (outputChunk.includes('\u001b[?6n')) {
      adapter.write(sessionId, '\u001b[?1;1R')
    }

    if (outputChunk.includes('\u001b[c')) {
      adapter.write(sessionId, '\u001b[?1;2c')
    }

    if (outputChunk.includes('\u001b[>c')) {
      adapter.write(sessionId, '\u001b[>0;115;0c')
    }

    if (outputChunk.includes('\u001b[?u')) {
      adapter.write(sessionId, '\u001b[?0u')
    }
  }

  // --- Data broadcasting ---

  private sendPtyDataToSubscribers(eventPayload: TerminalDataEvent): void {
    const subscribers = this.ptyDataSubscribersBySessionId.get(eventPayload.sessionId)
    if (!subscribers || subscribers.size === 0) {
      return
    }

    for (const contentsId of subscribers) {
      this.sendPtyDataToSubscriber(contentsId, eventPayload)
    }
  }

  private resolvePtyDataFlushDelay(pendingChars: number): number {
    return pendingChars >= PTY_DATA_HIGH_VOLUME_BATCH_CHARS
      ? PTY_DATA_HIGH_VOLUME_FLUSH_DELAY_MS
      : PTY_DATA_FLUSH_DELAY_MS
  }

  private flushPtyDataBroadcast(sessionId: string): void {
    const timer = this.pendingPtyDataFlushTimerBySession.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.pendingPtyDataFlushTimerBySession.delete(sessionId)
    }

    this.pendingPtyDataFlushDelayBySession.delete(sessionId)

    const chunks = this.pendingPtyDataChunksBySession.get(sessionId)
    if (!chunks || chunks.length === 0) {
      this.pendingPtyDataChunksBySession.delete(sessionId)
      this.pendingPtyDataCharsBySession.delete(sessionId)
      return
    }

    this.pendingPtyDataChunksBySession.delete(sessionId)
    this.pendingPtyDataCharsBySession.delete(sessionId)

    const data = chunks.length === 1 ? (chunks[0] ?? '') : chunks.join('')
    if (data.length === 0) {
      return
    }

    if (this.activeSessions.has(sessionId)) {
      const snapshot = this.snapshots.get(sessionId)
      if (snapshot) {
        appendSnapshotData(snapshot, data)
      }
    }

    if (!this.hasPtyDataSubscribers(sessionId)) {
      return
    }

    const eventPayload: TerminalDataEvent = { sessionId, data }
    this.sendPtyDataToSubscribers(eventPayload)
  }

  private queuePtyDataBroadcast(sessionId: string, data: string): void {
    if (data.length === 0) {
      return
    }

    const chunks = this.pendingPtyDataChunksBySession.get(sessionId) ?? []
    if (chunks.length === 0) {
      this.pendingPtyDataChunksBySession.set(sessionId, chunks)
    }

    chunks.push(data)
    const pendingChars = (this.pendingPtyDataCharsBySession.get(sessionId) ?? 0) + data.length
    this.pendingPtyDataCharsBySession.set(sessionId, pendingChars)

    if (pendingChars >= PTY_DATA_MAX_BATCH_CHARS) {
      this.flushPtyDataBroadcast(sessionId)
      return
    }

    const nextDelayMs = this.resolvePtyDataFlushDelay(pendingChars)
    const existingTimer = this.pendingPtyDataFlushTimerBySession.get(sessionId)
    const existingDelayMs = this.pendingPtyDataFlushDelayBySession.get(sessionId)

    if (existingTimer && existingDelayMs !== undefined) {
      if (existingDelayMs >= nextDelayMs) {
        return
      }

      clearTimeout(existingTimer)
      this.pendingPtyDataFlushTimerBySession.delete(sessionId)
    }

    this.pendingPtyDataFlushDelayBySession.set(sessionId, nextDelayMs)
    this.pendingPtyDataFlushTimerBySession.set(
      sessionId,
      setTimeout(() => {
        this.flushPtyDataBroadcast(sessionId)
      }, nextDelayMs),
    )
  }

  // --- Session event wiring ---

  private wireSessionStreamEvents(
    sessionId: string,
    stream: {
      onData: (cb: (data: string) => void) => void
      onExit: (cb: (exit: { exitCode: number | null }) => void) => void
    },
    adapter: TerminalSessionAdapter,
  ): void {
    stream.onData((data: string) => {
      if (
        !this.hasPtyDataSubscribers(sessionId) &&
        this.sessionAgentWatcherSupport.get(sessionId)
      ) {
        const probeBuffer = `${this.terminalProbeBufferBySession.get(sessionId) ?? ''}${data}`
        this.resolveTerminalProbeReplies(sessionId, probeBuffer, adapter)
        this.terminalProbeBufferBySession.set(sessionId, probeBuffer.slice(-32))
      }

      this.handleData(sessionId, data)
    })

    stream.onExit((exit: { exitCode: number | null }) => {
      this.handleExit(sessionId, exit.exitCode ?? 0)
    })
  }

  // --- Public API ---

  open(
    sessionKind: SessionKind,
    options: TerminalSessionOpenOptions,
  ): TerminalSessionOpenResult | Promise<TerminalSessionOpenResult> {
    const adapter = this.adapterRegistry.get(sessionKind)
    if (!adapter) {
      throw new Error(`No adapter registered for session kind: ${sessionKind}`)
    }

    const result = adapter.open(options)

    const finalize = (opened: TerminalSessionOpenResult): TerminalSessionOpenResult => {
      this.sessionAdapterMap.set(opened.sessionId, adapter)
      this.sessionKindMap.set(opened.sessionId, sessionKind)
      this.sessionAgentWatcherSupport.set(opened.sessionId, sessionKind === 'local')
      this.activeSessions.add(opened.sessionId)
      this.terminatedSessions.delete(opened.sessionId)
      if (!this.snapshots.has(opened.sessionId)) {
        this.snapshots.set(opened.sessionId, createEmptySnapshotState())
      }
      this.registerSessionProbeState(opened.sessionId)
      this.wireSessionStreamEvents(opened.sessionId, opened.stream, adapter)
      return opened
    }

    if (result instanceof Promise) {
      return result.then(finalize)
    }

    return finalize(result)
  }

  handleData(sessionId: string, data: string): void {
    if (!this.terminatedSessions.has(sessionId)) {
      this.activeSessions.add(sessionId)
      if (!this.snapshots.has(sessionId)) {
        this.snapshots.set(sessionId, createEmptySnapshotState())
      }
    }

    this.queuePtyDataBroadcast(sessionId, data)
  }

  handleExit(sessionId: string, exitCode: number): void {
    this.flushPtyDataBroadcast(sessionId)
    this.clearSessionProbeState(sessionId)
    this.sessionStateWatcher.disposeSession(sessionId)
    this.sessionAgentWatcherSupport.delete(sessionId)
    this.sessionKindMap.delete(sessionId)
    this.cleanupSessionPtyDataSubscriptions(sessionId)
    this.activeSessions.delete(sessionId)
    this.terminatedSessions.add(sessionId)
    const eventPayload: TerminalExitEvent = { sessionId, exitCode }
    this.sendToAllWindows(IPC_CHANNELS.ptyExit, eventPayload)
  }

  write(sessionId: string, data: string, encoding: TerminalWriteEncoding = 'utf8'): void {
    this.getSessionAdapter(sessionId)?.write(sessionId, data, encoding)
    this.sessionStateWatcher.noteInteraction(sessionId, data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.getSessionAdapter(sessionId)?.resize(sessionId, cols, rows)
  }

  kill(sessionId: string): void {
    this.flushPtyDataBroadcast(sessionId)
    this.clearSessionProbeState(sessionId)
    this.sessionStateWatcher.disposeSession(sessionId)
    this.cleanupSessionPtyDataSubscriptions(sessionId)
    this.getSessionAdapter(sessionId)?.kill(sessionId)
    this.sessionAdapterMap.delete(sessionId)
    this.sessionKindMap.delete(sessionId)
    this.sessionAgentWatcherSupport.delete(sessionId)
  }

  attach(contentsId: number, sessionId: string): void {
    this.trackWebContentsSubscriptionLifecycle(contentsId)

    const sessions = this.ptyDataSessionsByWebContentsId.get(contentsId) ?? new Set<string>()
    sessions.add(sessionId)
    this.ptyDataSessionsByWebContentsId.set(contentsId, sessions)

    const subscribers = this.ptyDataSubscribersBySessionId.get(sessionId) ?? new Set<number>()
    subscribers.add(contentsId)
    this.ptyDataSubscribersBySessionId.set(sessionId, subscribers)

    this.syncSessionProbeBuffer(sessionId)
    this.flushPtyDataBroadcast(sessionId)
  }

  detach(contentsId: number, sessionId: string): void {
    const sessions = this.ptyDataSessionsByWebContentsId.get(contentsId)
    sessions?.delete(sessionId)
    if (sessions && sessions.size === 0) {
      this.ptyDataSessionsByWebContentsId.delete(contentsId)
    }

    const subscribers = this.ptyDataSubscribersBySessionId.get(sessionId)
    subscribers?.delete(contentsId)
    if (subscribers && subscribers.size === 0) {
      this.ptyDataSubscribersBySessionId.delete(sessionId)
    }

    this.syncSessionProbeBuffer(sessionId)
  }

  snapshot(sessionId: string): string {
    this.flushPtyDataBroadcast(sessionId)
    const snapshot = this.snapshots.get(sessionId)
    return snapshot ? snapshotToString(snapshot) : ''
  }

  startSessionStateWatcher(input: SessionStateWatcherStartInput): void {
    if (this.sessionAgentWatcherSupport.get(input.sessionId) === false) {
      return
    }

    this.sessionStateWatcher.start(input)
  }

  dispose(): void {
    this.sessionStateWatcher.dispose()

    this.pendingPtyDataFlushTimerBySession.forEach(timer => {
      clearTimeout(timer)
    })
    this.pendingPtyDataFlushTimerBySession.clear()
    this.pendingPtyDataFlushDelayBySession.clear()
    this.pendingPtyDataChunksBySession.clear()
    this.pendingPtyDataCharsBySession.clear()
    this.ptyDataSubscribersBySessionId.clear()
    this.ptyDataSessionsByWebContentsId.clear()
    this.ptyDataSubscribedWebContentsIds.clear()
    this.terminalProbeBufferBySession.clear()

    for (const adapter of new Set(this.adapterRegistry.values())) {
      adapter.disposeAll()
    }

    this.sessionAdapterMap.clear()
    this.sessionKindMap.clear()
    this.sessionAgentWatcherSupport.clear()
    this.activeSessions.clear()
    this.terminatedSessions.clear()
    this.snapshots.clear()
  }
}
