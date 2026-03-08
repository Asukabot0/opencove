import { useCallback, useRef } from 'react'
import { useStoreApi, type Edge, type Node, type ReactFlowInstance } from '@xyflow/react'
import type { Point, TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import type {
  ContextMenuState,
  CreateNodeInput,
  EmptySelectionPromptState,
  SelectionDraftState,
} from '../types'
import { useWorkspaceCanvasSelectionDraft } from './useSelectionDraft'
import {
  assignNodeToSpaceAndExpand,
  findContainingSpaceByAnchor,
} from './useInteractions.spaceAssignment'

type SetNodes = (
  updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
  options?: { syncLayout?: boolean },
) => void

type SelectionDraftUiState = Pick<
  SelectionDraftState,
  'startX' | 'startY' | 'currentX' | 'currentY' | 'phase'
>

interface UseWorkspaceCanvasInteractionsParams {
  isTrackpadCanvasMode: boolean
  isShiftPressedRef: React.MutableRefObject<boolean>
  selectionDraftRef: React.MutableRefObject<SelectionDraftState | null>
  setSelectionDraftUi: React.Dispatch<React.SetStateAction<SelectionDraftUiState | null>>
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>, Edge>
  setNodes: SetNodes
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>
  setEmptySelectionPrompt: React.Dispatch<React.SetStateAction<EmptySelectionPromptState | null>>
  cancelSpaceRename: () => void
  selectedNodeIdsRef: React.MutableRefObject<string[]>
  selectedSpaceIdsRef: React.MutableRefObject<string[]>
  contextMenu: ContextMenuState | null
  workspacePath: string
  spacesRef: React.MutableRefObject<WorkspaceSpaceState[]>
  onSpacesChange: (spaces: WorkspaceSpaceState[]) => void
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  createNodeForSession: (input: CreateNodeInput) => Promise<Node<TerminalNodeData> | null>
  createNoteNode: (anchor: Point) => Node<TerminalNodeData> | null
}

export function useWorkspaceCanvasInteractions({
  isTrackpadCanvasMode,
  isShiftPressedRef,
  selectionDraftRef,
  setSelectionDraftUi,
  reactFlow,
  setNodes,
  setSelectedNodeIds,
  setSelectedSpaceIds,
  setContextMenu,
  setEmptySelectionPrompt,
  cancelSpaceRename,
  selectedNodeIdsRef,
  selectedSpaceIdsRef,
  contextMenu,
  workspacePath,
  spacesRef,
  onSpacesChange,
  nodesRef,
  createNodeForSession,
  createNoteNode,
}: UseWorkspaceCanvasInteractionsParams): {
  clearNodeSelection: () => void
  handleCanvasDoubleClickCapture: React.MouseEventHandler<HTMLDivElement>
  handleSelectionContextMenu: (
    event: React.MouseEvent,
    selectedNodes: Node<TerminalNodeData>[],
  ) => void
  handleNodeContextMenu: (event: React.MouseEvent, node: Node<TerminalNodeData>) => void
  handlePaneContextMenu: (event: React.MouseEvent | MouseEvent) => void
  handleSelectionChange: (params: { nodes: Node<TerminalNodeData>[] }) => void
  handleCanvasPointerDownCapture: React.PointerEventHandler<HTMLDivElement>
  handleCanvasPointerMoveCapture: React.PointerEventHandler<HTMLDivElement>
  handleCanvasPointerUpCapture: React.PointerEventHandler<HTMLDivElement>
  handlePaneClick: (_event: React.MouseEvent | MouseEvent) => void
  createTerminalNode: () => Promise<void>
} {
  const reactFlowStore = useStoreApi()

  const clearNodeSelection = useCallback(() => {
    setNodes(
      prevNodes => {
        let hasSelection = false
        const nextNodes = prevNodes.map(node => {
          if (!node.selected) {
            return node
          }

          hasSelection = true
          return {
            ...node,
            selected: false,
          }
        })

        return hasSelection ? nextNodes : prevNodes
      },
      { syncLayout: false },
    )
    setSelectedNodeIds([])
    setSelectedSpaceIds([])
    reactFlowStore.setState({ nodesSelectionActive: false })
  }, [reactFlowStore, setNodes, setSelectedNodeIds, setSelectedSpaceIds])

  const openSelectionContextMenu = useCallback(
    (x: number, y: number) => {
      setContextMenu({
        kind: 'selection',
        x,
        y,
      })
      setEmptySelectionPrompt(null)
    },
    [setContextMenu, setEmptySelectionPrompt],
  )

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent, selectedNodes: Node<TerminalNodeData>[]) => {
      event.preventDefault()
      if (selectedNodes.length === 0) {
        return
      }

      openSelectionContextMenu(event.clientX, event.clientY)
    },
    [openSelectionContextMenu],
  )

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<TerminalNodeData>) => {
      if (!selectedNodeIdsRef.current.includes(node.id)) {
        return
      }

      event.preventDefault()
      openSelectionContextMenu(event.clientX, event.clientY)
    },
    [openSelectionContextMenu, selectedNodeIdsRef],
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      if (!('clientX' in event)) {
        return
      }

      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      setContextMenu({
        kind: 'pane',
        x: event.clientX,
        y: event.clientY,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      })
      setEmptySelectionPrompt(null)
      cancelSpaceRename()
    },
    [cancelSpaceRename, reactFlow, setContextMenu, setEmptySelectionPrompt],
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node<TerminalNodeData>[] }) => {
      if (selectionDraftRef.current !== null) {
        return
      }

      const selectedIds = selected.map(node => node.id)
      setSelectedNodeIds(selectedIds)
      if (selectedIds.length > 0) {
        setEmptySelectionPrompt(null)
      }
    },
    [selectionDraftRef, setEmptySelectionPrompt, setSelectedNodeIds],
  )

  const {
    handleCanvasPointerDownCapture,
    handleCanvasPointerMoveCapture,
    handleCanvasPointerUpCapture,
  } = useWorkspaceCanvasSelectionDraft({
    isTrackpadCanvasMode,
    isShiftPressedRef,
    selectionDraftRef,
    setSelectionDraftUi,
    reactFlow,
    spacesRef,
    selectedNodeIdsRef,
    selectedSpaceIdsRef,
    setNodes,
    setSelectedNodeIds,
    setSelectedSpaceIds,
    setContextMenu,
    setEmptySelectionPrompt,
  })

  const paneDragRef = useRef<{
    startX: number
    startY: number
    didMove: boolean
  } | null>(null)

  const ignoreNextPaneClickRef = useRef(false)

  const handleCanvasPointerDownCaptureWithDragGuard = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        event.button === 0 &&
        !isTrackpadCanvasMode &&
        !event.shiftKey &&
        !isShiftPressedRef.current &&
        event.target instanceof Element &&
        !event.target.closest('.react-flow__node') &&
        (event.target.closest('.react-flow__pane') ||
          event.target.closest('.react-flow__renderer') ||
          event.target.closest('.react-flow__background'))
      ) {
        paneDragRef.current = {
          startX: event.clientX,
          startY: event.clientY,
          didMove: false,
        }
      } else {
        paneDragRef.current = null
      }

      handleCanvasPointerDownCapture(event)
    },
    [handleCanvasPointerDownCapture, isShiftPressedRef, isTrackpadCanvasMode],
  )

  const handleCanvasPointerMoveCaptureWithDragGuard = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const draft = paneDragRef.current
      if (draft && !draft.didMove) {
        const dx = event.clientX - draft.startX
        const dy = event.clientY - draft.startY
        if (Math.hypot(dx, dy) > 6) {
          draft.didMove = true
        }
      }

      handleCanvasPointerMoveCapture(event)
    },
    [handleCanvasPointerMoveCapture],
  )

  const handleCanvasPointerUpCaptureWithDragGuard = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (selectionDraftRef.current?.phase === 'active') {
        event.preventDefault()
        event.stopPropagation()
      }

      const draft = paneDragRef.current
      paneDragRef.current = null
      const didCommitSelectionDraft = handleCanvasPointerUpCapture(event)

      if (draft?.didMove || didCommitSelectionDraft) {
        ignoreNextPaneClickRef.current = true
        window.setTimeout(() => {
          ignoreNextPaneClickRef.current = false
        }, 0)
      }
    },
    [handleCanvasPointerUpCapture, selectionDraftRef],
  )

  const handleCanvasDoubleClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return
      }

      if (!(event.target instanceof Element)) {
        return
      }

      const isFlowClickTarget =
        event.target.closest('.react-flow__pane') ||
        event.target.closest('.react-flow__renderer') ||
        event.target.closest('.react-flow__background')
      if (!isFlowClickTarget) {
        return
      }

      if (
        event.target.closest('.react-flow__node') ||
        event.target.closest('.react-flow__panel') ||
        event.target.closest('.react-flow__minimap') ||
        event.target.closest('.react-flow__controls') ||
        event.target.closest('.workspace-space-region__label-group') ||
        event.target.closest('.workspace-space-region__drag-handle') ||
        event.target.closest('button, input, textarea, select, a')
      ) {
        return
      }

      clearNodeSelection()
      setContextMenu(null)
      setEmptySelectionPrompt(null)
      cancelSpaceRename()

      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const anchor: Point = {
        x: flowPosition.x,
        y: flowPosition.y,
      }

      const created = createNoteNode(anchor)
      if (!created) {
        return
      }

      const targetSpace = findContainingSpaceByAnchor(spacesRef.current, anchor)
      if (!targetSpace) {
        return
      }

      assignNodeToSpaceAndExpand({
        createdNodeId: created.id,
        targetSpaceId: targetSpace.id,
        spacesRef,
        nodesRef,
        setNodes,
        onSpacesChange,
      })
    },
    [
      cancelSpaceRename,
      clearNodeSelection,
      createNoteNode,
      nodesRef,
      onSpacesChange,
      reactFlow,
      setContextMenu,
      setEmptySelectionPrompt,
      setNodes,
      spacesRef,
    ],
  )
  const handlePaneClick = useCallback(
    (_event: React.MouseEvent | MouseEvent) => {
      if (ignoreNextPaneClickRef.current) {
        ignoreNextPaneClickRef.current = false
        return
      }

      clearNodeSelection()
      setContextMenu(null)
      setEmptySelectionPrompt(null)
      cancelSpaceRename()
    },
    [cancelSpaceRename, clearNodeSelection, setContextMenu, setEmptySelectionPrompt],
  )

  const createTerminalNode = useCallback(async () => {
    if (!contextMenu || contextMenu.kind !== 'pane') {
      return
    }

    const anchor = {
      x: contextMenu.flowX,
      y: contextMenu.flowY,
    }

    setContextMenu(null)

    const targetSpace = findContainingSpaceByAnchor(spacesRef.current, anchor)

    const resolvedCwd =
      targetSpace && targetSpace.directoryPath.trim().length > 0
        ? targetSpace.directoryPath
        : workspacePath

    const spawned = await window.coveApi.pty.spawn({
      cwd: resolvedCwd,
      cols: 80,
      rows: 24,
    })

    const created = await createNodeForSession({
      sessionId: spawned.sessionId,
      title: `terminal-${nodesRef.current.length + 1}`,
      anchor,
      kind: 'terminal',
      executionDirectory: resolvedCwd,
      expectedDirectory: resolvedCwd,
    })

    if (!created || !targetSpace) {
      return
    }

    assignNodeToSpaceAndExpand({
      createdNodeId: created.id,
      targetSpaceId: targetSpace.id,
      spacesRef,
      nodesRef,
      setNodes,
      onSpacesChange,
    })
  }, [
    contextMenu,
    createNodeForSession,
    nodesRef,
    onSpacesChange,
    setContextMenu,
    setNodes,
    spacesRef,
    workspacePath,
  ])

  return {
    clearNodeSelection,
    handleCanvasDoubleClickCapture,
    handleSelectionContextMenu,
    handleNodeContextMenu,
    handlePaneContextMenu,
    handleSelectionChange,
    handleCanvasPointerDownCapture: handleCanvasPointerDownCaptureWithDragGuard,
    handleCanvasPointerMoveCapture: handleCanvasPointerMoveCaptureWithDragGuard,
    handleCanvasPointerUpCapture: handleCanvasPointerUpCaptureWithDragGuard,
    handlePaneClick,
    createTerminalNode,
  }
}
