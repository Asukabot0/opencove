import React, { useMemo } from 'react'

function resolveWorktreesRoot(workspacePath: string, worktreesRoot: string): string {
  const trimmed = worktreesRoot.trim()
  if (trimmed.length === 0) {
    return `${workspacePath.replace(/[/]+$/, '')}/.cove/worktrees`
  }
  if (/^([a-zA-Z]:[/]|\/)/.test(trimmed)) {
    return trimmed.replace(/[/]+$/, '')
  }
  const base = workspacePath.replace(/[/]+$/, '')
  const normalizedCustom = trimmed
    .replace(/^[.][/]+/, '')
    .replace(/^[/]+/, '')
    .replace(/[/]+$/, '')
  return `${base}/${normalizedCustom}`
}

function getFolderName(path: string): string {
  const parts = path.split(/[/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function WorkspaceSection({
  workspaceName,
  workspacePath,
  worktreesRoot,
  onChangeWorktreesRoot,
  sectionId = 'settings-section-workspace',
}: {
  workspaceName?: string | null
  workspacePath: string | null
  worktreesRoot: string
  onChangeWorktreesRoot: (worktreesRoot: string) => void
  sectionId?: string
}): React.JSX.Element {
  const hasWorkspace = typeof workspacePath === 'string' && workspacePath.trim().length > 0
  const resolvedWorkspaceName = useMemo(() => {
    if (typeof workspaceName === 'string' && workspaceName.trim().length > 0) {
      return workspaceName
    }

    if (!hasWorkspace) {
      return ''
    }

    return getFolderName(workspacePath)
  }, [hasWorkspace, workspaceName, workspacePath])

  const resolvedRoot = useMemo(() => {
    if (!hasWorkspace) {
      return ''
    }

    return resolveWorktreesRoot(workspacePath, worktreesRoot)
  }, [hasWorkspace, workspacePath, worktreesRoot])

  return (
    <div className="settings-panel__section" id={sectionId}>
      <h3 className="settings-panel__section-title">Workspace Worktree</h3>

      {!hasWorkspace ? (
        <div className="settings-panel__row">
          <div className="settings-panel__row-label">
            <strong>Select a project first</strong>
            <span>Choose a project in the sidebar to configure its worktree root.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="settings-panel__row">
            <div className="settings-panel__row-label">
              <strong>Project</strong>
              <span>Current project selected for worktree configuration.</span>
            </div>
            <div className="settings-panel__control">
              <span
                style={{
                  fontSize: '12px',
                  color: '#666',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                }}
              >
                {resolvedWorkspaceName}
              </span>
            </div>
          </div>

          <div className="settings-panel__row">
            <div className="settings-panel__row-label">
              <strong>Project Path</strong>
              <span>Full filesystem path to the project root.</span>
            </div>
            <div className="settings-panel__control">
              <span
                style={{
                  fontSize: '12px',
                  color: '#666',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                }}
              >
                {workspacePath}
              </span>
            </div>
          </div>

          <div className="settings-panel__row">
            <div className="settings-panel__row-label">
              <strong>Worktree Root</strong>
              <span>Relative path is based on project root.</span>
            </div>
            <div
              className="settings-panel__control"
              style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}
            >
              <input
                data-testid="settings-worktree-root"
                value={worktreesRoot}
                placeholder=".cove/worktrees"
                onChange={event => onChangeWorktreesRoot(event.target.value)}
              />
              <button
                type="button"
                className="secondary"
                disabled={worktreesRoot.trim().length === 0}
                onClick={() => onChangeWorktreesRoot('')}
              >
                Reset to Default
              </button>
            </div>
          </div>

          <div className="settings-panel__row">
            <div className="settings-panel__row-label">
              <strong>Resolved Path</strong>
              <span>The actual path where worktrees will be created.</span>
            </div>
            <div className="settings-panel__control">
              <span
                style={{
                  fontSize: '12px',
                  color: '#888',
                  wordBreak: 'break-all',
                  textAlign: 'right',
                }}
              >
                {resolvedRoot}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
