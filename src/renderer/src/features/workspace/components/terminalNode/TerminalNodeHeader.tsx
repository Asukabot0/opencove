import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AgentRuntimeStatus, WorkspaceNodeKind } from '../../types'
import { getStatusClassName, getStatusLabel } from './status'

interface TerminalNodeHeaderProps {
  title: string
  kind: WorkspaceNodeKind
  status: AgentRuntimeStatus | null
  directoryMismatch?: { executionDirectory: string; expectedDirectory: string } | null
  onTitleCommit?: (title: string) => void
  onClose: () => void
}

export function TerminalNodeHeader({
  title,
  kind,
  status,
  directoryMismatch,
  onTitleCommit,
  onClose,
}: TerminalNodeHeaderProps): JSX.Element {
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)

  const isTitleEditable = kind === 'terminal' && typeof onTitleCommit === 'function'
  const isAgentNode = kind === 'agent'

  useEffect(() => {
    if (isTitleEditing) {
      return
    }

    setTitleDraft(title)
  }, [isTitleEditing, title])

  const commitTitleEdit = useCallback(() => {
    if (!isTitleEditable) {
      return
    }

    const normalizedTitle = titleDraft.trim()
    if (normalizedTitle.length === 0) {
      setTitleDraft(title)
      return
    }

    if (normalizedTitle !== title) {
      onTitleCommit(normalizedTitle)
    }
  }, [isTitleEditable, onTitleCommit, title, titleDraft])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(title)
  }, [title])

  return (
    <div className="terminal-node__header" data-node-drag-handle="true">
      {isTitleEditable ? (
        <input
          className="terminal-node__title terminal-node__title-input nodrag nowheel"
          data-testid="terminal-node-inline-title-input"
          value={titleDraft}
          onFocus={() => {
            setIsTitleEditing(true)
          }}
          onPointerDown={event => {
            event.stopPropagation()
          }}
          onChange={event => {
            setTitleDraft(event.target.value)
          }}
          onBlur={() => {
            commitTitleEdit()
            setIsTitleEditing(false)
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelTitleEdit()
              event.currentTarget.blur()
              return
            }

            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        />
      ) : (
        <span className="terminal-node__title">{title}</span>
      )}

      {directoryMismatch || isAgentNode ? (
        <div className="terminal-node__header-badges nodrag">
          {directoryMismatch ? (
            <span
              className="terminal-node__badge terminal-node__badge--warning"
              title={`Bound directory: ${directoryMismatch.executionDirectory}\nCurrent directory: ${directoryMismatch.expectedDirectory}`}
            >
              DIR MISMATCH
            </span>
          ) : null}
          {isAgentNode ? (
            <span className={`terminal-node__status ${getStatusClassName(status)}`}>
              {getStatusLabel(status)}
            </span>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className="terminal-node__close nodrag"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
    </div>
  )
}
