import { useMemo, type MutableRefObject, type ReactElement } from 'react'
import type { Node } from '@xyflow/react'
import { NoteNode } from '../NoteNode'
import { TaskNode } from '../TaskNode'
import { TerminalNode } from '../TerminalNode'
import type { Size, TerminalNodeData, WorkspaceSpaceState } from '../../types'
import { useScrollbackStore } from '../../store/useScrollbackStore'
import type {
  QuickUpdateTaskRequirement,
  QuickUpdateTaskTitle,
  UpdateNodeScrollback,
  UpdateTaskStatus,
} from './types'

function TerminalNodeType({
  data,
  id,
  terminalFontSize,
  selectNode,
  closeNodeRef,
  resizeNodeRef,
  updateNodeScrollbackRef,
  normalizeViewportForTerminalInteractionRef,
  updateTerminalTitleRef,
  renameTerminalTitleRef,
}: {
  data: TerminalNodeData
  id: string
  terminalFontSize: number
  selectNode: (nodeId: string) => void
  closeNodeRef: MutableRefObject<(nodeId: string) => Promise<void>>
  resizeNodeRef: MutableRefObject<(nodeId: string, desiredSize: Size) => void>
  updateNodeScrollbackRef: MutableRefObject<UpdateNodeScrollback>
  normalizeViewportForTerminalInteractionRef: MutableRefObject<(nodeId: string) => void>
  updateTerminalTitleRef: MutableRefObject<(nodeId: string, title: string) => void>
  renameTerminalTitleRef: MutableRefObject<(nodeId: string, title: string) => void>
}): ReactElement {
  const scrollback = useScrollbackStore(state => state.scrollbackByNodeId[id] ?? null)

  return (
    <TerminalNode
      sessionId={data.sessionId}
      title={data.title}
      kind={data.kind}
      status={data.status}
      directoryMismatch={
        data.kind === 'agent' &&
        data.agent?.expectedDirectory &&
        data.agent.expectedDirectory !== data.agent.executionDirectory
          ? {
              executionDirectory: data.agent.executionDirectory,
              expectedDirectory: data.agent.expectedDirectory,
            }
          : data.kind === 'terminal' &&
              data.executionDirectory &&
              data.expectedDirectory &&
              data.expectedDirectory !== data.executionDirectory
            ? {
                executionDirectory: data.executionDirectory,
                expectedDirectory: data.expectedDirectory,
              }
            : null
      }
      lastError={data.lastError}
      width={data.width}
      height={data.height}
      terminalFontSize={terminalFontSize}
      scrollback={scrollback}
      onClose={() => {
        void closeNodeRef.current(id)
      }}
      onResize={size => resizeNodeRef.current(id, size)}
      onScrollbackChange={nextScrollback => updateNodeScrollbackRef.current(id, nextScrollback)}
      onCommandRun={
        data.kind === 'terminal'
          ? command => {
              updateTerminalTitleRef.current(id, command)
            }
          : undefined
      }
      onTitleCommit={
        data.kind === 'terminal'
          ? nextTitle => {
              renameTerminalTitleRef.current(id, nextTitle)
            }
          : undefined
      }
      onInteractionStart={() => {
        selectNode(id)
        normalizeViewportForTerminalInteractionRef.current(id)
      }}
    />
  )
}

function NoteNodeType({
  data,
  id,
  selectNode,
  closeNodeRef,
  resizeNodeRef,
  updateNoteTextRef,
}: {
  data: TerminalNodeData
  id: string
  selectNode: (nodeId: string) => void
  closeNodeRef: MutableRefObject<(nodeId: string) => Promise<void>>
  resizeNodeRef: MutableRefObject<(nodeId: string, desiredSize: Size) => void>
  updateNoteTextRef: MutableRefObject<(nodeId: string, text: string) => void>
}): ReactElement | null {
  if (!data.note) {
    return null
  }

  return (
    <NoteNode
      text={data.note.text}
      width={data.width}
      height={data.height}
      onClose={() => {
        void closeNodeRef.current(id)
      }}
      onResize={size => resizeNodeRef.current(id, size)}
      onTextChange={text => {
        updateNoteTextRef.current(id, text)
      }}
      onInteractionStart={() => {
        selectNode(id)
      }}
    />
  )
}

interface WorkspaceCanvasNodeTypesParams {
  nodesRef: MutableRefObject<Node<TerminalNodeData>[]>
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  workspacePath: string
  terminalFontSize: number
  selectNode: (nodeId: string) => void
  closeNodeRef: MutableRefObject<(nodeId: string) => Promise<void>>
  resizeNodeRef: MutableRefObject<(nodeId: string, desiredSize: Size) => void>
  updateNoteTextRef: MutableRefObject<(nodeId: string, text: string) => void>
  updateNodeScrollbackRef: MutableRefObject<UpdateNodeScrollback>
  normalizeViewportForTerminalInteractionRef: MutableRefObject<(nodeId: string) => void>
  requestTaskDeleteRef: MutableRefObject<(nodeId: string) => void>
  openTaskEditorRef: MutableRefObject<(nodeId: string) => void>
  quickUpdateTaskTitleRef: MutableRefObject<QuickUpdateTaskTitle>
  quickUpdateTaskRequirementRef: MutableRefObject<QuickUpdateTaskRequirement>
  openTaskAssignerRef: MutableRefObject<(nodeId: string) => void>
  runTaskAgentRef: MutableRefObject<(nodeId: string) => Promise<void>>
  resumeTaskAgentSessionRef: MutableRefObject<
    (taskNodeId: string, recordId: string) => Promise<void>
  >
  removeTaskAgentSessionRecordRef: MutableRefObject<(taskNodeId: string, recordId: string) => void>
  updateTaskStatusRef: MutableRefObject<UpdateTaskStatus>
  updateTerminalTitleRef: MutableRefObject<(nodeId: string, title: string) => void>
  renameTerminalTitleRef: MutableRefObject<(nodeId: string, title: string) => void>
}

export function useWorkspaceCanvasNodeTypes({
  nodesRef,
  spacesRef,
  workspacePath,
  terminalFontSize,
  selectNode,
  closeNodeRef,
  resizeNodeRef,
  updateNoteTextRef,
  updateNodeScrollbackRef,
  normalizeViewportForTerminalInteractionRef,
  requestTaskDeleteRef,
  openTaskEditorRef,
  quickUpdateTaskTitleRef,
  quickUpdateTaskRequirementRef,
  openTaskAssignerRef,
  runTaskAgentRef,
  resumeTaskAgentSessionRef,
  removeTaskAgentSessionRecordRef,
  updateTaskStatusRef,
  updateTerminalTitleRef,
  renameTerminalTitleRef,
}: WorkspaceCanvasNodeTypesParams): Record<
  string,
  (props: { data: TerminalNodeData; id: string }) => ReactElement | null
> {
  return useMemo(
    () => ({
      terminalNode: ({ data, id }: { data: TerminalNodeData; id: string }) => {
        return (
          <TerminalNodeType
            data={data}
            id={id}
            terminalFontSize={terminalFontSize}
            selectNode={selectNode}
            closeNodeRef={closeNodeRef}
            resizeNodeRef={resizeNodeRef}
            updateNodeScrollbackRef={updateNodeScrollbackRef}
            normalizeViewportForTerminalInteractionRef={normalizeViewportForTerminalInteractionRef}
            updateTerminalTitleRef={updateTerminalTitleRef}
            renameTerminalTitleRef={renameTerminalTitleRef}
          />
        )
      },
      noteNode: ({ data, id }: { data: TerminalNodeData; id: string }) => {
        return (
          <NoteNodeType
            data={data}
            id={id}
            selectNode={selectNode}
            closeNodeRef={closeNodeRef}
            resizeNodeRef={resizeNodeRef}
            updateNoteTextRef={updateNoteTextRef}
          />
        )
      },
      taskNode: ({ data, id }: { data: TerminalNodeData; id: string }) => {
        if (!data.task) {
          return null
        }

        const taskSpace = spacesRef.current.find(space => space.nodeIds.includes(id)) ?? null
        const currentDirectory =
          taskSpace && taskSpace.directoryPath.trim().length > 0
            ? taskSpace.directoryPath
            : workspacePath

        const linkedAgentTitle = data.task.linkedAgentNodeId
          ? (nodesRef.current.find(
              node => node.id === data.task?.linkedAgentNodeId && node.data.kind === 'agent',
            )?.data.title ?? null)
          : null
        const linkedAgentNode = data.task.linkedAgentNodeId
          ? (nodesRef.current.find(
              node => node.id === data.task?.linkedAgentNodeId && node.data.kind === 'agent',
            ) ?? null)
          : null
        const linkedAgentSummary =
          linkedAgentNode && linkedAgentNode.data.kind === 'agent' && linkedAgentNode.data.agent
            ? {
                nodeId: linkedAgentNode.id,
                title: linkedAgentNode.data.title,
                provider: linkedAgentNode.data.agent.provider,
                status: linkedAgentNode.data.status,
                startedAt: linkedAgentNode.data.startedAt,
              }
            : null

        return (
          <TaskNode
            title={data.title}
            requirement={data.task.requirement}
            status={data.task.status}
            priority={data.task.priority}
            tags={data.task.tags}
            isEnriching={data.task.isEnriching === true}
            linkedAgentTitle={linkedAgentTitle}
            linkedAgentNode={linkedAgentSummary}
            agentSessions={data.task.agentSessions ?? []}
            currentDirectory={currentDirectory}
            width={data.width}
            height={data.height}
            onClose={() => {
              requestTaskDeleteRef.current(id)
            }}
            onOpenEditor={() => {
              openTaskEditorRef.current(id)
            }}
            onQuickTitleSave={title => {
              quickUpdateTaskTitleRef.current(id, title)
            }}
            onQuickRequirementSave={requirement => {
              quickUpdateTaskRequirementRef.current(id, requirement)
            }}
            onAssignAgent={() => {
              openTaskAssignerRef.current(id)
            }}
            onRunAgent={() => {
              void runTaskAgentRef.current(id)
            }}
            onResize={size => resizeNodeRef.current(id, size)}
            onStatusChange={status => {
              updateTaskStatusRef.current(id, status)
            }}
            onResumeAgentSession={recordId => {
              void resumeTaskAgentSessionRef.current(id, recordId)
            }}
            onRemoveAgentSessionRecord={recordId => {
              removeTaskAgentSessionRecordRef.current(id, recordId)
            }}
            onInteractionStart={() => {
              selectNode(id)
            }}
          />
        )
      },
    }),
    [
      closeNodeRef,
      normalizeViewportForTerminalInteractionRef,
      nodesRef,
      selectNode,
      spacesRef,
      workspacePath,
      terminalFontSize,
      updateNoteTextRef,
      openTaskAssignerRef,
      openTaskEditorRef,
      quickUpdateTaskRequirementRef,
      quickUpdateTaskTitleRef,
      requestTaskDeleteRef,
      resizeNodeRef,
      runTaskAgentRef,
      resumeTaskAgentSessionRef,
      removeTaskAgentSessionRecordRef,
      updateNodeScrollbackRef,
      updateTaskStatusRef,
      updateTerminalTitleRef,
      renameTerminalTitleRef,
    ],
  )
}
