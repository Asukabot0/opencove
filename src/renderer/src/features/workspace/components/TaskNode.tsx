import { useMemo } from 'react'
import type { TaskRuntimeStatus } from '../types'

interface TaskNodeProps {
  title: string
  requirement: string
  status: TaskRuntimeStatus
  width: number
  height: number
  onClose: () => void
  onRunAgent: () => void
  onStatusChange: (status: TaskRuntimeStatus) => void
}

const TASK_STATUS_OPTIONS: Array<{ value: TaskRuntimeStatus; label: string }> = [
  { value: 'todo', label: 'TODO' },
  { value: 'doing', label: 'DOING' },
  { value: 'ai_done', label: 'AI_DONE' },
  { value: 'done', label: 'DONE' },
]

export function TaskNode({
  title,
  requirement,
  status,
  width,
  height,
  onClose,
  onRunAgent,
  onStatusChange,
}: TaskNodeProps): JSX.Element {
  const style = useMemo(() => ({ width, height }), [height, width])

  return (
    <div className="task-node nowheel" style={style}>
      <div className="task-node__header" data-node-drag-handle="true">
        <span className="task-node__title">{title}</span>
        <button
          type="button"
          className="task-node__close nodrag"
          onClick={event => {
            event.stopPropagation()
            onClose()
          }}
        >
          ×
        </button>
      </div>

      <div className="task-node__content">
        <label>Task Requirement</label>
        <p>{requirement}</p>
      </div>

      <div className="task-node__footer nodrag">
        <select
          data-testid="task-node-status-select"
          value={status}
          onChange={event => {
            onStatusChange(event.target.value as TaskRuntimeStatus)
          }}
        >
          {TASK_STATUS_OPTIONS.map(option => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="task-node__run-agent"
          data-testid="task-node-run-agent"
          onClick={event => {
            event.stopPropagation()
            onRunAgent()
          }}
        >
          Run Agent
        </button>
      </div>
    </div>
  )
}
