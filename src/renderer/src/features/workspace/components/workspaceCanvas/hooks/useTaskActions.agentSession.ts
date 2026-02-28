import type { Node } from '@xyflow/react'
import { resolveAgentModel, type AgentSettings } from '../../../../settings/agentConfig'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import { sanitizeSpaces, toErrorMessage } from '../helpers'
import type { CreateNodeInput } from '../types'
import { expandSpaceToFitOwnedNodesAndPushAway } from '../../../utils/spaceAutoResize'

interface TaskActionContext {
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  createNodeForSession: (input: CreateNodeInput) => Promise<Node<TerminalNodeData> | null>
  buildAgentNodeTitle: (
    provider: AgentSettings['defaultProvider'],
    effectiveModel: string | null,
  ) => string
  launchAgentInNode: (nodeId: string, mode: 'new' | 'resume') => Promise<void>
  agentSettings: AgentSettings
  workspacePath: string
  onRequestPersistFlush?: () => void
}

function assignNodeToTaskSpaceAndAutoResize({
  taskNodeId,
  assignedNodeId,
  nodesRef,
  spacesRef,
  setNodes,
  onSpacesChange,
}: {
  taskNodeId: string
  assignedNodeId: string
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
}): void {
  const taskSpace = spacesRef.current.find(space => space.nodeIds.includes(taskNodeId)) ?? null
  if (!taskSpace) {
    return
  }

  const nextSpaces = sanitizeSpaces(
    spacesRef.current.map(space => {
      const filtered = space.nodeIds.filter(nodeId => nodeId !== assignedNodeId)

      if (space.id !== taskSpace.id) {
        return {
          ...space,
          nodeIds: filtered,
        }
      }

      return {
        ...space,
        nodeIds: [...new Set([...filtered, assignedNodeId])],
      }
    }),
  )

  const { spaces: pushedSpaces, nodePositionById } = expandSpaceToFitOwnedNodesAndPushAway({
    targetSpaceId: taskSpace.id,
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
}

export async function runTaskAgentAction(
  taskNodeId: string,
  context: TaskActionContext,
): Promise<void> {
  const {
    nodesRef,
    spacesRef,
    onSpacesChange,
    setNodes,
    createNodeForSession,
    buildAgentNodeTitle,
    launchAgentInNode,
    agentSettings,
    workspacePath,
    onRequestPersistFlush,
  } = context
  const taskNode = nodesRef.current.find(node => node.id === taskNodeId)
  if (!taskNode || taskNode.data.kind !== 'task' || !taskNode.data.task) {
    return
  }

  const requirement = taskNode.data.task.requirement.trim()
  if (requirement.length === 0) {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: '任务要求不能为空。',
          },
        }
      }),
    )
    return
  }

  const taskSpace = spacesRef.current.find(space => space.nodeIds.includes(taskNodeId)) ?? null
  const taskDirectory =
    taskSpace && taskSpace.directoryPath.trim().length > 0 ? taskSpace.directoryPath : workspacePath

  const linkedAgentNodeId = taskNode.data.task.linkedAgentNodeId
  if (linkedAgentNodeId) {
    const linkedAgentNode = nodesRef.current.find(node => node.id === linkedAgentNodeId)

    if (linkedAgentNode && linkedAgentNode.data.kind === 'agent' && linkedAgentNode.data.agent) {
      assignNodeToTaskSpaceAndAutoResize({
        taskNodeId,
        assignedNodeId: linkedAgentNodeId,
        nodesRef,
        spacesRef,
        setNodes,
        onSpacesChange,
      })

      const now = new Date().toISOString()

      setNodes(prevNodes =>
        prevNodes.map(node => {
          if (node.id === linkedAgentNodeId && node.data.kind === 'agent' && node.data.agent) {
            const agentDirectory =
              node.data.agent.directoryMode === 'workspace'
                ? taskDirectory
                : node.data.agent.executionDirectory

            return {
              ...node,
              data: {
                ...node.data,
                agent: {
                  ...node.data.agent,
                  prompt: requirement,
                  taskId: taskNodeId,
                  executionDirectory: agentDirectory,
                  expectedDirectory: agentDirectory,
                },
                lastError: null,
              },
            }
          }

          if (node.id === taskNodeId && node.data.kind === 'task' && node.data.task) {
            return {
              ...node,
              data: {
                ...node.data,
                lastError: null,
                task: {
                  ...node.data.task,
                  status: 'doing',
                  linkedAgentNodeId,
                  lastRunAt: now,
                  updatedAt: now,
                },
              },
            }
          }

          return node
        }),
      )
      onRequestPersistFlush?.()

      await launchAgentInNode(linkedAgentNodeId, 'new')
      return
    }

    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId || node.data.kind !== 'task' || !node.data.task) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            task: {
              ...node.data.task,
              linkedAgentNodeId: null,
              updatedAt: new Date().toISOString(),
            },
          },
        }
      }),
    )
    onRequestPersistFlush?.()
  }

  const provider = agentSettings.defaultProvider
  const model = resolveAgentModel(agentSettings, provider)

  try {
    const launched = await window.coveApi.agent.launch({
      provider,
      cwd: taskDirectory,
      prompt: requirement,
      mode: 'new',
      model,
      cols: 80,
      rows: 24,
    })

    const createdAgentNode = await createNodeForSession({
      sessionId: launched.sessionId,
      title: buildAgentNodeTitle(provider, launched.effectiveModel),
      anchor: {
        x: taskNode.position.x + taskNode.data.width + 48,
        y: taskNode.position.y,
      },
      kind: 'agent',
      agent: {
        provider,
        prompt: requirement,
        model,
        effectiveModel: launched.effectiveModel,
        launchMode: launched.launchMode,
        resumeSessionId: launched.resumeSessionId,
        executionDirectory: taskDirectory,
        expectedDirectory: taskDirectory,
        directoryMode: 'workspace',
        customDirectory: null,
        shouldCreateDirectory: false,
        taskId: taskNodeId,
      },
    })

    if (!createdAgentNode) {
      return
    }

    assignNodeToTaskSpaceAndAutoResize({
      taskNodeId,
      assignedNodeId: createdAgentNode.id,
      nodesRef,
      spacesRef,
      setNodes,
      onSpacesChange,
    })

    const now = new Date().toISOString()

    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId || node.data.kind !== 'task' || !node.data.task) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            task: {
              ...node.data.task,
              status: 'doing',
              linkedAgentNodeId: createdAgentNode.id,
              lastRunAt: now,
              updatedAt: now,
            },
          },
        }
      }),
    )
    onRequestPersistFlush?.()
  } catch (error) {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId || node.data.kind !== 'task') {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: `Agent 启动失败：${toErrorMessage(error)}`,
          },
        }
      }),
    )
    onRequestPersistFlush?.()
  }
}

export async function resumeTaskAgentSessionAction(
  taskNodeId: string,
  recordId: string,
  context: Omit<TaskActionContext, 'launchAgentInNode' | 'agentSettings'>,
): Promise<void> {
  const {
    nodesRef,
    spacesRef,
    onSpacesChange,
    setNodes,
    createNodeForSession,
    buildAgentNodeTitle,
    workspacePath,
    onRequestPersistFlush,
  } = context
  const taskNode = nodesRef.current.find(node => node.id === taskNodeId)
  if (!taskNode || taskNode.data.kind !== 'task' || !taskNode.data.task) {
    return
  }

  if (taskNode.data.task.linkedAgentNodeId) {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: '请先关闭当前关联的 Agent 窗口再继续。',
          },
        }
      }),
    )
    onRequestPersistFlush?.()
    return
  }

  const record = (taskNode.data.task.agentSessions ?? []).find(item => item.id === recordId)
  if (!record) {
    return
  }

  if (!record.resumeSessionId) {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: '该 Agent 记录没有 resumeSessionId，无法 Resume。',
          },
        }
      }),
    )
    onRequestPersistFlush?.()
    return
  }

  const taskSpace = spacesRef.current.find(space => space.nodeIds.includes(taskNodeId)) ?? null
  const taskDirectory =
    taskSpace && taskSpace.directoryPath.trim().length > 0 ? taskSpace.directoryPath : workspacePath

  try {
    const launched = await window.coveApi.agent.launch({
      provider: record.provider,
      cwd: record.boundDirectory,
      prompt: record.prompt,
      mode: 'resume',
      model: record.model,
      resumeSessionId: record.resumeSessionId,
      cols: 80,
      rows: 24,
    })

    const createdAgentNode = await createNodeForSession({
      sessionId: launched.sessionId,
      title: buildAgentNodeTitle(record.provider, launched.effectiveModel),
      anchor: {
        x: taskNode.position.x + taskNode.data.width + 48,
        y: taskNode.position.y,
      },
      kind: 'agent',
      agent: {
        provider: record.provider,
        prompt: record.prompt,
        model: record.model,
        effectiveModel: launched.effectiveModel,
        launchMode: launched.launchMode,
        resumeSessionId: launched.resumeSessionId ?? record.resumeSessionId,
        executionDirectory: record.boundDirectory,
        expectedDirectory: taskDirectory,
        directoryMode: 'workspace',
        customDirectory: null,
        shouldCreateDirectory: false,
        taskId: taskNodeId,
      },
    })

    if (!createdAgentNode) {
      return
    }

    assignNodeToTaskSpaceAndAutoResize({
      taskNodeId,
      assignedNodeId: createdAgentNode.id,
      nodesRef,
      spacesRef,
      setNodes,
      onSpacesChange,
    })

    const now = new Date().toISOString()

    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId || node.data.kind !== 'task' || !node.data.task) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: null,
            task: {
              ...node.data.task,
              status: 'doing',
              linkedAgentNodeId: createdAgentNode.id,
              lastRunAt: now,
              agentSessions: (node.data.task.agentSessions ?? []).map(session =>
                session.id === recordId
                  ? {
                      ...session,
                      lastRunAt: now,
                      lastDirectory: taskDirectory,
                    }
                  : session,
              ),
              updatedAt: now,
            },
          },
        }
      }),
    )
    onRequestPersistFlush?.()
  } catch (error) {
    setNodes(prevNodes =>
      prevNodes.map(node => {
        if (node.id !== taskNodeId || node.data.kind !== 'task') {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            lastError: `Agent Resume 失败：${toErrorMessage(error)}`,
          },
        }
      }),
    )
    onRequestPersistFlush?.()
  }
}
