import { useCallback, useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { resolveAgentModel, type AgentSettings } from '../../../../settings/agentConfig'
import type { AgentNodeData, Point, TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import {
  normalizeDirectoryPath,
  sanitizeSpaces,
  toErrorMessage,
  toSuggestedWorktreePath,
} from '../helpers'
import type { AgentLauncherState, ContextMenuState, CreateNodeInput } from '../types'
import { expandSpaceToFitOwnedNodesAndPushAway } from '../../../utils/spaceAutoResize'

interface UseAgentLauncherParams {
  agentSettings: AgentSettings
  workspacePath: string
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  onRequestPersistFlush?: () => void
  contextMenu: ContextMenuState | null
  setContextMenu: (next: ContextMenuState | null) => void
  createNodeForSession: (input: CreateNodeInput) => Promise<Node<TerminalNodeData> | null>
  buildAgentNodeTitle: (
    provider: AgentNodeData['provider'],
    effectiveModel: string | null,
  ) => string
}

export function useWorkspaceCanvasAgentLauncher({
  agentSettings,
  workspacePath,
  nodesRef,
  setNodes,
  spacesRef,
  onSpacesChange,
  onRequestPersistFlush,
  contextMenu,
  setContextMenu,
  createNodeForSession,
  buildAgentNodeTitle,
}: UseAgentLauncherParams): {
  agentLauncher: AgentLauncherState | null
  setAgentLauncher: React.Dispatch<React.SetStateAction<AgentLauncherState | null>>
  openAgentLauncher: () => void
  closeAgentLauncher: () => void
  launchAgentNode: () => Promise<void>
  launcherModelOptions: string[]
} {
  const [agentLauncher, setAgentLauncher] = useState<AgentLauncherState | null>(null)

  const openAgentLauncher = useCallback(() => {
    if (!contextMenu || contextMenu.kind !== 'pane') {
      return
    }

    const anchor: Point = {
      x: contextMenu.flowX,
      y: contextMenu.flowY,
    }

    const initialProvider = agentSettings.defaultProvider
    const defaultModel = resolveAgentModel(agentSettings, initialProvider) ?? ''

    setContextMenu(null)
    setAgentLauncher({
      anchor,
      provider: initialProvider,
      prompt: '',
      model: defaultModel,
      directoryMode: 'workspace',
      customDirectory: toSuggestedWorktreePath(workspacePath, initialProvider),
      shouldCreateDirectory: true,
      isLaunching: false,
      error: null,
    })
  }, [agentSettings, contextMenu, setContextMenu, workspacePath])

  const closeAgentLauncher = useCallback(() => {
    setAgentLauncher(prev => {
      if (!prev || prev.isLaunching) {
        return prev
      }

      return null
    })
  }, [])

  const launchAgentNode = useCallback(async () => {
    if (!agentLauncher) {
      return
    }

    const normalizedPrompt = agentLauncher.prompt.trim()
    if (normalizedPrompt.length === 0) {
      setAgentLauncher(prev =>
        prev
          ? {
              ...prev,
              error: '任务提示词不能为空。',
            }
          : prev,
      )
      return
    }

    const normalizedModel = agentLauncher.model.trim()

    const anchorSpace =
      spacesRef.current.find(space => {
        if (!space.rect) {
          return false
        }

        return (
          agentLauncher.anchor.x >= space.rect.x &&
          agentLauncher.anchor.x <= space.rect.x + space.rect.width &&
          agentLauncher.anchor.y >= space.rect.y &&
          agentLauncher.anchor.y <= space.rect.y + space.rect.height
        )
      }) ?? null

    const anchorSpaceDirectory =
      anchorSpace && anchorSpace.directoryPath.trim().length > 0
        ? anchorSpace.directoryPath
        : workspacePath

    const executionDirectory =
      agentLauncher.directoryMode === 'workspace'
        ? anchorSpaceDirectory
        : normalizeDirectoryPath(workspacePath, agentLauncher.customDirectory)

    if (executionDirectory.trim().length === 0) {
      setAgentLauncher(prev =>
        prev
          ? {
              ...prev,
              error: '请填写有效的执行目录。',
            }
          : prev,
      )
      return
    }

    setAgentLauncher(prev =>
      prev
        ? {
            ...prev,
            isLaunching: true,
            error: null,
          }
        : prev,
    )

    try {
      if (agentLauncher.directoryMode === 'custom' && agentLauncher.shouldCreateDirectory) {
        await window.coveApi.workspace.ensureDirectory({ path: executionDirectory })
      }

      const launched = await window.coveApi.agent.launch({
        provider: agentLauncher.provider,
        cwd: executionDirectory,
        prompt: normalizedPrompt,
        mode: 'new',
        model: normalizedModel.length > 0 ? normalizedModel : null,
        cols: 80,
        rows: 24,
      })

      const modelLabel =
        launched.effectiveModel ?? (normalizedModel.length > 0 ? normalizedModel : null)
      const agentData: AgentNodeData = {
        provider: agentLauncher.provider,
        prompt: normalizedPrompt,
        model: normalizedModel.length > 0 ? normalizedModel : null,
        effectiveModel: launched.effectiveModel,
        launchMode: launched.launchMode,
        resumeSessionId: launched.resumeSessionId,
        executionDirectory,
        expectedDirectory: anchorSpace ? anchorSpaceDirectory : executionDirectory,
        directoryMode: agentLauncher.directoryMode,
        customDirectory:
          agentLauncher.directoryMode === 'custom' ? agentLauncher.customDirectory.trim() : null,
        shouldCreateDirectory: agentLauncher.shouldCreateDirectory,
        taskId: null,
      }

      const created = await createNodeForSession({
        sessionId: launched.sessionId,
        title: buildAgentNodeTitle(agentLauncher.provider, modelLabel),
        anchor: agentLauncher.anchor,
        kind: 'agent',
        agent: agentData,
      })

      if (!created) {
        setAgentLauncher(prev =>
          prev
            ? {
                ...prev,
                isLaunching: false,
                error: '终端窗口无法放置，请先整理画布后重试。',
              }
            : prev,
        )
        return
      }

      if (anchorSpace) {
        const targetSpace = anchorSpace
        const nextSpaces = sanitizeSpaces(
          spacesRef.current.map(space => {
            const filtered = space.nodeIds.filter(nodeId => nodeId !== created.id)

            if (space.id !== targetSpace.id) {
              return {
                ...space,
                nodeIds: filtered,
              }
            }

            return {
              ...space,
              nodeIds: [...new Set([...filtered, created.id])],
            }
          }),
        )

        const { spaces: pushedSpaces, nodePositionById } = expandSpaceToFitOwnedNodesAndPushAway({
          targetSpaceId: targetSpace.id,
          spaces: nextSpaces,
          nodeRects: nodesRef.current.map(node => ({
            id: node.id,
            rect: {
              x: node.position.x,
              y: node.position.y,
              width: node.data.width,
              height: node.data.height,
            },
          })),
          gap: 24,
        })

        if (nodePositionById.size > 0) {
          setNodes(
            prevNodes => {
              let hasChanged = false
              const next = prevNodes.map(node => {
                const nextPosition = nodePositionById.get(node.id)
                if (!nextPosition) {
                  return node
                }

                if (node.position.x === nextPosition.x && node.position.y === nextPosition.y) {
                  return node
                }

                hasChanged = true
                return {
                  ...node,
                  position: nextPosition,
                }
              })

              return hasChanged ? next : prevNodes
            },
            { syncLayout: false },
          )
        }

        onSpacesChange(pushedSpaces)
        onRequestPersistFlush?.()
      }

      setAgentLauncher(null)
    } catch (error) {
      setAgentLauncher(prev =>
        prev
          ? {
              ...prev,
              isLaunching: false,
              error: `Agent 启动失败：${toErrorMessage(error)}`,
            }
          : prev,
      )
    }
  }, [
    agentLauncher,
    buildAgentNodeTitle,
    createNodeForSession,
    nodesRef,
    onSpacesChange,
    onRequestPersistFlush,
    setNodes,
    spacesRef,
    workspacePath,
  ])

  const launcherModelOptions = useMemo(() => {
    if (!agentLauncher) {
      return []
    }

    const provider = agentLauncher.provider
    const providerOptions = agentSettings.customModelOptionsByProvider[provider] ?? []
    const defaultModel = resolveAgentModel(agentSettings, provider)

    return [
      ...new Set([...providerOptions, defaultModel ?? '', agentLauncher.model].filter(Boolean)),
    ]
  }, [agentLauncher, agentSettings])

  return {
    agentLauncher,
    setAgentLauncher,
    openAgentLauncher,
    closeAgentLauncher,
    launchAgentNode,
    launcherModelOptions,
  }
}
