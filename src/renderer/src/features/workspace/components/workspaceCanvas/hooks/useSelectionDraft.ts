import { useCallback, useRef, type MutableRefObject } from 'react'
import type { Node } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import type { ContextMenuState, EmptySelectionPromptState, SelectionDraftState } from '../types'
import { isPointInsideRect, rectIntersects, type Rect } from './useSpaceOwnership.helpers'

interface UseSelectionDraftParams {
  isTrackpadCanvasMode: boolean
  isShiftPressedRef: MutableRefObject<boolean>
  selectionDraftRef: MutableRefObject<SelectionDraftState | null>
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  selectedNodeIdsRef: MutableRefObject<string[]>
  selectedSpaceIdsRef: MutableRefObject<string[]>
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
}

export function useWorkspaceCanvasSelectionDraft({
  isTrackpadCanvasMode,
  isShiftPressedRef,
  selectionDraftRef,
  reactFlow,
  spacesRef,
  selectedNodeIdsRef,
  selectedSpaceIdsRef,
  setNodes,
  setSelectedNodeIds,
  setSelectedSpaceIds,
  setContextMenu,
  setEmptySelectionPrompt,
}: UseSelectionDraftParams): {
  handleCanvasPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleCanvasPointerMoveCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleCanvasPointerUpCapture: () => void
} {
  const pendingSelectionFrameRef = useRef<number | null>(null)

  const resolveDraftRect = useCallback(
    (draft: SelectionDraftState): Rect => {
      const start = reactFlow.screenToFlowPosition({
        x: draft.startX,
        y: draft.startY,
      })
      const end = reactFlow.screenToFlowPosition({
        x: draft.currentX,
        y: draft.currentY,
      })

      const left = Math.min(start.x, end.x)
      const right = Math.max(start.x, end.x)
      const top = Math.min(start.y, end.y)
      const bottom = Math.max(start.y, end.y)

      return {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      }
    },
    [reactFlow],
  )

  const updateSelectedSpaceIds = useCallback(
    (next: string[]) => {
      const sorted = [...new Set(next)].sort((a, b) => a.localeCompare(b))
      setSelectedSpaceIds(prev => {
        if (
          prev.length === sorted.length &&
          prev.every((value, index) => value === sorted[index])
        ) {
          return prev
        }

        return sorted
      })
    },
    [setSelectedSpaceIds],
  )

  const applyDraftSelection = useCallback(
    (draft: SelectionDraftState, options?: { forceDeselectIntersectingNodes?: boolean }) => {
      const forceDeselectIntersectingNodes = options?.forceDeselectIntersectingNodes === true
      const draftRect = resolveDraftRect(draft)

      const selectionIsInSpace = Boolean(draft.startSpaceId)
      const spaceAtStart = selectionIsInSpace
        ? (spacesRef.current.find(space => space.id === draft.startSpaceId) ?? null)
        : null
      const startSpaceRect = spaceAtStart?.rect ?? null

      const intersectingSpaces = selectionIsInSpace
        ? []
        : spacesRef.current
            .map(space => {
              if (!space.rect) {
                return null
              }

              if (!rectIntersects(space.rect as Rect, draftRect)) {
                return null
              }

              return { id: space.id, rect: space.rect }
            })
            .filter(
              (
                item,
              ): item is {
                id: string
                rect: NonNullable<WorkspaceSpaceState['rect']>
              } => item !== null,
            )

      const intersectingSpaceIds = intersectingSpaces.map(space => space.id)
      const intersectingSpaceRects = intersectingSpaces.map(space => space.rect)

      const nextSelectedSpaceIds = selectionIsInSpace
        ? []
        : draft.additive
          ? [...draft.selectedSpaceIdsAtStart, ...intersectingSpaceIds]
          : intersectingSpaceIds

      updateSelectedSpaceIds(nextSelectedSpaceIds)

      const selectedAtStart = draft.additive
        ? new Set(draft.selectedNodeIdsAtStart)
        : new Set<string>()

      const selectedIds: string[] = []

      setNodes(
        previousNodes => {
          let hasChanged = false

          const nextNodes = previousNodes.map(node => {
            const nodeRect: Rect = {
              x: node.position.x,
              y: node.position.y,
              width: node.data.width,
              height: node.data.height,
            }

            const nodeCenter = {
              x: node.position.x + node.data.width / 2,
              y: node.position.y + node.data.height / 2,
            }

            const intersects = rectIntersects(nodeRect, draftRect)

            const allowedBySpace = selectionIsInSpace
              ? Boolean(startSpaceRect && isPointInsideRect(nodeCenter, startSpaceRect))
              : !intersectingSpaceRects.some(rect => isPointInsideRect(nodeCenter, rect))

            let isSelected = intersects && allowedBySpace

            if (draft.additive) {
              isSelected = isSelected || (allowedBySpace && selectedAtStart.has(node.id))
            }

            if (isSelected) {
              selectedIds.push(node.id)
            }

            const shouldForceDeselectSync =
              forceDeselectIntersectingNodes && intersects && !allowedBySpace

            if (node.selected === isSelected && !shouldForceDeselectSync) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              selected: isSelected,
            }
          })

          return hasChanged ? nextNodes : previousNodes
        },
        { syncLayout: false },
      )

      setSelectedNodeIds(selectedIds)
    },
    [resolveDraftRect, setNodes, setSelectedNodeIds, spacesRef, updateSelectedSpaceIds],
  )

  const handleCanvasPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const canStartBoxSelection =
        isTrackpadCanvasMode || event.shiftKey || isShiftPressedRef.current

      if (event.button !== 0 || !canStartBoxSelection) {
        return
      }

      if (!(event.target instanceof Element)) {
        return
      }

      if (event.target.closest('.react-flow__node')) {
        return
      }

      if (event.target.closest('.react-flow__nodesselection-rect')) {
        return
      }

      if (event.target.closest('.workspace-space-region--selected')) {
        return
      }

      if (
        event.target.closest('.workspace-space-region__drag-handle') ||
        event.target.closest('.workspace-space-region__label-group') ||
        event.target.closest('.workspace-space-region__label-input') ||
        event.target.closest('.workspace-space-region__menu')
      ) {
        return
      }

      if (
        !event.target.closest('.react-flow__pane') &&
        !event.target.closest('.react-flow__renderer')
      ) {
        return
      }

      const startFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const startSpace = spacesRef.current.find(space => {
        if (!space.rect) {
          return false
        }

        return isPointInsideRect(startFlow, space.rect)
      })

      selectionDraftRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        additive: event.shiftKey || isShiftPressedRef.current,
        selectedNodeIdsAtStart: [...selectedNodeIdsRef.current],
        selectedSpaceIdsAtStart: [...selectedSpaceIdsRef.current],
        startSpaceId: startSpace?.id ?? null,
      }
      setContextMenu(null)
      setEmptySelectionPrompt(null)
    },
    [
      isShiftPressedRef,
      isTrackpadCanvasMode,
      reactFlow,
      selectedNodeIdsRef,
      selectedSpaceIdsRef,
      selectionDraftRef,
      spacesRef,
      setContextMenu,
      setEmptySelectionPrompt,
    ],
  )

  const scheduleDraftSelectionUpdate = useCallback(() => {
    if (pendingSelectionFrameRef.current !== null) {
      return
    }

    pendingSelectionFrameRef.current = window.requestAnimationFrame(() => {
      pendingSelectionFrameRef.current = null
      const latestDraft = selectionDraftRef.current
      if (!latestDraft) {
        return
      }

      const width = Math.abs(latestDraft.currentX - latestDraft.startX)
      const height = Math.abs(latestDraft.currentY - latestDraft.startY)
      if (width < 8 || height < 8) {
        return
      }

      applyDraftSelection(latestDraft)
    })
  }, [applyDraftSelection, selectionDraftRef])

  const handleCanvasPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const draft = selectionDraftRef.current
      if (!draft) {
        return
      }

      draft.currentX = event.clientX
      draft.currentY = event.clientY
      scheduleDraftSelectionUpdate()
    },
    [scheduleDraftSelectionUpdate, selectionDraftRef],
  )

  const handleCanvasPointerUpCapture = useCallback(() => {
    const draft = selectionDraftRef.current
    if (!draft) {
      return
    }

    if (pendingSelectionFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingSelectionFrameRef.current)
      pendingSelectionFrameRef.current = null
    }

    const width = Math.abs(draft.currentX - draft.startX)
    const height = Math.abs(draft.currentY - draft.startY)
    if (width < 8 || height < 8) {
      selectionDraftRef.current = null
      return
    }

    applyDraftSelection(draft, { forceDeselectIntersectingNodes: true })
    setEmptySelectionPrompt(null)

    window.requestAnimationFrame(() => {
      if (selectionDraftRef.current === draft) {
        applyDraftSelection(draft, { forceDeselectIntersectingNodes: true })
      }

      window.requestAnimationFrame(() => {
        if (selectionDraftRef.current === draft) {
          selectionDraftRef.current = null
        }
      })
    })
  }, [applyDraftSelection, selectionDraftRef, setEmptySelectionPrompt])

  return {
    handleCanvasPointerDownCapture,
    handleCanvasPointerMoveCapture,
    handleCanvasPointerUpCapture,
  }
}
