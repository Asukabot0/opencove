import { useEffect, useRef } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import type { Size, TaskRuntimeStatus, TerminalNodeData } from '../../../types'

export interface WorkspaceCanvasActionRefs {
  closeNodeRef: React.MutableRefObject<(nodeId: string) => Promise<void>>
  resizeNodeRef: React.MutableRefObject<(nodeId: string, desiredSize: Size) => void>
  updateNoteTextRef: React.MutableRefObject<(nodeId: string, text: string) => void>
  runTaskAgentRef: React.MutableRefObject<(nodeId: string) => Promise<void>>
  resumeTaskAgentSessionRef: React.MutableRefObject<
    (taskNodeId: string, recordId: string) => Promise<void>
  >
  removeTaskAgentSessionRecordRef: React.MutableRefObject<
    (taskNodeId: string, recordId: string) => void
  >
  openTaskEditorRef: React.MutableRefObject<(nodeId: string) => void>
  quickUpdateTaskTitleRef: React.MutableRefObject<(nodeId: string, title: string) => void>
  quickUpdateTaskRequirementRef: React.MutableRefObject<
    (nodeId: string, requirement: string) => void
  >
  requestTaskDeleteRef: React.MutableRefObject<(nodeId: string) => void>
  openTaskAssignerRef: React.MutableRefObject<(nodeId: string) => void>
  updateTaskStatusRef: React.MutableRefObject<(nodeId: string, status: TaskRuntimeStatus) => void>
  updateNodeScrollbackRef: React.MutableRefObject<(nodeId: string, scrollback: string) => void>
  updateTerminalTitleRef: React.MutableRefObject<(nodeId: string, title: string) => void>
  renameTerminalTitleRef: React.MutableRefObject<(nodeId: string, title: string) => void>
  normalizeViewportForTerminalInteractionRef: React.MutableRefObject<(nodeId: string) => void>
}

export function useWorkspaceCanvasActionRefs(): WorkspaceCanvasActionRefs {
  const closeNodeRef = useRef<(nodeId: string) => Promise<void>>(
    async (_nodeId: string) => undefined,
  )
  const resizeNodeRef = useRef<(nodeId: string, desiredSize: Size) => void>(
    (_nodeId: string, _desiredSize: Size) => undefined,
  )
  const updateNoteTextRef = useRef<(nodeId: string, text: string) => void>(
    (_nodeId: string, _text: string) => undefined,
  )
  const runTaskAgentRef = useRef<(nodeId: string) => Promise<void>>(
    async (_nodeId: string) => undefined,
  )
  const resumeTaskAgentSessionRef = useRef<(taskNodeId: string, recordId: string) => Promise<void>>(
    async (_taskNodeId: string, _recordId: string) => undefined,
  )
  const removeTaskAgentSessionRecordRef = useRef<(taskNodeId: string, recordId: string) => void>(
    (_taskNodeId: string, _recordId: string) => undefined,
  )
  const openTaskEditorRef = useRef<(nodeId: string) => void>(() => undefined)
  const quickUpdateTaskTitleRef = useRef<(nodeId: string, title: string) => void>(
    (_nodeId: string, _title: string) => undefined,
  )
  const quickUpdateTaskRequirementRef = useRef<(nodeId: string, requirement: string) => void>(
    (_nodeId: string, _requirement: string) => undefined,
  )
  const requestTaskDeleteRef = useRef<(nodeId: string) => void>(() => undefined)
  const openTaskAssignerRef = useRef<(nodeId: string) => void>(() => undefined)
  const updateTaskStatusRef = useRef<(nodeId: string, status: TaskRuntimeStatus) => void>(
    (_nodeId: string, _status: TaskRuntimeStatus) => undefined,
  )
  const updateNodeScrollbackRef = useRef<(nodeId: string, scrollback: string) => void>(
    (_nodeId: string, _scrollback: string) => undefined,
  )
  const updateTerminalTitleRef = useRef<(nodeId: string, title: string) => void>(
    (_nodeId: string, _title: string) => undefined,
  )
  const renameTerminalTitleRef = useRef<(nodeId: string, title: string) => void>(
    (_nodeId: string, _title: string) => undefined,
  )
  const normalizeViewportForTerminalInteractionRef = useRef<(nodeId: string) => void>(
    (_nodeId: string) => undefined,
  )

  return {
    closeNodeRef,
    resizeNodeRef,
    updateNoteTextRef,
    runTaskAgentRef,
    resumeTaskAgentSessionRef,
    removeTaskAgentSessionRecordRef,
    openTaskEditorRef,
    quickUpdateTaskTitleRef,
    quickUpdateTaskRequirementRef,
    requestTaskDeleteRef,
    openTaskAssignerRef,
    updateTaskStatusRef,
    updateNodeScrollbackRef,
    updateTerminalTitleRef,
    renameTerminalTitleRef,
    normalizeViewportForTerminalInteractionRef,
  }
}

interface SyncActionRefsParams {
  actionRefs: WorkspaceCanvasActionRefs
  closeNode: (nodeId: string) => Promise<void>
  resizeNode: (nodeId: string, desiredSize: Size) => void
  updateNoteText: (nodeId: string, text: string) => void
  updateNodeScrollback: (nodeId: string, scrollback: string) => void
  updateTerminalTitle: (nodeId: string, title: string) => void
  renameTerminalTitle: (nodeId: string, title: string) => void
  normalizeZoomOnTerminalClick: boolean
  nodesRef: React.MutableRefObject<Node<TerminalNodeData>[]>
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>>
}

export function useWorkspaceCanvasSyncActionRefs({
  actionRefs,
  closeNode,
  resizeNode,
  updateNoteText,
  updateNodeScrollback,
  updateTerminalTitle,
  renameTerminalTitle,
  normalizeZoomOnTerminalClick,
  nodesRef,
  reactFlow,
}: SyncActionRefsParams): void {
  useEffect(() => {
    actionRefs.closeNodeRef.current = closeNode
  }, [actionRefs.closeNodeRef, closeNode])

  useEffect(() => {
    actionRefs.resizeNodeRef.current = resizeNode
  }, [actionRefs.resizeNodeRef, resizeNode])

  useEffect(() => {
    actionRefs.updateNoteTextRef.current = (nodeId, text) => {
      updateNoteText(nodeId, text)
    }
  }, [actionRefs.updateNoteTextRef, updateNoteText])

  useEffect(() => {
    actionRefs.updateNodeScrollbackRef.current = (nodeId, scrollback) => {
      updateNodeScrollback(nodeId, scrollback)
    }
  }, [actionRefs.updateNodeScrollbackRef, updateNodeScrollback])

  useEffect(() => {
    actionRefs.updateTerminalTitleRef.current = (nodeId, title) => {
      updateTerminalTitle(nodeId, title)
    }
  }, [actionRefs.updateTerminalTitleRef, updateTerminalTitle])

  useEffect(() => {
    actionRefs.renameTerminalTitleRef.current = (nodeId, title) => {
      renameTerminalTitle(nodeId, title)
    }
  }, [actionRefs.renameTerminalTitleRef, renameTerminalTitle])

  useEffect(() => {
    actionRefs.normalizeViewportForTerminalInteractionRef.current = (nodeId: string) => {
      if (!normalizeZoomOnTerminalClick) {
        return
      }

      const targetNode = nodesRef.current.find(node => node.id === nodeId)
      if (!targetNode || targetNode.data.kind === 'task' || targetNode.data.kind === 'note') {
        return
      }

      reactFlow.setCenter(
        targetNode.position.x + targetNode.data.width / 2,
        targetNode.position.y + targetNode.data.height / 2,
        {
          duration: 120,
          zoom: 1,
        },
      )
    }
  }, [
    actionRefs.normalizeViewportForTerminalInteractionRef,
    nodesRef,
    normalizeZoomOnTerminalClick,
    reactFlow,
  ])
}
