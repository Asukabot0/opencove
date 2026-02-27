import React from 'react'
import type { ContextMenuState } from '../types'

interface WorkspaceContextMenuProps {
  contextMenu: ContextMenuState | null
  closeContextMenu: () => void
  createTerminalNode: () => Promise<void>
  openTaskCreator: () => void
  openAgentLauncher: () => void
  createSpaceFromSelectedNodes: () => void
  clearNodeSelection: () => void
}

export function WorkspaceContextMenu({
  contextMenu,
  closeContextMenu,
  createTerminalNode,
  openTaskCreator,
  openAgentLauncher,
  createSpaceFromSelectedNodes,
  clearNodeSelection,
}: WorkspaceContextMenuProps): React.JSX.Element | null {
  if (!contextMenu) {
    return null
  }

  return (
    <div
      className="workspace-context-menu"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={event => {
        event.stopPropagation()
      }}
    >
      {contextMenu.kind === 'pane' ? (
        <>
          <button
            type="button"
            data-testid="workspace-context-new-terminal"
            onClick={() => {
              void createTerminalNode()
            }}
          >
            New Terminal
          </button>
          <button
            type="button"
            data-testid="workspace-context-new-task"
            onClick={() => {
              openTaskCreator()
            }}
          >
            New Task
          </button>
          <button
            type="button"
            data-testid="workspace-context-run-default-agent"
            onClick={() => {
              openAgentLauncher()
            }}
          >
            Run Agent
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            data-testid="workspace-selection-create-space"
            onClick={() => {
              createSpaceFromSelectedNodes()
            }}
          >
            Create Space with Selected
          </button>
          <button
            type="button"
            data-testid="workspace-selection-clear"
            onClick={() => {
              clearNodeSelection()
              closeContextMenu()
            }}
          >
            Clear Selection
          </button>
        </>
      )}
    </div>
  )
}
