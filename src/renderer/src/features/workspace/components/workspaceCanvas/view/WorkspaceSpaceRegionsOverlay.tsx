import React from 'react'
import { ViewportPortal } from '@xyflow/react'
import type { WorkspaceSpaceRect } from '../../../types'
import type { SpaceVisual } from '../types'

interface WorkspaceSpaceRegionsOverlayProps {
  workspacePath: string
  spaceVisuals: SpaceVisual[]
  spaceFramePreview: { spaceId: string; rect: WorkspaceSpaceRect } | null
  handleSpaceDragHandlePointerDown: (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
    spaceId: string,
  ) => void
  editingSpaceId: string | null
  spaceRenameInputRef: React.RefObject<HTMLInputElement>
  spaceRenameDraft: string
  setSpaceRenameDraft: React.Dispatch<React.SetStateAction<string>>
  commitSpaceRename: (spaceId: string) => void
  cancelSpaceRename: () => void
  startSpaceRename: (spaceId: string) => void
  onOpenSpaceMenu?: (spaceId: string) => void
}

export function WorkspaceSpaceRegionsOverlay({
  workspacePath,
  spaceVisuals,
  spaceFramePreview,
  handleSpaceDragHandlePointerDown,
  editingSpaceId,
  spaceRenameInputRef,
  spaceRenameDraft,
  setSpaceRenameDraft,
  commitSpaceRename,
  cancelSpaceRename,
  startSpaceRename,
  onOpenSpaceMenu,
}: WorkspaceSpaceRegionsOverlayProps): React.JSX.Element {
  const worktreeLabelByDirectory = React.useMemo(() => {
    const unique = [...new Set(spaceVisuals.map(space => space.directoryPath.trim()))].filter(
      path => path.length > 0 && path !== workspacePath,
    )

    unique.sort((left, right) => left.localeCompare(right))

    const labels = new Map<string, string>()
    unique.forEach((path, index) => {
      labels.set(path, `WT${index + 1}`)
    })

    return labels
  }, [spaceVisuals, workspacePath])

  return (
    <ViewportPortal>
      {spaceVisuals.map(space => {
        const normalizedDirectoryPath = space.directoryPath.trim()
        const hasWorktreeDirectory =
          normalizedDirectoryPath.length > 0 && normalizedDirectoryPath !== workspacePath
        const resolvedRect =
          spaceFramePreview?.spaceId === space.id ? spaceFramePreview.rect : space.rect

        return (
          <div
            key={space.id}
            className="workspace-space-region"
            style={{
              transform: `translate(${resolvedRect.x}px, ${resolvedRect.y}px)`,
              width: resolvedRect.width,
              height: resolvedRect.height,
            }}
          >
            <div
              className="workspace-space-region__drag-handle workspace-space-region__drag-handle--top"
              data-testid={`workspace-space-drag-${space.id}-top`}
              onPointerDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
              onMouseDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
            />
            <div
              className="workspace-space-region__drag-handle workspace-space-region__drag-handle--right"
              data-testid={`workspace-space-drag-${space.id}-right`}
              onPointerDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
              onMouseDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
            />
            <div
              className="workspace-space-region__drag-handle workspace-space-region__drag-handle--bottom"
              data-testid={`workspace-space-drag-${space.id}-bottom`}
              onPointerDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
              onMouseDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
            />
            <div
              className="workspace-space-region__drag-handle workspace-space-region__drag-handle--left"
              data-testid={`workspace-space-drag-${space.id}-left`}
              onPointerDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
              onMouseDown={event => {
                handleSpaceDragHandlePointerDown(event, space.id)
              }}
            />
            {editingSpaceId === space.id ? (
              <input
                ref={spaceRenameInputRef}
                className="workspace-space-region__label-input nodrag nowheel"
                data-testid={`workspace-space-label-input-${space.id}`}
                value={spaceRenameDraft}
                onPointerDown={event => {
                  event.stopPropagation()
                }}
                onClick={event => {
                  event.stopPropagation()
                }}
                onChange={event => {
                  setSpaceRenameDraft(event.target.value)
                }}
                onBlur={() => {
                  commitSpaceRename(space.id)
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commitSpaceRename(space.id)
                    return
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelSpaceRename()
                  }
                }}
              />
            ) : (
              <div
                className="workspace-space-region__label-group nodrag nowheel"
                onPointerDown={event => {
                  event.stopPropagation()
                }}
                onClick={event => {
                  event.stopPropagation()
                }}
              >
                <button
                  type="button"
                  className="workspace-space-region__label"
                  data-testid={`workspace-space-label-${space.id}`}
                  onClick={event => {
                    event.stopPropagation()
                    startSpaceRename(space.id)
                  }}
                >
                  {space.name}
                </button>

                {hasWorktreeDirectory ? (
                  <span
                    className="workspace-space-region__worktree-badge"
                    title={normalizedDirectoryPath}
                  >
                    {worktreeLabelByDirectory.get(normalizedDirectoryPath) ?? 'WT'}
                  </span>
                ) : null}

                <button
                  type="button"
                  className="workspace-space-region__menu"
                  data-testid={`workspace-space-menu-${space.id}`}
                  aria-label={`Open ${space.name} worktree menu`}
                  title="Worktree"
                  onClick={event => {
                    event.stopPropagation()
                    onOpenSpaceMenu?.(space.id)
                  }}
                >
                  ...
                </button>
              </div>
            )}
          </div>
        )
      })}
    </ViewportPortal>
  )
}
