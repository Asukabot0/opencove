import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSpaceRegionsOverlay } from '../../../src/renderer/src/features/workspace/components/workspaceCanvas/view/WorkspaceSpaceRegionsOverlay'

vi.mock('@xyflow/react', () => {
  return {
    ViewportPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

describe('WorkspaceSpaceRegionsOverlay worktree menu', () => {
  afterEach(() => {
    delete (window as unknown as { coveApi?: unknown }).coveApi
  })

  it('opens the worktree menu via ... pill', () => {
    const onOpenSpaceMenu = vi.fn()

    render(
      <WorkspaceSpaceRegionsOverlay
        workspacePath="/tmp"
        spaceVisuals={[
          {
            id: 'space-1',
            name: 'Infra',
            directoryPath: '/tmp',
            rect: { x: 0, y: 0, width: 200, height: 160 },
            hasExplicitRect: true,
          },
        ]}
        spaceFramePreview={null}
        handleSpaceDragHandlePointerDown={() => undefined}
        editingSpaceId={null}
        spaceRenameInputRef={{ current: null }}
        spaceRenameDraft=""
        setSpaceRenameDraft={() => undefined}
        commitSpaceRename={() => undefined}
        cancelSpaceRename={() => undefined}
        startSpaceRename={() => undefined}
        onOpenSpaceMenu={onOpenSpaceMenu}
      />,
    )

    fireEvent.click(screen.getByTestId('workspace-space-menu-space-1'))
    expect(onOpenSpaceMenu).toHaveBeenCalledWith('space-1')
  })

  it('shows worktree + branch badges when bound to a git worktree', async () => {
    const listWorktrees = vi.fn(async () => {
      return {
        worktrees: [
          {
            path: '/tmp/repo/.cove/worktrees/wt-infra',
            head: '69a0358e3f7d88f1d8af8ff302d8b69bcd1b4d45',
            branch: 'feat/infra-pill',
          },
        ],
      }
    })

    Object.defineProperty(window, 'coveApi', {
      configurable: true,
      writable: true,
      value: {
        meta: { isTest: true },
        worktree: {
          listWorktrees,
        },
      },
    })

    render(
      <WorkspaceSpaceRegionsOverlay
        workspacePath="/tmp/repo"
        spaceVisuals={[
          {
            id: 'space-1',
            name: 'Infra',
            directoryPath: '/tmp/repo/.cove/worktrees/wt-infra',
            rect: { x: 0, y: 0, width: 200, height: 160 },
            hasExplicitRect: true,
          },
        ]}
        spaceFramePreview={null}
        handleSpaceDragHandlePointerDown={() => undefined}
        editingSpaceId={null}
        spaceRenameInputRef={{ current: null }}
        spaceRenameDraft=""
        setSpaceRenameDraft={() => undefined}
        commitSpaceRename={() => undefined}
        cancelSpaceRename={() => undefined}
        startSpaceRename={() => undefined}
      />,
    )

    expect(screen.getByTestId('workspace-space-worktree-name-space-1')).toHaveTextContent(
      'wt-infra',
    )

    await waitFor(() => {
      expect(listWorktrees).toHaveBeenCalledWith({ repoPath: '/tmp/repo' })
    })

    const branchBadge = await screen.findByTestId('workspace-space-worktree-branch-space-1')
    expect(branchBadge).toHaveTextContent('feat/infra-pill')
  })
})
