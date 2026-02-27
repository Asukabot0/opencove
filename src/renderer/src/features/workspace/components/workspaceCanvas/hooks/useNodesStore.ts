import { useCallback, useLayoutEffect, useRef } from 'react'
import type { Node } from '@xyflow/react'
import type { Point, Size, TerminalNodeData, TaskPriority } from '../../../types'
import { clampSizeToNonOverlapping, findNearestFreePosition } from '../../../utils/collision'
import { MIN_SIZE, TASK_SIZE, resolveDefaultTerminalWindowSize } from '../constants'
import type { CreateNodeInput } from '../types'
import { removeNodeWithRelations } from './useNodesStore.closeNode'
import { clampSizeToContainingSpace } from './useNodesStore.clampSizeToSpace'
import { computePushBlockingWindowsRight } from './useNodesStore.pushBlockingWindowsRight'
import { resolveNodesPlacement } from './useNodesStore.resolvePlacement'
import type {
  UseWorkspaceCanvasNodesStoreParams,
  UseWorkspaceCanvasNodesStoreResult,
} from './useNodesStore.types'

export function useWorkspaceCanvasNodesStore({
  nodes,
  spacesRef,
  onNodesChange,
  onRequestPersistFlush,
  defaultTerminalWindowScalePercent,
}: UseWorkspaceCanvasNodesStoreParams): UseWorkspaceCanvasNodesStoreResult {
  const nodesRef = useRef(nodes)
  const agentLaunchTokenByNodeIdRef = useRef<Map<string, number>>(new Map())
  const pendingScrollbackByNodeRef = useRef<Map<string, string>>(new Map())
  const isNodeDraggingRef = useRef(false)
  useLayoutEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  const setNodes = useCallback(
    (
      updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
      options: { syncLayout?: boolean } = {},
    ) => {
      const previousNodes = nodesRef.current
      const nextNodes = updater(previousNodes)
      if (nextNodes === previousNodes) {
        return
      }
      nodesRef.current = nextNodes
      onNodesChange(nextNodes)

      if (options.syncLayout ?? true) {
        window.dispatchEvent(new Event('cove:terminal-layout-sync'))
      }
    },
    [onNodesChange],
  )
  const upsertNode = useCallback(
    (nextNode: Node<TerminalNodeData>) => {
      setNodes(prevNodes => prevNodes.map(node => (node.id === nextNode.id ? nextNode : node)))
    },
    [setNodes],
  )
  const bumpAgentLaunchToken = useCallback((nodeId: string): number => {
    const next = (agentLaunchTokenByNodeIdRef.current.get(nodeId) ?? 0) + 1
    agentLaunchTokenByNodeIdRef.current.set(nodeId, next)
    return next
  }, [])
  const clearAgentLaunchToken = useCallback((nodeId: string): void => {
    agentLaunchTokenByNodeIdRef.current.delete(nodeId)
  }, [])
  const isAgentLaunchTokenCurrent = useCallback((nodeId: string, token: number): boolean => {
    return (agentLaunchTokenByNodeIdRef.current.get(nodeId) ?? 0) === token
  }, [])

  const closeNode = useCallback(
    async (nodeId: string) => {
      clearAgentLaunchToken(nodeId)

      const target = nodesRef.current.find(node => node.id === nodeId)
      if (target && target.data.sessionId.length > 0) {
        await window.coveApi.pty.kill({ sessionId: target.data.sessionId })
      }

      setNodes(prevNodes => {
        const now = new Date().toISOString()
        return removeNodeWithRelations({
          prevNodes,
          nodeId,
          target,
          now,
        })
      })
    },
    [clearAgentLaunchToken, setNodes],
  )

  const normalizePosition = useCallback((nodeId: string, desired: Point, size: Size): Point => {
    return findNearestFreePosition(desired, size, nodesRef.current, nodeId)
  }, [])

  const resizeNode = useCallback(
    (nodeId: string, desiredSize: Size) => {
      const node = nodesRef.current.find(item => item.id === nodeId)
      if (!node) {
        return
      }

      const boundedSize = clampSizeToNonOverlapping(
        node.position,
        desiredSize,
        MIN_SIZE,
        nodesRef.current,
        nodeId,
      )

      const boundedBySpace = clampSizeToContainingSpace({
        nodeId,
        position: node.position,
        size: boundedSize,
        minSize: MIN_SIZE,
        spaces: spacesRef.current,
      })

      upsertNode({
        ...node,
        data: {
          ...node.data,
          width: boundedBySpace.width,
          height: boundedBySpace.height,
        },
      })

      onRequestPersistFlush?.()
    },
    [onRequestPersistFlush, spacesRef, upsertNode],
  )

  const applyPendingScrollbacks = useCallback((targetNodes: Node<TerminalNodeData>[]) => {
    const pendingScrollbacks = pendingScrollbackByNodeRef.current
    if (pendingScrollbacks.size === 0) {
      return targetNodes
    }

    let hasChanged = false

    const nextNodes = targetNodes.map(node => {
      if (node.data.kind === 'task') {
        return node
      }

      const pending = pendingScrollbacks.get(node.id)
      if (pending === undefined) {
        return node
      }

      const normalized = pending.length > 0 ? pending : null
      if (node.data.scrollback === normalized) {
        return node
      }

      hasChanged = true

      return {
        ...node,
        data: {
          ...node.data,
          scrollback: normalized,
        },
      }
    })

    pendingScrollbacks.clear()
    return hasChanged ? nextNodes : targetNodes
  }, [])

  const updateNodeScrollback = useCallback(
    (nodeId: string, scrollback: string) => {
      if (isNodeDraggingRef.current) {
        pendingScrollbackByNodeRef.current.set(nodeId, scrollback)
        return
      }

      const normalized = scrollback.length > 0 ? scrollback : null

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind === 'task') {
              return node
            }

            if (node.data.scrollback === normalized) {
              return node
            }

            hasChanged = true

            return {
              ...node,
              data: {
                ...node.data,
                scrollback: normalized,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const updateTerminalTitle = useCallback(
    (nodeId: string, title: string) => {
      const normalizedTitle = title.trim()
      if (normalizedTitle.length === 0) {
        return
      }

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            if (node.data.titlePinnedByUser === true) {
              return node
            }

            if (node.data.title === normalizedTitle) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                title: normalizedTitle,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const renameTerminalTitle = useCallback(
    (nodeId: string, title: string) => {
      const normalizedTitle = title.trim()
      if (normalizedTitle.length === 0) {
        return
      }

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            const isPinned = node.data.titlePinnedByUser === true
            if (node.data.title === normalizedTitle && isPinned) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                title: normalizedTitle,
                titlePinnedByUser: true,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      onRequestPersistFlush?.()
    },
    [onRequestPersistFlush, setNodes],
  )

  const pushBlockingWindowsRight = useCallback(
    (desired: Point, size: Size): void => {
      const nextPositionByNodeId = computePushBlockingWindowsRight({
        desired,
        size,
        nodes: nodesRef.current,
      })

      if (nextPositionByNodeId.size === 0) {
        return
      }

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            const nextPosition = nextPositionByNodeId.get(node.id)
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

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const createNodeForSession = useCallback(
    async ({
      sessionId,
      title,
      anchor,
      kind,
      agent,
      executionDirectory,
      expectedDirectory,
    }: CreateNodeInput): Promise<Node<TerminalNodeData> | null> => {
      const defaultSize = resolveDefaultTerminalWindowSize(defaultTerminalWindowScalePercent)

      const { placement, canPlace } = resolveNodesPlacement({
        anchor,
        size: defaultSize,
        getNodes: () => nodesRef.current,
        pushBlockingWindowsRight,
      })

      if (canPlace !== true) {
        await window.coveApi.pty.kill({ sessionId })
        window.alert('当前视图附近没有可用空位，请先移动或关闭部分终端窗口。')
        return null
      }

      const now = new Date().toISOString()
      const normalizedExecutionDirectory =
        kind === 'agent'
          ? (agent?.executionDirectory ?? null)
          : (executionDirectory?.trim() ?? null)
      const normalizedExpectedDirectory =
        kind === 'agent'
          ? (agent?.expectedDirectory ?? agent?.executionDirectory ?? null)
          : (expectedDirectory?.trim() ?? executionDirectory?.trim() ?? null)

      const nextNode: Node<TerminalNodeData> = {
        id: crypto.randomUUID(),
        type: 'terminalNode',
        position: placement,
        data: {
          sessionId,
          title,
          titlePinnedByUser: false,
          width: defaultSize.width,
          height: defaultSize.height,
          kind,
          status: kind === 'agent' ? 'running' : null,
          startedAt: kind === 'agent' ? now : null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          scrollback: null,
          executionDirectory:
            normalizedExecutionDirectory && normalizedExecutionDirectory.length > 0
              ? normalizedExecutionDirectory
              : null,
          expectedDirectory:
            normalizedExpectedDirectory && normalizedExpectedDirectory.length > 0
              ? normalizedExpectedDirectory
              : null,
          agent: kind === 'agent' ? (agent ?? null) : null,
          task: null,
        },
        draggable: true,
        selectable: true,
      }

      setNodes(prevNodes => [...prevNodes, nextNode])
      onRequestPersistFlush?.()
      return nextNode
    },
    [defaultTerminalWindowScalePercent, onRequestPersistFlush, pushBlockingWindowsRight, setNodes],
  )

  const createTaskNode = useCallback(
    (
      anchor: Point,
      title: string,
      requirement: string,
      autoGeneratedTitle: boolean,
      priority: TaskPriority,
      tags: string[],
    ): Node<TerminalNodeData> | null => {
      const { placement, canPlace } = resolveNodesPlacement({
        anchor,
        size: TASK_SIZE,
        getNodes: () => nodesRef.current,
        pushBlockingWindowsRight,
      })

      if (canPlace !== true) {
        window.alert('当前视图附近没有可用空位，请先移动或关闭部分窗口。')
        return null
      }

      const now = new Date().toISOString()

      const nextNode: Node<TerminalNodeData> = {
        id: crypto.randomUUID(),
        type: 'taskNode',
        position: placement,
        data: {
          sessionId: '',
          title,
          titlePinnedByUser: false,
          width: TASK_SIZE.width,
          height: TASK_SIZE.height,
          kind: 'task',
          status: null,
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          scrollback: null,
          agent: null,
          task: {
            requirement,
            status: 'todo',
            priority,
            tags,
            linkedAgentNodeId: null,
            agentSessions: [],
            lastRunAt: null,
            autoGeneratedTitle,
            createdAt: now,
            updatedAt: now,
          },
        },
        draggable: true,
        selectable: true,
      }

      setNodes(prevNodes => [...prevNodes, nextNode])
      onRequestPersistFlush?.()
      return nextNode
    },
    [onRequestPersistFlush, pushBlockingWindowsRight, setNodes],
  )

  return {
    nodesRef,
    pendingScrollbackByNodeRef,
    isNodeDraggingRef,
    setNodes,
    upsertNode,
    bumpAgentLaunchToken,
    clearAgentLaunchToken,
    isAgentLaunchTokenCurrent,
    closeNode,
    normalizePosition,
    resizeNode,
    applyPendingScrollbacks,
    updateNodeScrollback,
    updateTerminalTitle,
    renameTerminalTitle,
    createNodeForSession,
    createTaskNode,
  }
}
