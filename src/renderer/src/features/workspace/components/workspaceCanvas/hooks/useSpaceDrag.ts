import { useCallback, useEffect, useRef, useState } from 'react'
import type { Node } from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'
import type { TerminalNodeData, WorkspaceSpaceRect, WorkspaceSpaceState } from '../../../types'
import type { ContextMenuState, EmptySelectionPromptState, SpaceDragState } from '../types'
import {
  resolveSpaceFrameHandle,
  SPACE_MIN_SIZE,
  type SpaceFrameHandle,
} from '../../../utils/spaceLayout'
import { finalizeWorkspaceSpaceDrag } from './useSpaceDrag.finalize'

interface UseSpaceDragParams {
  workspaceId: string
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  onRequestPersistFlush?: () => void
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  cancelSpaceRename: () => void
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
}

export function useWorkspaceCanvasSpaceDrag({
  workspaceId,
  reactFlow,
  nodesRef,
  spacesRef,
  setNodes,
  onSpacesChange,
  onRequestPersistFlush,
  setContextMenu,
  cancelSpaceRename,
  setEmptySelectionPrompt,
}: UseSpaceDragParams): {
  spaceFramePreview: { spaceId: string; rect: WorkspaceSpaceRect } | null
  handleSpaceDragHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
    spaceId: string,
  ) => void
} {
  const [spaceFramePreview, setSpaceFramePreview] = useState<{
    spaceId: string
    rect: WorkspaceSpaceRect
  } | null>(null)
  const spaceDragStateRef = useRef<SpaceDragState | null>(null)
  const spaceDragSawPointerMoveRef = useRef(false)

  useEffect(() => {
    setSpaceFramePreview(null)
    spaceDragStateRef.current = null
    spaceDragSawPointerMoveRef.current = false
  }, [workspaceId])

  const resolveResizedRect = useCallback(
    (dragState: SpaceDragState, dx: number, dy: number): WorkspaceSpaceRect => {
      const initialRect = dragState.initialRect
      const handle = dragState.handle
      if (handle.kind !== 'resize') {
        return initialRect
      }

      const edges = handle.edges
      let nextX = initialRect.x
      let nextY = initialRect.y
      let nextWidth = initialRect.width
      let nextHeight = initialRect.height

      if (edges.right) {
        nextWidth = initialRect.width + dx
      }

      if (edges.left) {
        nextX = initialRect.x + dx
        nextWidth = initialRect.width - dx
      }

      if (edges.bottom) {
        nextHeight = initialRect.height + dy
      }

      if (edges.top) {
        nextY = initialRect.y + dy
        nextHeight = initialRect.height - dy
      }

      if (nextWidth < SPACE_MIN_SIZE.width) {
        if (edges.left && !edges.right) {
          nextX = initialRect.x + (initialRect.width - SPACE_MIN_SIZE.width)
        }

        nextWidth = SPACE_MIN_SIZE.width
      }

      if (nextHeight < SPACE_MIN_SIZE.height) {
        if (edges.top && !edges.bottom) {
          nextY = initialRect.y + (initialRect.height - SPACE_MIN_SIZE.height)
        }

        nextHeight = SPACE_MIN_SIZE.height
      }

      const ownedBounds = dragState.ownedBounds
      if (ownedBounds) {
        const nextLeft = Math.min(nextX, ownedBounds.left)
        const nextTop = Math.min(nextY, ownedBounds.top)
        const nextRight = Math.max(nextX + nextWidth, ownedBounds.right)
        const nextBottom = Math.max(nextY + nextHeight, ownedBounds.bottom)

        nextX = nextLeft
        nextY = nextTop
        nextWidth = Math.max(SPACE_MIN_SIZE.width, nextRight - nextLeft)
        nextHeight = Math.max(SPACE_MIN_SIZE.height, nextBottom - nextTop)
      }

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      }
    },
    [],
  )

  const applySpaceDragNodePositions = useCallback(
    (dragState: SpaceDragState, dx: number, dy: number) => {
      setNodes(
        prevNodes => {
          let hasMoved = false
          const nextNodes = prevNodes.map(node => {
            const initialPosition = dragState.initialNodePositions.get(node.id)
            if (!initialPosition) {
              return node
            }

            const nextX = initialPosition.x + dx
            const nextY = initialPosition.y + dy
            if (node.position.x === nextX && node.position.y === nextY) {
              return node
            }

            hasMoved = true
            return {
              ...node,
              position: {
                x: nextX,
                y: nextY,
              },
            }
          })

          return hasMoved ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const finalizeSpaceDrag = useCallback(
    (dragState: SpaceDragState, dx: number, dy: number) => {
      finalizeWorkspaceSpaceDrag({
        dragState,
        dx,
        dy,
        nodes: nodesRef.current,
        spaces: spacesRef.current,
        applySpaceDragNodePositions,
        resolveResizedRect,
        setNodes,
        onSpacesChange,
        onRequestPersistFlush,
      })
    },
    [
      applySpaceDragNodePositions,
      nodesRef,
      onRequestPersistFlush,
      onSpacesChange,
      resolveResizedRect,
      setNodes,
      spacesRef,
    ],
  )

  const handleSpaceDragPointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = spaceDragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const currentFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const dx = currentFlow.x - dragState.startFlow.x
      const dy = currentFlow.y - dragState.startFlow.y

      const handle = dragState.handle
      if (handle.kind === 'move') {
        spaceDragSawPointerMoveRef.current = true
        setSpaceFramePreview({
          spaceId: dragState.spaceId,
          rect: {
            ...dragState.initialRect,
            x: dragState.initialRect.x + dx,
            y: dragState.initialRect.y + dy,
          },
        })
        applySpaceDragNodePositions(dragState, dx, dy)
        return
      }

      spaceDragSawPointerMoveRef.current = true
      setSpaceFramePreview({
        spaceId: dragState.spaceId,
        rect: resolveResizedRect(dragState, dx, dy),
      })
    },
    [applySpaceDragNodePositions, reactFlow, resolveResizedRect],
  )

  const handleSpaceDragPointerUp = useCallback(
    (event: PointerEvent) => {
      const dragState = spaceDragStateRef.current
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return
      }

      const endFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const dx = endFlow.x - dragState.startFlow.x
      const dy = endFlow.y - dragState.startFlow.y

      finalizeSpaceDrag(dragState, dx, dy)
      spaceDragStateRef.current = null
      setSpaceFramePreview(null)
      spaceDragSawPointerMoveRef.current = false
    },
    [finalizeSpaceDrag, reactFlow],
  )

  const handleSpaceDragMouseMove = useCallback(
    (event: MouseEvent) => {
      const dragState = spaceDragStateRef.current
      if (!dragState || spaceDragSawPointerMoveRef.current) {
        return
      }

      const currentFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const dx = currentFlow.x - dragState.startFlow.x
      const dy = currentFlow.y - dragState.startFlow.y

      const handle = dragState.handle
      if (handle.kind === 'move') {
        setSpaceFramePreview({
          spaceId: dragState.spaceId,
          rect: {
            ...dragState.initialRect,
            x: dragState.initialRect.x + dx,
            y: dragState.initialRect.y + dy,
          },
        })
        applySpaceDragNodePositions(dragState, dx, dy)
        return
      }

      setSpaceFramePreview({
        spaceId: dragState.spaceId,
        rect: resolveResizedRect(dragState, dx, dy),
      })
    },
    [applySpaceDragNodePositions, reactFlow, resolveResizedRect],
  )

  const handleSpaceDragMouseUp = useCallback(
    (event: MouseEvent) => {
      const dragState = spaceDragStateRef.current
      if (!dragState) {
        return
      }

      const endFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const dx = endFlow.x - dragState.startFlow.x
      const dy = endFlow.y - dragState.startFlow.y

      finalizeSpaceDrag(dragState, dx, dy)
      spaceDragStateRef.current = null
      setSpaceFramePreview(null)
      spaceDragSawPointerMoveRef.current = false
    },
    [finalizeSpaceDrag, reactFlow],
  )

  useEffect(() => {
    window.addEventListener('pointermove', handleSpaceDragPointerMove)
    window.addEventListener('pointerup', handleSpaceDragPointerUp)
    window.addEventListener('pointercancel', handleSpaceDragPointerUp)
    window.addEventListener('mousemove', handleSpaceDragMouseMove)
    window.addEventListener('mouseup', handleSpaceDragMouseUp)

    return () => {
      window.removeEventListener('pointermove', handleSpaceDragPointerMove)
      window.removeEventListener('pointerup', handleSpaceDragPointerUp)
      window.removeEventListener('pointercancel', handleSpaceDragPointerUp)
      window.removeEventListener('mousemove', handleSpaceDragMouseMove)
      window.removeEventListener('mouseup', handleSpaceDragMouseUp)
    }
  }, [
    handleSpaceDragMouseMove,
    handleSpaceDragMouseUp,
    handleSpaceDragPointerMove,
    handleSpaceDragPointerUp,
  ])

  const handleSpaceDragHandlePointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
      spaceId: string,
    ) => {
      if (event.button !== 0) {
        return
      }

      if (spaceDragStateRef.current) {
        return
      }

      const targetSpace = spacesRef.current.find(space => space.id === spaceId)
      if (!targetSpace || !targetSpace.rect) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const startFlow = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const zoom = reactFlow.getZoom()
      const handle: SpaceFrameHandle = resolveSpaceFrameHandle({
        rect: targetSpace.rect,
        point: startFlow,
        zoom,
      })

      const movableNodes =
        handle.kind === 'move'
          ? targetSpace.nodeIds
              .map(nodeId => nodesRef.current.find(node => node.id === nodeId))
              .filter((node): node is Node<TerminalNodeData> => Boolean(node))
          : []
      if (handle.kind === 'move' && movableNodes.length === 0) {
        return
      }

      const ownedBounds =
        handle.kind === 'resize'
          ? (() => {
              const ownedNodes = targetSpace.nodeIds
                .map(nodeId => nodesRef.current.find(node => node.id === nodeId))
                .filter((node): node is Node<TerminalNodeData> => Boolean(node))

              if (ownedNodes.length === 0) {
                return null
              }

              let left = Number.POSITIVE_INFINITY
              let top = Number.POSITIVE_INFINITY
              let right = Number.NEGATIVE_INFINITY
              let bottom = Number.NEGATIVE_INFINITY

              for (const node of ownedNodes) {
                left = Math.min(left, node.position.x)
                top = Math.min(top, node.position.y)
                right = Math.max(right, node.position.x + node.data.width)
                bottom = Math.max(bottom, node.position.y + node.data.height)
              }

              if (
                !Number.isFinite(left) ||
                !Number.isFinite(top) ||
                !Number.isFinite(right) ||
                !Number.isFinite(bottom)
              ) {
                return null
              }

              return { left, top, right, bottom }
            })()
          : null

      spaceDragStateRef.current = {
        pointerId: 'pointerId' in event ? event.pointerId : -1,
        spaceId,
        startFlow,
        initialRect: targetSpace.rect,
        initialNodePositions: new Map(
          movableNodes.map(node => [node.id, { x: node.position.x, y: node.position.y }]),
        ),
        ownedBounds,
        handle,
      }
      spaceDragSawPointerMoveRef.current = false
      setSpaceFramePreview({
        spaceId,
        rect: targetSpace.rect,
      })
      setContextMenu(null)
      cancelSpaceRename()
      setEmptySelectionPrompt(null)
    },
    [cancelSpaceRename, nodesRef, reactFlow, setContextMenu, setEmptySelectionPrompt, spacesRef],
  )

  return {
    spaceFramePreview,
    handleSpaceDragHandlePointerDown,
  }
}
