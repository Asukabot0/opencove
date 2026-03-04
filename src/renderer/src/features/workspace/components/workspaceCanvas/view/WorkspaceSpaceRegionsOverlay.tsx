import React from 'react'
import { ViewportPortal } from '@xyflow/react'
import type { GitWorktreeInfo } from '@shared/types/api'
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
  const normalizedWorkspacePath = React.useMemo(
    () => normalizeComparablePath(workspacePath),
    [workspacePath],
  )

  const worktreeDirectories = React.useMemo(() => {
    const unique = new Set<string>()

    spaceVisuals.forEach(space => {
      const directoryPath = normalizeComparablePath(space.directoryPath)
      if (directoryPath.length === 0 || directoryPath === normalizedWorkspacePath) {
        return
      }

      unique.add(directoryPath)
    })

    return [...unique].sort((left, right) => left.localeCompare(right))
  }, [normalizedWorkspacePath, spaceVisuals])

  const worktreeDirectoriesKey = React.useMemo(
    () => worktreeDirectories.join('|'),
    [worktreeDirectories],
  )

  const [worktreeInfoByPath, setWorktreeInfoByPath] = React.useState<Map<string, GitWorktreeInfo>>(
    () => new Map(),
  )

  React.useEffect(() => {
    if (worktreeDirectories.length === 0) {
      setWorktreeInfoByPath(new Map())
      return
    }

    const listWorktrees = window.coveApi?.worktree?.listWorktrees
    if (typeof listWorktrees !== 'function') {
      setWorktreeInfoByPath(new Map())
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const result = await listWorktrees({ repoPath: workspacePath })
        if (cancelled) {
          return
        }

        const nextMap = new Map<string, GitWorktreeInfo>()
        result.worktrees.forEach(entry => {
          nextMap.set(normalizeComparablePath(entry.path), entry)
        })

        setWorktreeInfoByPath(nextMap)
      } catch {
        if (cancelled) {
          return
        }

        setWorktreeInfoByPath(new Map())
      }
    })()

    return () => {
      cancelled = true
    }
  }, [worktreeDirectories.length, worktreeDirectoriesKey, workspacePath])

  return (
    <ViewportPortal>
      {spaceVisuals.map(space => {
        const normalizedDirectoryPath = normalizeComparablePath(space.directoryPath)
        const hasWorktreeDirectory =
          normalizedDirectoryPath.length > 0 && normalizedDirectoryPath !== normalizedWorkspacePath
        const resolvedRect =
          spaceFramePreview?.spaceId === space.id ? spaceFramePreview.rect : space.rect
        const resolvedWorktreeInfo = hasWorktreeDirectory
          ? (worktreeInfoByPath.get(normalizedDirectoryPath) ?? null)
          : null
        const resolvedWorktreeName = hasWorktreeDirectory
          ? basenameFromPath(resolvedWorktreeInfo?.path ?? normalizedDirectoryPath)
          : null

        const resolvedBranchLabel = resolvedWorktreeInfo
          ? (resolvedWorktreeInfo.branch ??
            (resolvedWorktreeInfo.head
              ? `detached@${toShortSha(resolvedWorktreeInfo.head)}`
              : null))
          : null

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
                  <>
                    <span
                      className="workspace-space-region__worktree-badge"
                      data-testid={`workspace-space-worktree-name-${space.id}`}
                      title={normalizedDirectoryPath}
                    >
                      {resolvedWorktreeName ?? 'Worktree'}
                    </span>
                    {resolvedBranchLabel ? (
                      <span
                        className="workspace-space-region__branch-badge"
                        data-testid={`workspace-space-worktree-branch-${space.id}`}
                        title={
                          resolvedWorktreeInfo?.branch ??
                          resolvedWorktreeInfo?.head ??
                          'Detached HEAD'
                        }
                      >
                        {resolvedBranchLabel}
                      </span>
                    ) : null}
                  </>
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

function normalizeComparablePath(pathValue: string): string {
  return pathValue.trim().replace(/[\\/]+$/, '')
}

function basenameFromPath(pathValue: string): string {
  const normalized = normalizeComparablePath(pathValue)
  if (normalized.length === 0) {
    return ''
  }

  return normalized.split(/[\\/]/).filter(Boolean).at(-1) ?? ''
}

function toShortSha(value: string): string {
  return value.trim().slice(0, 7)
}
