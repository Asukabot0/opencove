import { useCallback } from 'react'
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceRect, WorkspaceSpaceState } from '../../../types'
import { sanitizeSpaces } from '../helpers'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function isPointInsideRect(point: { x: number; y: number }, rect: WorkspaceSpaceRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

function rectIntersects(a: Rect, b: Rect): boolean {
  const aRight = a.x + a.width
  const aBottom = a.y + a.height
  const bRight = b.x + b.width
  const bBottom = b.y + b.height

  return !(aRight <= b.x || a.x >= bRight || aBottom <= b.y || a.y >= bBottom)
}

function inflateRect(rect: Rect, inset: number): Rect {
  return {
    x: rect.x - inset,
    y: rect.y - inset,
    width: rect.width + inset * 2,
    height: rect.height + inset * 2,
  }
}

function computeBoundingRect(nodes: Array<Node<TerminalNodeData>>): Rect | null {
  if (nodes.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const node of nodes) {
    const x = node.position.x
    const y = node.position.y
    const width = node.data.width
    const height = node.data.height

    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  }
}

function resolveDeltaToKeepRectInsideRect(
  rect: Rect,
  container: Rect,
  inset: number,
): { dx: number; dy: number } {
  const innerLeft = container.x + inset
  const innerTop = container.y + inset
  const innerRight = container.x + container.width - inset
  const innerBottom = container.y + container.height - inset

  const maxWidth = Math.max(0, innerRight - innerLeft)
  const maxHeight = Math.max(0, innerBottom - innerTop)

  let dx = 0
  let dy = 0

  if (rect.width > maxWidth) {
    dx = innerLeft - rect.x
  } else if (rect.x < innerLeft) {
    dx = innerLeft - rect.x
  } else if (rect.x + rect.width > innerRight) {
    dx = innerRight - (rect.x + rect.width)
  }

  if (rect.height > maxHeight) {
    dy = innerTop - rect.y
  } else if (rect.y < innerTop) {
    dy = innerTop - rect.y
  } else if (rect.y + rect.height > innerBottom) {
    dy = innerBottom - (rect.y + rect.height)
  }

  return { dx, dy }
}

function resolveDeltaToKeepRectOutsideRects(
  rect: Rect,
  obstacles: Rect[],
): { dx: number; dy: number } {
  const working: Rect = { ...rect }

  let totalDx = 0
  let totalDy = 0

  const maxIterations = Math.max(12, obstacles.length * 6)
  let iterations = 0

  while (iterations < maxIterations) {
    iterations += 1

    const blocking = obstacles.find(obstacle => rectIntersects(working, obstacle))
    if (!blocking) {
      break
    }

    const left = blocking.x - (working.x + working.width)
    const right = blocking.x + blocking.width - working.x
    const up = blocking.y - (working.y + working.height)
    const down = blocking.y + blocking.height - working.y

    const candidates: Array<{ dx: number; dy: number }> = [
      { dx: left, dy: 0 },
      { dx: right, dy: 0 },
      { dx: 0, dy: up },
      { dx: 0, dy: down },
    ]

    candidates.sort((a, b) => Math.abs(a.dx || a.dy) - Math.abs(b.dx || b.dy))
    const chosen = candidates[0]
    if (!chosen) {
      break
    }

    working.x += chosen.dx
    working.y += chosen.dy
    totalDx += chosen.dx
    totalDy += chosen.dy
  }

  return { dx: totalDx, dy: totalDy }
}

export function useWorkspaceCanvasSpaceOwnership({
  workspacePath,
  reactFlow,
  spacesRef,
  setNodes,
  onSpacesChange,
  onRequestPersistFlush,
}: {
  workspacePath: string
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>, Edge>
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  setNodes: SetNodes
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  onRequestPersistFlush?: () => void
}): {
  handleNodeDragStop: (
    event: React.MouseEvent,
    node: Node<TerminalNodeData>,
    nodes: Node<TerminalNodeData>[],
  ) => void
  handleSelectionDragStop: (event: React.MouseEvent, nodes: Node<TerminalNodeData>[]) => void
} {
  const resolveSpaceAtPoint = useCallback(
    (point: { x: number; y: number }): WorkspaceSpaceState | null => {
      for (const space of spacesRef.current) {
        if (!space.rect) {
          continue
        }

        if (isPointInsideRect(point, space.rect)) {
          return space
        }
      }

      return null
    },
    [spacesRef],
  )

  const applyDirectoryExpectation = useCallback(
    (nodeIds: string[], targetSpace: WorkspaceSpaceState | null) => {
      if (nodeIds.length === 0) {
        return
      }

      const nodeIdSet = new Set(nodeIds)
      const targetDirectory =
        targetSpace && targetSpace.directoryPath.trim().length > 0
          ? targetSpace.directoryPath
          : workspacePath

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (!nodeIdSet.has(node.id)) {
              return node
            }

            if (node.data.kind === 'agent' && node.data.agent) {
              const nextExpectedDirectory = targetSpace
                ? targetDirectory
                : node.data.agent.executionDirectory

              if (node.data.agent.expectedDirectory === nextExpectedDirectory) {
                return node
              }

              hasChanged = true
              return {
                ...node,
                data: {
                  ...node.data,
                  agent: {
                    ...node.data.agent,
                    expectedDirectory: nextExpectedDirectory,
                  },
                },
              }
            }

            if (node.data.kind === 'terminal') {
              const executionDirectory =
                typeof node.data.executionDirectory === 'string' &&
                node.data.executionDirectory.trim().length > 0
                  ? node.data.executionDirectory
                  : workspacePath

              const nextExpectedDirectory = targetSpace ? targetDirectory : executionDirectory

              if (
                node.data.executionDirectory === executionDirectory &&
                node.data.expectedDirectory === nextExpectedDirectory
              ) {
                return node
              }

              hasChanged = true
              return {
                ...node,
                data: {
                  ...node.data,
                  executionDirectory,
                  expectedDirectory: nextExpectedDirectory,
                },
              }
            }

            return node
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes, workspacePath],
  )

  const applyOwnershipForDrop = useCallback(
    (draggedNodes: Node<TerminalNodeData>[], dropFlowPoint: { x: number; y: number }) => {
      if (draggedNodes.length === 0) {
        return
      }

      const nodeIds = draggedNodes.map(node => node.id)
      const targetSpace = resolveSpaceAtPoint(dropFlowPoint)
      const targetSpaceId = targetSpace?.id ?? null
      const nodeIdSet = new Set(nodeIds)

      const nextSpaces = sanitizeSpaces(
        spacesRef.current.map(space => {
          const filtered = space.nodeIds.filter(nodeId => !nodeIdSet.has(nodeId))
          if (!targetSpaceId || space.id !== targetSpaceId) {
            return { ...space, nodeIds: filtered }
          }

          return { ...space, nodeIds: [...new Set([...filtered, ...nodeIds])] }
        }),
      )

      const hasSpaceChange =
        nextSpaces.length !== spacesRef.current.length ||
        nextSpaces.some((space, index) => {
          const prevSpace = spacesRef.current[index]
          if (!prevSpace) {
            return true
          }

          if (space.id !== prevSpace.id) {
            return true
          }

          if (space.nodeIds.length !== prevSpace.nodeIds.length) {
            return true
          }

          for (let i = 0; i < space.nodeIds.length; i += 1) {
            if (space.nodeIds[i] !== prevSpace.nodeIds[i]) {
              return true
            }
          }

          return false
        })

      if (hasSpaceChange) {
        onSpacesChange(nextSpaces)
      }

      const dropRect = computeBoundingRect(draggedNodes)
      const dropSpaceRect = targetSpace?.rect ?? null

      const { dx, dy } =
        dropRect && dropSpaceRect
          ? resolveDeltaToKeepRectInsideRect(dropRect, dropSpaceRect, 0)
          : dropRect
            ? resolveDeltaToKeepRectOutsideRects(
                dropRect,
                spacesRef.current
                  .map(space => space.rect)
                  .filter((rect): rect is WorkspaceSpaceRect => Boolean(rect))
                  .map(rect => inflateRect(rect, 0)),
              )
            : { dx: 0, dy: 0 }

      if (dx !== 0 || dy !== 0) {
        setNodes(prevNodes => {
          let hasChanged = false
          const nextNodes = prevNodes.map(node => {
            if (!nodeIdSet.has(node.id)) {
              return node
            }

            const nextX = node.position.x + dx
            const nextY = node.position.y + dy

            if (node.position.x === nextX && node.position.y === nextY) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              position: {
                x: nextX,
                y: nextY,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        })
      }

      applyDirectoryExpectation(nodeIds, targetSpace)
      if (hasSpaceChange || nodeIds.length > 0) {
        onRequestPersistFlush?.()
      }
    },
    [
      applyDirectoryExpectation,
      onRequestPersistFlush,
      onSpacesChange,
      resolveSpaceAtPoint,
      setNodes,
      spacesRef,
    ],
  )

  const handleNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node<TerminalNodeData>, nodes: Node<TerminalNodeData>[]) => {
      if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
        return
      }

      const dropPoint = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const draggedNodes = nodes.length > 0 ? nodes : [node]
      applyOwnershipForDrop(draggedNodes, dropPoint)
    },
    [applyOwnershipForDrop, reactFlow],
  )

  const handleSelectionDragStop = useCallback(
    (event: React.MouseEvent, nodes: Node<TerminalNodeData>[]) => {
      if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') {
        return
      }

      const dropPoint = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      applyOwnershipForDrop(nodes, dropPoint)
    },
    [applyOwnershipForDrop, reactFlow],
  )

  return {
    handleNodeDragStop,
    handleSelectionDragStop,
  }
}
