import { Handle, Position } from '@xyflow/react'
import { Pencil } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, PointerEvent as ReactPointerEvent } from 'react'
import type {
  AgentRuntimeStatus,
  Size,
  TaskAgentSessionRecord,
  TaskPriority,
  TaskRuntimeStatus,
} from '../types'
import type { AgentProvider } from '../../settings/agentConfig'
import { TaskNodeAgentSessions } from './taskNode/TaskNodeAgentSessions'
import { TaskNodeFooter } from './taskNode/TaskNodeFooter'
import {
  formatTaskTimestamp,
  MIN_HEIGHT,
  MIN_WIDTH,
  shouldStopWheelPropagation,
  TASK_PRIORITY_LABEL,
} from './taskNode/helpers'

interface TaskNodeProps {
  title: string
  requirement: string
  status: TaskRuntimeStatus
  priority: TaskPriority
  tags: string[]
  createdAt: string | null
  updatedAt: string | null
  linkedAgentTitle: string | null
  linkedAgentNode: {
    nodeId: string
    title: string
    provider: AgentProvider
    status: AgentRuntimeStatus | null
    startedAt: string | null
  } | null
  agentSessions: TaskAgentSessionRecord[]
  currentDirectory: string
  width: number
  height: number
  onClose: () => void
  onOpenEditor: () => void
  onQuickTitleSave: (title: string) => void
  onQuickRequirementSave: (requirement: string) => void
  onAssignAgent: () => void
  onRunAgent: () => void
  onResize: (size: Size) => void
  onStatusChange: (status: TaskRuntimeStatus) => void
  onResumeAgentSession: (recordId: string) => void
  onRemoveAgentSessionRecord: (recordId: string) => void
}

type ResizeAxis = 'horizontal' | 'vertical'

export function TaskNode({
  title,
  requirement,
  status,
  priority,
  tags,
  createdAt,
  updatedAt,
  linkedAgentTitle,
  linkedAgentNode,
  agentSessions,
  currentDirectory,
  width,
  height,
  onClose,
  onOpenEditor,
  onQuickTitleSave,
  onQuickRequirementSave,
  onAssignAgent,
  onRunAgent,
  onResize,
  onStatusChange,
  onResumeAgentSession,
  onRemoveAgentSessionRecord,
}: TaskNodeProps): JSX.Element {
  const resizeStartRef = useRef<{
    x: number
    y: number
    width: number
    height: number
    axis: ResizeAxis
  } | null>(null)
  const draftSizeRef = useRef<Size | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [draftSize, setDraftSize] = useState<Size | null>(null)

  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const [isRequirementEditing, setIsRequirementEditing] = useState(false)
  const [requirementDraft, setRequirementDraft] = useState(requirement)

  useEffect(() => {
    draftSizeRef.current = draftSize
  }, [draftSize])

  useEffect(() => {
    if (!draftSize || isResizing) {
      return
    }

    if (draftSize.width === width && draftSize.height === height) {
      setDraftSize(null)
    }
  }, [draftSize, height, isResizing, width])

  useEffect(() => {
    if (isTitleEditing) {
      return
    }

    setTitleDraft(title)
  }, [isTitleEditing, title])

  useEffect(() => {
    if (isRequirementEditing) {
      return
    }

    setRequirementDraft(requirement)
  }, [isRequirementEditing, requirement])

  const resolvedLinkedAgentTitle = linkedAgentTitle ?? linkedAgentNode?.title ?? null

  const handleResizePointerDown = useCallback(
    (axis: ResizeAxis) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)

      resizeStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        width,
        height,
        axis,
      }

      setDraftSize({ width, height })
      setIsResizing(true)
    },
    [height, width],
  )

  useEffect(() => {
    if (!isResizing) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current
      if (!start) {
        return
      }

      if (start.axis === 'horizontal') {
        const nextWidth = Math.max(MIN_WIDTH, Math.round(start.width + (event.clientX - start.x)))
        setDraftSize({ width: nextWidth, height: start.height })
        return
      }

      const nextHeight = Math.max(MIN_HEIGHT, Math.round(start.height + (event.clientY - start.y)))
      setDraftSize({ width: start.width, height: nextHeight })
    }

    const handlePointerUp = () => {
      setIsResizing(false)

      const finalSize = draftSizeRef.current ?? { width, height }
      onResize(finalSize)

      resizeStartRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [height, isResizing, onResize, width])

  const commitTitleEdit = useCallback(() => {
    const normalized = titleDraft.trim()
    if (normalized.length === 0) {
      setTitleDraft(title)
      setIsTitleEditing(false)
      return
    }

    if (normalized !== title) {
      onQuickTitleSave(normalized)
    }

    setIsTitleEditing(false)
  }, [onQuickTitleSave, title, titleDraft])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(title)
    setIsTitleEditing(false)
  }, [title])

  const commitRequirementEdit = useCallback(() => {
    const normalized = requirementDraft.trim()
    if (normalized.length === 0) {
      setRequirementDraft(requirement)
      setIsRequirementEditing(false)
      return
    }

    if (normalized !== requirement) {
      onQuickRequirementSave(normalized)
    }

    setIsRequirementEditing(false)
  }, [onQuickRequirementSave, requirement, requirementDraft])

  const cancelRequirementEdit = useCallback(() => {
    setRequirementDraft(requirement)
    setIsRequirementEditing(false)
  }, [requirement])

  const renderedSize = draftSize ?? { width, height }
  const style = useMemo(
    () => ({ width: renderedSize.width, height: renderedSize.height }),
    [renderedSize.height, renderedSize.width],
  )

  return (
    <div
      className="task-node nowheel"
      style={style}
      onWheel={event => {
        if (shouldStopWheelPropagation(event.currentTarget)) {
          event.stopPropagation()
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="workspace-node-handle" />
      <Handle type="source" position={Position.Right} className="workspace-node-handle" />

      <div className="task-node__header" data-node-drag-handle="true">
        <div className="task-node__header-main">
          {isTitleEditing ? (
            <input
              className="task-node__title-input nodrag nowheel"
              data-testid="task-node-inline-title-input"
              value={titleDraft}
              autoFocus
              onPointerDown={event => {
                event.stopPropagation()
              }}
              onChange={event => {
                setTitleDraft(event.target.value)
              }}
              onBlur={() => {
                commitTitleEdit()
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelTitleEdit()
                  return
                }

                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitTitleEdit()
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="task-node__title task-node__title-button"
              data-testid="task-node-inline-title-trigger"
              onClick={event => {
                event.stopPropagation()
                setTitleDraft(title)
                setIsTitleEditing(true)
              }}
            >
              {title}
            </button>
          )}

          <span className="task-node__timestamps" data-testid="task-node-timestamps">
            <span>Created {formatTaskTimestamp(createdAt)}</span>
            <span>Updated {formatTaskTimestamp(updatedAt)}</span>
          </span>
        </div>

        <div className="task-node__header-actions nodrag">
          <button
            type="button"
            className="task-node__icon-button task-node__icon-button--edit nodrag"
            data-testid="task-node-open-editor"
            onClick={event => {
              event.stopPropagation()
              onOpenEditor()
            }}
            aria-label="Open full task editor"
            title="Open full task editor"
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>

          <button
            type="button"
            className="task-node__icon-button task-node__icon-button--close nodrag"
            data-testid="task-node-close"
            onClick={event => {
              event.stopPropagation()
              onClose()
            }}
            aria-label="Delete task"
            title="Delete task"
          >
            ×
          </button>
        </div>
      </div>

      <div className="task-node__meta" data-testid="task-node-meta">
        <span className={`task-node__priority task-node__priority--${priority}`}>
          {TASK_PRIORITY_LABEL[priority]}
        </span>

        <span className="task-node__tags" data-testid="task-node-tags">
          {tags.length > 0 ? (
            tags.map(tag => (
              <span key={tag} className="task-node__tag">
                #{tag}
              </span>
            ))
          ) : (
            <span className="task-node__tag task-node__tag--empty">No tags</span>
          )}
        </span>

        <span className="task-node__linked-agent" data-testid="task-node-linked-agent">
          {resolvedLinkedAgentTitle ? `Agent · ${resolvedLinkedAgentTitle}` : 'Agent · Unassigned'}
        </span>
      </div>

      <div className="task-node__content">
        <label>Task Requirement</label>
        {isRequirementEditing ? (
          <div className="task-node__inline-editor">
            <textarea
              className="task-node__requirement-input nodrag nowheel"
              data-testid="task-node-inline-requirement-input"
              value={requirementDraft}
              autoFocus
              onPointerDown={event => {
                event.stopPropagation()
              }}
              onChange={event => {
                setRequirementDraft(event.target.value)
              }}
              onBlur={() => {
                commitRequirementEdit()
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRequirementEdit()
                  return
                }

                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  commitRequirementEdit()
                }
              }}
            />
            <span className="task-node__inline-hint">Ctrl/Cmd+Enter to save · Esc to cancel</span>
          </div>
        ) : (
          <p
            className="task-node__requirement-text"
            data-testid="task-node-inline-requirement-trigger"
            onClick={event => {
              event.stopPropagation()
              setRequirementDraft(requirement)
              setIsRequirementEditing(true)
            }}
          >
            {requirement}
          </p>
        )}
      </div>

      <TaskNodeAgentSessions
        linkedAgentNode={linkedAgentNode}
        agentSessions={agentSessions}
        currentDirectory={currentDirectory}
        onResumeAgentSession={onResumeAgentSession}
        onRemoveAgentSessionRecord={onRemoveAgentSessionRecord}
      />

      <TaskNodeFooter
        status={status}
        onStatusChange={onStatusChange}
        onAssignAgent={onAssignAgent}
        onRunAgent={onRunAgent}
      />

      <button
        type="button"
        className="task-node__resizer task-node__resizer--right nodrag"
        onPointerDown={handleResizePointerDown('horizontal')}
        aria-label="Resize task width"
        data-testid="task-resizer-right"
      />
      <button
        type="button"
        className="task-node__resizer task-node__resizer--bottom nodrag"
        onPointerDown={handleResizePointerDown('vertical')}
        aria-label="Resize task height"
        data-testid="task-resizer-bottom"
      />
    </div>
  )
}
