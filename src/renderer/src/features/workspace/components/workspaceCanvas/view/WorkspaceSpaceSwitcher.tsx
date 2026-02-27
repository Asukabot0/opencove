import React from 'react'
import type { WorkspaceSpaceState } from '../../../types'

interface WorkspaceSpaceSwitcherProps {
  spaces: WorkspaceSpaceState[]
  focusSpaceInViewport: (spaceId: string) => void
  focusAllInViewport: () => void
  cancelSpaceRename: () => void
}

export function WorkspaceSpaceSwitcher({
  spaces,
  focusSpaceInViewport,
  focusAllInViewport,
  cancelSpaceRename,
}: WorkspaceSpaceSwitcherProps): React.JSX.Element | null {
  if (spaces.length === 0) {
    return null
  }

  return (
    <div
      className="workspace-space-switcher"
      onClick={event => {
        event.stopPropagation()
      }}
    >
      <button
        type="button"
        className="workspace-space-switcher__item"
        data-testid="workspace-space-switch-all"
        onClick={() => {
          focusAllInViewport()
          cancelSpaceRename()
        }}
      >
        All
      </button>
      {spaces.map(space => (
        <button
          type="button"
          key={space.id}
          className="workspace-space-switcher__item"
          data-testid={`workspace-space-switch-${space.id}`}
          onClick={() => {
            focusSpaceInViewport(space.id)
            cancelSpaceRename()
          }}
        >
          <span className="workspace-space-switcher__item-label">{space.name}</span>
        </button>
      ))}
    </div>
  )
}
