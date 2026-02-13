import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentProvider,
  type AgentSettings,
} from '../../settings/agentConfig'
import {
  DEFAULT_WORKSPACE_MINIMAP_VISIBLE,
  DEFAULT_WORKSPACE_VIEWPORT,
  type AgentLaunchMode,
  type AgentNodeData,
  type AgentRuntimeStatus,
  type ExecutionDirectoryMode,
  type PersistedAppState,
  type PersistedWorkspaceState,
  type PersistedTerminalNode,
  type TaskNodeData,
  type TaskPriority,
  type TaskRuntimeStatus,
  type WorkspaceSpaceRect,
  type WorkspaceSpaceState,
  type WorkspaceViewport,
  type WorkspaceNodeKind,
  type WorkspaceState,
} from '../types'

const STORAGE_KEY = 'cove:m0:workspace-state'
const DEFAULT_PERSIST_WRITE_DEBOUNCE_MS = 800

const AGENT_RUNTIME_STATUSES: AgentRuntimeStatus[] = [
  'running',
  'exited',
  'failed',
  'stopped',
  'restoring',
]

const TASK_RUNTIME_STATUSES: TaskRuntimeStatus[] = ['todo', 'doing', 'ai_done', 'done']
const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
const AGENT_LAUNCH_MODES: AgentLaunchMode[] = ['new', 'resume']
const EXECUTION_DIRECTORY_MODES: ExecutionDirectoryMode[] = ['workspace', 'custom']
const MAX_PERSISTED_SCROLLBACK_CHARS = 200_000

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeNodeKind(value: unknown): WorkspaceNodeKind {
  if (value === 'agent') {
    return 'agent'
  }

  if (value === 'task') {
    return 'task'
  }

  return 'terminal'
}

function normalizeAgentRuntimeStatus(value: unknown): AgentRuntimeStatus | null {
  if (typeof value !== 'string') {
    return null
  }

  return AGENT_RUNTIME_STATUSES.includes(value as AgentRuntimeStatus)
    ? (value as AgentRuntimeStatus)
    : null
}

function normalizeTaskRuntimeStatus(value: unknown): TaskRuntimeStatus {
  if (typeof value !== 'string') {
    return 'todo'
  }

  return TASK_RUNTIME_STATUSES.includes(value as TaskRuntimeStatus)
    ? (value as TaskRuntimeStatus)
    : 'todo'
}

function normalizeTaskPriority(value: unknown): TaskPriority {
  if (typeof value !== 'string') {
    return 'medium'
  }

  return TASK_PRIORITIES.includes(value as TaskPriority) ? (value as TaskPriority) : 'medium'
}

function normalizeTaskTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)),
  ]
}

function normalizeLaunchMode(value: unknown): AgentLaunchMode {
  if (typeof value !== 'string') {
    return 'new'
  }

  return AGENT_LAUNCH_MODES.includes(value as AgentLaunchMode) ? (value as AgentLaunchMode) : 'new'
}

function normalizeDirectoryMode(value: unknown): ExecutionDirectoryMode {
  if (typeof value !== 'string') {
    return 'workspace'
  }

  return EXECUTION_DIRECTORY_MODES.includes(value as ExecutionDirectoryMode)
    ? (value as ExecutionDirectoryMode)
    : 'workspace'
}

function normalizeProvider(value: unknown): AgentProvider | null {
  if (typeof value !== 'string') {
    return null
  }

  return AGENT_PROVIDERS.includes(value as AgentProvider) ? (value as AgentProvider) : null
}

function normalizeScrollback(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  if (value.length === 0) {
    return null
  }

  if (value.length <= MAX_PERSISTED_SCROLLBACK_CHARS) {
    return value
  }

  return value.slice(-MAX_PERSISTED_SCROLLBACK_CHARS)
}

function normalizeWorkspaceViewport(value: unknown): WorkspaceViewport {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WORKSPACE_VIEWPORT }
  }

  const record = value as Record<string, unknown>
  const x =
    typeof record.x === 'number' && Number.isFinite(record.x)
      ? record.x
      : DEFAULT_WORKSPACE_VIEWPORT.x
  const y =
    typeof record.y === 'number' && Number.isFinite(record.y)
      ? record.y
      : DEFAULT_WORKSPACE_VIEWPORT.y
  const zoom =
    typeof record.zoom === 'number' && Number.isFinite(record.zoom) && record.zoom > 0
      ? record.zoom
      : DEFAULT_WORKSPACE_VIEWPORT.zoom

  return {
    x,
    y,
    zoom,
  }
}

function normalizeWorkspaceMinimapVisible(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_WORKSPACE_MINIMAP_VISIBLE
}

function normalizeWorkspaceSpaceRect(value: unknown): WorkspaceSpaceRect | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const x = record.x
  const y = record.y
  const width = record.width
  const height = record.height

  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null
  }

  return {
    x,
    y,
    width,
    height,
  }
}

function normalizeWorkspaceSpaceNodeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(
      value
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(item => item.length > 0),
    ),
  ]
}

function ensurePersistedWorkspaceSpace(
  value: unknown,
  workspacePath: string,
): WorkspaceSpaceState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const id = record.id
  const name = record.name

  if (typeof id !== 'string' || typeof name !== 'string') {
    return null
  }

  const normalizedDirectoryPath = normalizeOptionalString(record.directoryPath) ?? workspacePath

  return {
    id,
    name,
    directoryPath: normalizedDirectoryPath,
    nodeIds: normalizeWorkspaceSpaceNodeIds(record.nodeIds),
    rect: normalizeWorkspaceSpaceRect(record.rect),
  }
}

function ensurePersistedAgentData(value: unknown): AgentNodeData | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const provider = normalizeProvider(record.provider)
  const prompt = normalizeOptionalString(record.prompt)
  const executionDirectory = normalizeOptionalString(record.executionDirectory)

  if (!provider || !prompt || !executionDirectory) {
    return null
  }

  return {
    provider,
    prompt,
    model: normalizeOptionalString(record.model),
    effectiveModel: normalizeOptionalString(record.effectiveModel),
    launchMode: normalizeLaunchMode(record.launchMode),
    resumeSessionId: normalizeOptionalString(record.resumeSessionId),
    executionDirectory,
    directoryMode: normalizeDirectoryMode(record.directoryMode),
    customDirectory: normalizeOptionalString(record.customDirectory),
    shouldCreateDirectory:
      typeof record.shouldCreateDirectory === 'boolean' ? record.shouldCreateDirectory : false,
    taskId: normalizeOptionalString(record.taskId),
  }
}

function ensurePersistedTaskData(value: unknown): TaskNodeData | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const requirement = normalizeOptionalString(record.requirement)

  if (!requirement) {
    return null
  }

  return {
    requirement,
    status: normalizeTaskRuntimeStatus(record.status),
    priority: normalizeTaskPriority(record.priority),
    tags: normalizeTaskTags(record.tags),
    linkedAgentNodeId: normalizeOptionalString(record.linkedAgentNodeId),
    lastRunAt: normalizeOptionalString(record.lastRunAt),
    autoGeneratedTitle:
      typeof record.autoGeneratedTitle === 'boolean' ? record.autoGeneratedTitle : false,
    createdAt: normalizeOptionalString(record.createdAt),
    updatedAt: normalizeOptionalString(record.updatedAt),
  }
}

function ensurePersistedNode(node: unknown): PersistedTerminalNode | null {
  if (!node || typeof node !== 'object') {
    return null
  }

  const record = node as Record<string, unknown>
  const id = record.id
  const title = record.title
  const width = record.width
  const height = record.height
  const position = record.position

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !position ||
    typeof position !== 'object'
  ) {
    return null
  }

  const positionRecord = position as Record<string, unknown>
  if (typeof positionRecord.x !== 'number' || typeof positionRecord.y !== 'number') {
    return null
  }

  const kind = normalizeNodeKind(record.kind)
  const agent = ensurePersistedAgentData(record.agent)
  const task = ensurePersistedTaskData(record.task)

  return {
    id,
    title,
    width,
    height,
    kind,
    status: normalizeAgentRuntimeStatus(record.status),
    startedAt: normalizeOptionalString(record.startedAt),
    endedAt: normalizeOptionalString(record.endedAt),
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : null,
    lastError: normalizeOptionalString(record.lastError),
    scrollback: normalizeScrollback(record.scrollback),
    agent: kind === 'agent' ? agent : null,
    task: kind === 'task' ? task : null,
    position: {
      x: positionRecord.x,
      y: positionRecord.y,
    },
  }
}

function ensurePersistedWorkspace(workspace: unknown): PersistedWorkspaceState | null {
  if (!workspace || typeof workspace !== 'object') {
    return null
  }

  const record = workspace as Record<string, unknown>
  const id = record.id
  const name = record.name
  const path = record.path
  const nodes = record.nodes
  const spaces = record.spaces
  const activeSpaceId = record.activeSpaceId

  if (typeof id !== 'string' || typeof name !== 'string' || typeof path !== 'string') {
    return null
  }

  if (!Array.isArray(nodes)) {
    return null
  }

  const normalizedNodes = nodes
    .map(node => ensurePersistedNode(node))
    .filter((node): node is PersistedTerminalNode => node !== null)

  const normalizedSpaces = Array.isArray(spaces)
    ? spaces
        .map(item => ensurePersistedWorkspaceSpace(item, path))
        .filter((item): item is WorkspaceSpaceState => item !== null)
    : []

  const availableNodeIds = new Set(normalizedNodes.map(node => node.id))
  const sanitizedSpaces = normalizedSpaces.map(space => ({
    ...space,
    nodeIds: space.nodeIds.filter(nodeId => availableNodeIds.has(nodeId)),
  }))
  const normalizedActiveSpaceId = typeof activeSpaceId === 'string' ? activeSpaceId : null
  const resolvedActiveSpaceId =
    normalizedActiveSpaceId && sanitizedSpaces.some(space => space.id === normalizedActiveSpaceId)
      ? normalizedActiveSpaceId
      : null

  return {
    id,
    name,
    path,
    nodes: normalizedNodes,
    viewport: normalizeWorkspaceViewport(record.viewport),
    isMinimapVisible: normalizeWorkspaceMinimapVisible(record.isMinimapVisible),
    spaces: sanitizedSpaces,
    activeSpaceId: resolvedActiveSpaceId,
  }
}

export function readPersistedState(): PersistedAppState | null {
  const storage = getStorage()
  if (!storage) {
    return null
  }

  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const record = parsed as Record<string, unknown>
    const activeWorkspaceId = record.activeWorkspaceId
    const workspaces = record.workspaces

    if (activeWorkspaceId !== null && typeof activeWorkspaceId !== 'string') {
      return null
    }

    if (!Array.isArray(workspaces)) {
      return null
    }

    const normalizedWorkspaces = workspaces
      .map(item => ensurePersistedWorkspace(item))
      .filter((item): item is PersistedWorkspaceState => item !== null)

    const settings = normalizeAgentSettings(record.settings)

    return {
      activeWorkspaceId,
      workspaces: normalizedWorkspaces,
      settings,
    }
  } catch {
    return null
  }
}

export function writePersistedState(state: PersistedAppState): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore persistence failures (quota exceeded, storage disabled, etc.)
  }
}

export function writeRawPersistedState(raw: string): void {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(STORAGE_KEY, raw)
  } catch {
    // Ignore persistence failures (quota exceeded, storage disabled, etc.)
  }
}

let scheduledPersistedStateProducer: (() => PersistedAppState) | null = null
let scheduledPersistedStateTimer: number | null = null

export function schedulePersistedStateWrite(
  producer: () => PersistedAppState,
  options: { delayMs?: number } = {},
): void {
  if (typeof window === 'undefined') {
    return
  }

  scheduledPersistedStateProducer = producer

  if (scheduledPersistedStateTimer !== null) {
    return
  }

  const delayMs = options.delayMs ?? DEFAULT_PERSIST_WRITE_DEBOUNCE_MS
  scheduledPersistedStateTimer = window.setTimeout(() => {
    scheduledPersistedStateTimer = null
    flushScheduledPersistedStateWrite()
  }, delayMs)
}

export function flushScheduledPersistedStateWrite(): void {
  if (typeof window !== 'undefined' && scheduledPersistedStateTimer !== null) {
    window.clearTimeout(scheduledPersistedStateTimer)
    scheduledPersistedStateTimer = null
  }

  const producer = scheduledPersistedStateProducer
  scheduledPersistedStateProducer = null

  if (!producer) {
    return
  }

  writePersistedState(producer())
}

export function toPersistedState(
  workspaces: WorkspaceState[],
  activeWorkspaceId: string | null,
  settings: AgentSettings = DEFAULT_AGENT_SETTINGS,
): PersistedAppState {
  return {
    activeWorkspaceId,
    workspaces: workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      viewport: normalizeWorkspaceViewport(workspace.viewport),
      isMinimapVisible:
        typeof workspace.isMinimapVisible === 'boolean'
          ? workspace.isMinimapVisible
          : DEFAULT_WORKSPACE_MINIMAP_VISIBLE,
      spaces: workspace.spaces.map(space => ({
        id: space.id,
        name: space.name,
        directoryPath:
          normalizeOptionalString(space.directoryPath) ??
          normalizeOptionalString(workspace.path) ??
          workspace.path,
        nodeIds: normalizeWorkspaceSpaceNodeIds(space.nodeIds),
        rect: normalizeWorkspaceSpaceRect(space.rect),
      })),
      activeSpaceId:
        workspace.activeSpaceId &&
        workspace.spaces.some(space => space.id === workspace.activeSpaceId)
          ? workspace.activeSpaceId
          : null,
      nodes: workspace.nodes.map(node => ({
        id: node.id,
        title: node.data.title,
        position: node.position,
        width: node.data.width,
        height: node.data.height,
        kind: node.data.kind,
        status: node.data.status,
        startedAt: node.data.startedAt,
        endedAt: node.data.endedAt,
        exitCode: node.data.exitCode,
        lastError: node.data.lastError,
        scrollback: normalizeScrollback(node.data.scrollback),
        agent: node.data.agent,
        task: node.data.task,
      })),
    })),
    settings,
  }
}
