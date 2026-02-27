import { useCallback } from 'react'
import type { Node } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceRect, WorkspaceSpaceState } from '../../../types'
import type { ContextMenuState, EmptySelectionPromptState } from '../types'
import { isAgentWorking, sanitizeSpaces } from '../helpers'
import {
  computeSpaceRectFromNodes,
  pushAwayLayout,
  type LayoutItem,
} from '../../../utils/spaceLayout'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

export function useWorkspaceCanvasCreateSpace({
  workspacePath,
  nodesRef,
  setNodes,
  spacesRef,
  selectedNodeIdsRef,
  onSpacesChange,
  onRequestPersistFlush,
  setContextMenu,
  setEmptySelectionPrompt,
  cancelSpaceRename,
}: {
  workspacePath: string
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  setNodes: SetNodes
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  selectedNodeIdsRef: React.MutableRefObject<string[]>
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  onRequestPersistFlush?: () => void
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
  cancelSpaceRename: () => void
}): {
  createSpaceFromSelectedNodes: () => void
} {
  const resolveNodeDirectoryPath = useCallback(
    (nodeId: string): string => {
      const node = nodesRef.current.find(item => item.id === nodeId)
      if (!node) {
        return workspacePath
      }

      if (node.data.kind === 'agent') {
        return node.data.agent?.executionDirectory ?? workspacePath
      }

      if (node.data.kind === 'task' && node.data.task?.linkedAgentNodeId) {
        const linkedAgent = nodesRef.current.find(
          candidate =>
            candidate.id === node.data.task?.linkedAgentNodeId && candidate.data.kind === 'agent',
        )
        if (linkedAgent?.data.agent?.executionDirectory) {
          return linkedAgent.data.agent.executionDirectory
        }
      }

      return workspacePath
    },
    [nodesRef, workspacePath],
  )

  const expandSelectionWithLinkedAgents = useCallback(
    (selectedIds: string[]): string[] => {
      const expanded = new Set(selectedIds)

      for (const nodeId of selectedIds) {
        const node = nodesRef.current.find(item => item.id === nodeId)
        if (!node || node.data.kind !== 'task' || !node.data.task?.linkedAgentNodeId) {
          continue
        }

        expanded.add(node.data.task.linkedAgentNodeId)
      }

      return [...expanded]
    },
    [nodesRef],
  )

  const validateSelectionForTargetDirectory = useCallback(
    (selectedIds: string[], targetDirectoryPath: string): string | null => {
      for (const nodeId of selectedIds) {
        const node = nodesRef.current.find(item => item.id === nodeId)
        if (!node) {
          continue
        }

        if (node.data.kind === 'agent') {
          const nodeDirectory = resolveNodeDirectoryPath(node.id)
          if (nodeDirectory !== targetDirectoryPath) {
            return isAgentWorking(node.data.status)
              ? 'Running agents can only move to spaces with the same directory.'
              : 'Agents cannot be moved to a space with a different directory.'
          }
          continue
        }

        if (node.data.kind !== 'task' || !node.data.task) {
          continue
        }

        const linkedAgentNodeId = node.data.task.linkedAgentNodeId
        if (linkedAgentNodeId) {
          const linkedAgent = nodesRef.current.find(
            candidate => candidate.id === linkedAgentNodeId && candidate.data.kind === 'agent',
          )
          if (linkedAgent) {
            const linkedDirectory = resolveNodeDirectoryPath(linkedAgent.id)
            if (linkedDirectory !== targetDirectoryPath) {
              return isAgentWorking(linkedAgent.data.status)
                ? 'Tasks linked to running agents can only move to spaces with the same directory.'
                : 'Tasks linked to agents in another directory cannot be moved to this space.'
            }
          }
        }

        if (node.data.task.status === 'doing' && targetDirectoryPath !== workspacePath) {
          return 'Running tasks can only move to spaces with the same directory.'
        }
      }

      return null
    },
    [nodesRef, resolveNodeDirectoryPath, workspacePath],
  )

  const createSpace = useCallback(
    (payload: { nodeIds: string[]; rect: WorkspaceSpaceRect | null }) => {
      const normalizedNodeIds = expandSelectionWithLinkedAgents(payload.nodeIds).filter(nodeId =>
        nodesRef.current.some(node => node.id === nodeId),
      )
      if (normalizedNodeIds.length === 0) {
        window.alert('Space must include at least one task or agent.')
        setContextMenu(null)
        setEmptySelectionPrompt(null)
        return
      }

      const targetDirectoryPath = workspacePath
      const validationError = validateSelectionForTargetDirectory(
        normalizedNodeIds,
        targetDirectoryPath,
      )
      if (validationError) {
        window.alert(validationError)
        return
      }

      const usedNames = new Set(spacesRef.current.map(space => space.name.toLowerCase()))
      let nextNumber = spacesRef.current.length + 1
      let normalizedName = `Space ${nextNumber}`
      while (usedNames.has(normalizedName.toLowerCase())) {
        nextNumber += 1
        normalizedName = `Space ${nextNumber}`
      }

      const assignedNodeSet = new Set(normalizedNodeIds)
      const normalizedSpaces = sanitizeSpaces(
        spacesRef.current.map(space => ({
          ...space,
          nodeIds: space.nodeIds.filter(nodeId => !assignedNodeSet.has(nodeId)),
        })),
      )

      const createdNodes = normalizedNodeIds
        .map(nodeId => nodesRef.current.find(node => node.id === nodeId))
        .filter((node): node is Node<TerminalNodeData> => Boolean(node))
      const rect =
        payload.rect ??
        computeSpaceRectFromNodes(
          createdNodes.map(node => ({
            x: node.position.x,
            y: node.position.y,
            width: node.data.width,
            height: node.data.height,
          })),
        )

      const nextSpaceId = crypto.randomUUID()
      const nextSpace: WorkspaceSpaceState = {
        id: nextSpaceId,
        name: normalizedName,
        directoryPath: targetDirectoryPath,
        nodeIds: normalizedNodeIds,
        rect,
      }

      const draftSpaces = sanitizeSpaces([...normalizedSpaces, nextSpace])

      const ownedNodeIds = new Set(draftSpaces.flatMap(space => space.nodeIds))
      const items: LayoutItem[] = []

      const nodeById = new Map(nodesRef.current.map(node => [node.id, node]))

      for (const space of draftSpaces) {
        if (!space.rect) {
          continue
        }

        items.push({
          id: space.id,
          kind: 'space',
          groupId: space.id,
          rect: { ...space.rect },
        })

        for (const nodeId of space.nodeIds) {
          const node = nodeById.get(nodeId)
          if (!node) {
            continue
          }

          items.push({
            id: node.id,
            kind: 'node',
            groupId: space.id,
            rect: {
              x: node.position.x,
              y: node.position.y,
              width: node.data.width,
              height: node.data.height,
            },
          })
        }
      }

      for (const node of nodesRef.current) {
        if (ownedNodeIds.has(node.id)) {
          continue
        }

        items.push({
          id: node.id,
          kind: 'node',
          groupId: node.id,
          rect: {
            x: node.position.x,
            y: node.position.y,
            width: node.data.width,
            height: node.data.height,
          },
        })
      }

      const pushed = pushAwayLayout({
        items,
        pinnedGroupIds: [nextSpaceId],
        sourceGroupIds: [nextSpaceId],
        directions: ['x+'],
        gap: 24,
      })

      const nextSpaceRectById = new Map(
        pushed.filter(item => item.kind === 'space').map(item => [item.id, item.rect]),
      )
      const nextNodePositionById = new Map(
        pushed
          .filter(item => item.kind === 'node')
          .map(item => [item.id, { x: item.rect.x, y: item.rect.y }]),
      )

      const nextSpaces = draftSpaces.map(space => {
        const pushedRect = nextSpaceRectById.get(space.id)
        if (!pushedRect || !space.rect) {
          return space
        }

        if (
          pushedRect.x === space.rect.x &&
          pushedRect.y === space.rect.y &&
          pushedRect.width === space.rect.width &&
          pushedRect.height === space.rect.height
        ) {
          return space
        }

        return { ...space, rect: pushedRect }
      })

      const assignedNodeIdSet = new Set(normalizedNodeIds)
      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            const nextPosition = nextNodePositionById.get(node.id)

            const isAssignedToNewSpace = assignedNodeIdSet.has(node.id)
            const targetDirectoryPath =
              nextSpace.directoryPath.trim().length > 0 ? nextSpace.directoryPath : workspacePath

            if (node.data.kind === 'agent' && node.data.agent && isAssignedToNewSpace) {
              const nextExpectedDirectory = targetDirectoryPath
              const hasPositionChange =
                nextPosition &&
                (node.position.x !== nextPosition.x || node.position.y !== nextPosition.y)

              const hasDirectoryChange = node.data.agent.expectedDirectory !== nextExpectedDirectory

              if (!hasPositionChange && !hasDirectoryChange) {
                return node
              }

              hasChanged = true
              return {
                ...node,
                ...(hasPositionChange ? { position: nextPosition } : null),
                data: {
                  ...node.data,
                  agent: {
                    ...node.data.agent,
                    expectedDirectory: nextExpectedDirectory,
                  },
                },
              }
            }

            if (node.data.kind === 'terminal' && isAssignedToNewSpace) {
              const executionDirectory =
                typeof node.data.executionDirectory === 'string' &&
                node.data.executionDirectory.trim().length > 0
                  ? node.data.executionDirectory
                  : workspacePath

              const nextExpectedDirectory = targetDirectoryPath

              const hasPositionChange =
                nextPosition &&
                (node.position.x !== nextPosition.x || node.position.y !== nextPosition.y)

              const hasDirectoryChange =
                node.data.executionDirectory !== executionDirectory ||
                node.data.expectedDirectory !== nextExpectedDirectory

              if (!hasPositionChange && !hasDirectoryChange) {
                return node
              }

              hasChanged = true
              return {
                ...node,
                ...(hasPositionChange ? { position: nextPosition } : null),
                data: {
                  ...node.data,
                  executionDirectory,
                  expectedDirectory: nextExpectedDirectory,
                },
              }
            }

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

      onSpacesChange(nextSpaces)
      onRequestPersistFlush?.()
      setContextMenu(null)
      setEmptySelectionPrompt(null)
      cancelSpaceRename()
    },
    [
      cancelSpaceRename,
      expandSelectionWithLinkedAgents,
      nodesRef,
      onRequestPersistFlush,
      onSpacesChange,
      setContextMenu,
      setEmptySelectionPrompt,
      setNodes,
      spacesRef,
      validateSelectionForTargetDirectory,
      workspacePath,
    ],
  )

  const createSpaceFromSelectedNodes = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current
    if (selectedIds.length === 0) {
      setContextMenu(null)
      return
    }

    createSpace({
      nodeIds: selectedIds,
      rect: null,
    })
  }, [createSpace, selectedNodeIdsRef, setContextMenu])

  return {
    createSpaceFromSelectedNodes,
  }
}
