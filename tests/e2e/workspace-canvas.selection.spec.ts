import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp, storageKey } from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Selection', () => {
  test('does not allow creating space from empty shift box selection', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [])

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()
      const paneBox = await pane.boundingBox()
      if (!paneBox) {
        throw new Error('workspace pane bounding box unavailable')
      }

      const startX = paneBox.x + 140
      const startY = paneBox.y + 120

      await window.keyboard.down('Shift')
      await window.mouse.move(startX, startY)
      await window.mouse.down()
      await window.mouse.move(startX + 220, startY + 170, { steps: 8 })
      await expect(window.locator('.workspace-selection-draft')).toBeVisible()
      await window.mouse.up()
      await expect(window.locator('.workspace-selection-draft')).toHaveCount(0)
      await window.keyboard.up('Shift')

      await expect(
        window.locator('[data-testid="workspace-empty-selection-create-space"]'),
      ).toHaveCount(0)
      await expect(window.locator('.workspace-space-switcher')).toHaveCount(0)

      const spaceCount = await window.evaluate(async key => {
        void key

        const raw = await window.coveApi.persistence.readWorkspaceStateRaw()
        if (!raw) {
          return 0
        }

        const parsed = JSON.parse(raw) as {
          workspaces?: Array<{
            spaces?: unknown[]
          }>
        }

        return parsed.workspaces?.[0]?.spaces?.length ?? 0
      }, storageKey)

      expect(spaceCount).toBe(0)
    } finally {
      await electronApp.close()
    }
  })

  test('supports trackpad selection replace/add semantics', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'trackpad-select-node-a',
            title: 'terminal-trackpad-select-a',
            position: { x: 220, y: 180 },
            width: 460,
            height: 300,
          },
          {
            id: 'trackpad-select-node-b',
            title: 'terminal-trackpad-select-b',
            position: { x: 760, y: 220 },
            width: 460,
            height: 300,
          },
        ],
        {
          settings: {
            canvasInputMode: 'trackpad',
          },
        },
      )

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(0)
      const paneBox = await pane.boundingBox()
      if (!paneBox) {
        throw new Error('workspace pane bounding box unavailable')
      }

      await pane.dragTo(pane, {
        sourcePosition: { x: 120, y: 120 },
        targetPosition: { x: 700, y: 520 },
      })

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)
      await expect(
        window.locator('.react-flow__node.selected .terminal-node__title').first(),
      ).toContainText('terminal-trackpad-select-a')

      const secondNode = window
        .locator('.terminal-node')
        .filter({ hasText: 'terminal-trackpad-select-b' })
        .first()
      const secondNodeBox = await secondNode.boundingBox()
      if (!secondNodeBox) {
        throw new Error('second node bounding box unavailable')
      }

      const selectionStartX = Math.max(paneBox.x + 40, secondNodeBox.x - 24)
      const selectionStartY = Math.max(paneBox.y + 40, secondNodeBox.y - 24)
      const selectionEndX = Math.min(
        paneBox.x + paneBox.width - 40,
        secondNodeBox.x + secondNodeBox.width - 24,
      )
      const selectionEndY = Math.min(
        paneBox.y + paneBox.height - 120,
        secondNodeBox.y + secondNodeBox.height - 24,
      )

      await window.keyboard.down('Shift')
      await window.mouse.move(selectionStartX, selectionStartY)
      await window.mouse.down()
      await window.mouse.move(selectionEndX, selectionEndY, { steps: 10 })
      await window.mouse.up()
      await window.keyboard.up('Shift')

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(2)

      const firstNode = window
        .locator('.terminal-node')
        .filter({ hasText: 'terminal-trackpad-select-a' })
        .first()
      const firstNodeBoxForReplace = await firstNode.boundingBox()
      if (!firstNodeBoxForReplace) {
        throw new Error('first node bounding box unavailable for replace drag')
      }
      const replaceStartX = Math.max(paneBox.x + 40, firstNodeBoxForReplace.x - 24)
      const replaceStartY = Math.max(paneBox.y + 40, firstNodeBoxForReplace.y - 24)
      const replaceEndX = Math.min(
        paneBox.x + paneBox.width - 40,
        firstNodeBoxForReplace.x + firstNodeBoxForReplace.width - 24,
      )
      const replaceEndY = Math.min(
        paneBox.y + paneBox.height - 120,
        firstNodeBoxForReplace.y + firstNodeBoxForReplace.height - 24,
      )

      await window.mouse.move(replaceStartX, replaceStartY)
      await window.mouse.down()
      await window.mouse.move(replaceEndX, replaceEndY, { steps: 10 })
      await window.mouse.up()

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)
      await expect(
        window.locator('.react-flow__node.selected .terminal-node__title').first(),
      ).toContainText('terminal-trackpad-select-a')
    } finally {
      await electronApp.close()
    }
  })

  test('keeps selection while panning and clears selection on blank pane click', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'trackpad-pan-select-node',
            title: 'terminal-trackpad-pan-select',
            position: { x: 220, y: 180 },
            width: 460,
            height: 300,
          },
        ],
        {
          settings: {
            canvasInputMode: 'trackpad',
          },
        },
      )

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      await pane.dragTo(pane, {
        sourcePosition: { x: 120, y: 120 },
        targetPosition: { x: 700, y: 520 },
      })
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)

      await window.evaluate(() => {
        const paneElement = document.querySelector('.workspace-canvas .react-flow__pane')
        if (!(paneElement instanceof HTMLElement)) {
          return
        }

        paneElement.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: 140,
            deltaY: 40,
            deltaMode: 0,
            bubbles: true,
            cancelable: true,
          }),
        )
      })

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)

      await pane.click({
        position: { x: 40, y: 40 },
      })

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })

  test('does not select nodes on plain drag in mouse mode', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'mouse-select-node',
            title: 'terminal-mouse-select',
            position: { x: 220, y: 180 },
            width: 460,
            height: 300,
          },
        ],
        {
          settings: {
            canvasInputMode: 'mouse',
          },
        },
      )

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(0)

      await pane.dragTo(pane, {
        sourcePosition: { x: 80, y: 80 },
        targetPosition: { x: 760, y: 560 },
      })
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(0)
    } finally {
      await electronApp.close()
    }
  })

  test('switches selected window on body click without moving canvas', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'mouse-window-switch-node-a',
            title: 'terminal-mouse-window-switch-a',
            position: { x: 220, y: 180 },
            width: 460,
            height: 300,
          },
          {
            id: 'mouse-window-switch-node-b',
            title: 'terminal-mouse-window-switch-b',
            position: { x: 560, y: 180 },
            width: 460,
            height: 300,
          },
        ],
        {
          settings: {
            canvasInputMode: 'mouse',
          },
        },
      )

      const firstNode = window
        .locator('.react-flow__node')
        .filter({ hasText: 'terminal-mouse-window-switch-a' })
        .first()
      const secondNode = window
        .locator('.react-flow__node')
        .filter({ hasText: 'terminal-mouse-window-switch-b' })
        .first()

      const firstNodeBox = await firstNode.boundingBox()
      if (!firstNodeBox) {
        throw new Error('first node bounding box unavailable')
      }

      const secondNodeBox = await secondNode.boundingBox()
      if (!secondNodeBox) {
        throw new Error('second node bounding box unavailable')
      }

      await window.mouse.click(firstNodeBox.x + 10, firstNodeBox.y + 10)
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)
      await expect(
        window.locator('.react-flow__node.selected .terminal-node__title').first(),
      ).toContainText('terminal-mouse-window-switch-a')

      await window.mouse.click(
        secondNodeBox.x + secondNodeBox.width / 2,
        secondNodeBox.y + secondNodeBox.height / 2,
      )
      await expect(window.locator('.react-flow__node.selected')).toHaveCount(1)
      await expect(
        window.locator('.react-flow__node.selected .terminal-node__title').first(),
      ).toContainText('terminal-mouse-window-switch-b')
    } finally {
      await electronApp.close()
    }
  })
})
