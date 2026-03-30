import React from 'react'
import { WarningDialog } from '@app/renderer/components/WarningDialog'
import { useTranslation } from '@app/renderer/i18n'
import {
  resolveEntryAbsolutePath,
  type SpaceExplorerDeleteConfirmationState,
  type SpaceExplorerMoveConfirmationState,
} from './WorkspaceSpaceExplorerOverlay.operations'

export function WorkspaceSpaceExplorerOverlayWindows({
  deleteConfirmation,
  moveConfirmation,
  onCancelDelete,
  onConfirmDelete,
  onCancelMove,
  onConfirmMove,
}: {
  deleteConfirmation: SpaceExplorerDeleteConfirmationState | null
  moveConfirmation: SpaceExplorerMoveConfirmationState | null
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onCancelMove: () => void
  onConfirmMove: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()

  if (deleteConfirmation) {
    return (
      <WarningDialog
        dataTestId="workspace-space-explorer-delete-confirmation"
        title={t('spaceExplorer.deleteTitle')}
        lead={
          <p data-testid="workspace-space-explorer-delete-message">
            {t('spaceExplorer.deletePrompt', { name: deleteConfirmation.entry.name })}
          </p>
        }
        onBackdropClick={onCancelDelete}
        dialogClassName="workspace-warning-dialog--compact"
        actions={
          <>
            <button
              type="button"
              className="cove-window__action cove-window__action--ghost"
              onClick={onCancelDelete}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="cove-window__action cove-window__action--danger"
              onClick={onConfirmDelete}
            >
              {t('common.delete')}
            </button>
          </>
        }
      />
    )
  }

  if (moveConfirmation) {
    const targetPath =
      resolveEntryAbsolutePath(moveConfirmation.targetDirectoryUri) ??
      moveConfirmation.targetDirectoryUri
    return (
      <WarningDialog
        dataTestId="workspace-space-explorer-move-confirmation"
        title={t('spaceExplorer.moveTitle')}
        lead={
          <p data-testid="workspace-space-explorer-move-message">
            {t('spaceExplorer.movePrompt', {
              name: moveConfirmation.entry.name,
              target: targetPath,
            })}
          </p>
        }
        onBackdropClick={onCancelMove}
        dialogClassName="workspace-warning-dialog--compact"
        actions={
          <>
            <button
              type="button"
              className="cove-window__action cove-window__action--ghost"
              onClick={onCancelMove}
            >
              {t('common.cancel')}
            </button>
            <button type="button" className="cove-window__action" onClick={onConfirmMove}>
              {t('common.confirm')}
            </button>
          </>
        }
      />
    )
  }

  return null
}
