import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  dragLocatorTo,
  launchApp,
  readCanvasViewport,
  storageKey,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Spaces (Menu & Switch)', () => {
  test('opens pane menu on blank right-click even when node is selected', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'space-pane-menu-node',
          title: 'terminal-space-pane-menu',
          position: { x: 220, y: 180 },
          width: 460,
          height: 300,
        },
      ])

      const terminalNode = window.locator('.terminal-node').first()
      await expect(terminalNode).toBeVisible()
      await terminalNode.click()

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await pane.click({
        button: 'right',
        position: { x: 80, y: 80 },
      })

      await expect(window.locator('[data-testid="workspace-context-new-terminal"]')).toBeVisible()
      await expect(window.locator('[data-testid="workspace-selection-create-space"]')).toHaveCount(
        0,
      )
    } finally {
      await electronApp.close()
    }
  })

  test('does not offer right-click ownership transfer actions (drag-only membership)', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'space-no-context-move-node',
          title: 'terminal-space-no-context-move',
          position: { x: 220, y: 180 },
          width: 460,
          height: 300,
        },
      ])

      const terminalNode = window.locator('.terminal-node').first()
      await expect(terminalNode).toBeVisible()

      await terminalNode.click()
      await terminalNode.click({ button: 'right' })
      await window.locator('[data-testid="workspace-selection-create-space"]').click()

      await terminalNode.click({ button: 'right' })
      await expect(window.locator('[data-testid="workspace-selection-create-space"]')).toBeVisible()
      await expect(window.locator('[data-testid^="workspace-selection-move-space-"]')).toHaveCount(
        0,
      )
      await expect(window.locator('[data-testid="workspace-selection-remove-space"]')).toHaveCount(
        0,
      )
    } finally {
      await electronApp.close()
    }
  })

  test('removes empty selected-created space when all members are unassigned', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'space-cleanup-node',
          title: 'terminal-space-cleanup',
          position: { x: 220, y: 180 },
          width: 460,
          height: 300,
        },
      ])

      const terminalNode = window.locator('.terminal-node').first()
      await expect(terminalNode).toBeVisible()

      await terminalNode.click()
      await terminalNode.click({ button: 'right' })
      await window.locator('[data-testid="workspace-selection-create-space"]').click()

      await expect(window.locator('.workspace-space-switcher')).toHaveCount(1)
      await expect(window.locator('.workspace-space-region')).toHaveCount(1)

      const header = terminalNode.locator('.terminal-node__header')
      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      const paneBox = await pane.boundingBox()
      if (!paneBox) {
        throw new Error('workspace pane bounding box unavailable')
      }

      await dragLocatorTo(window, header, pane, {
        sourcePosition: { x: 80, y: 16 },
        targetPosition: {
          x: 120,
          y: Math.max(160, paneBox.height - 120),
        },
      })

      await expect(window.locator('.workspace-space-switcher')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region')).toHaveCount(0)

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

  test('renames space by clicking the region label', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'space-rename-node',
          title: 'terminal-space-rename',
          position: { x: 220, y: 180 },
          width: 460,
          height: 300,
        },
      ])

      const terminalNode = window.locator('.terminal-node').first()
      await expect(terminalNode).toBeVisible()

      await terminalNode.click()
      await terminalNode.click({ button: 'right' })
      await window.locator('[data-testid="workspace-selection-create-space"]').click()

      const labelButton = window.locator('.workspace-space-region__label').first()
      await expect(labelButton).toBeVisible()
      await labelButton.click()

      const renameInput = window.locator('.workspace-space-region__label-input').first()
      await expect(renameInput).toBeVisible()
      await renameInput.fill('Infra Core')
      await renameInput.press('Enter')

      await expect(window.locator('.workspace-space-switcher__item--active')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region--active')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region__label').first()).toHaveText(
        'Infra Core',
      )
      await expect(
        window.locator('.workspace-space-switcher__item', { hasText: 'Infra Core' }),
      ).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('fits space bounds in viewport when clicking a space switch item', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'space-focus-node',
            title: 'terminal-space-focus',
            position: { x: 1740, y: 1120 },
            width: 460,
            height: 300,
          },
        ],
        {
          spaces: [
            {
              id: 'space-focus',
              name: 'Focus Scope',
              directoryPath: testWorkspacePath,
              nodeIds: ['space-focus-node'],
              rect: {
                x: 1700,
                y: 1080,
                width: 540,
                height: 380,
              },
            },
          ],
          activeSpaceId: null,
        },
      )

      const beforeViewport = await readCanvasViewport(window)
      expect(Math.abs(beforeViewport.x)).toBeLessThan(40)
      expect(Math.abs(beforeViewport.y)).toBeLessThan(40)

      const canvasBounds = await window.evaluate(() => {
        const surface = document.querySelector('.workspace-canvas .react-flow')
        if (!(surface instanceof HTMLElement)) {
          return null
        }

        return {
          width: surface.clientWidth,
          height: surface.clientHeight,
        }
      })

      if (!canvasBounds) {
        throw new Error('react-flow surface size unavailable')
      }

      const targetSpace = {
        x: 1700,
        y: 1080,
        width: 540,
        height: 380,
      }

      await window.locator('[data-testid="workspace-space-switch-space-focus"]').click()
      await expect(window.locator('.workspace-space-switcher__item--active')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region--active')).toHaveCount(0)

      await expect
        .poll(async () => {
          const viewport = await readCanvasViewport(window)
          const minFlowX = -viewport.x / viewport.zoom
          const maxFlowX = (canvasBounds.width - viewport.x) / viewport.zoom

          return {
            minFlowX,
            maxFlowX,
          }
        })
        .toEqual(
          expect.objectContaining({
            minFlowX: expect.any(Number),
            maxFlowX: expect.any(Number),
          }),
        )

      await expect
        .poll(async () => {
          const viewport = await readCanvasViewport(window)
          const minFlowX = -viewport.x / viewport.zoom
          const maxFlowX = (canvasBounds.width - viewport.x) / viewport.zoom
          return {
            leftVisible: minFlowX <= targetSpace.x + 1,
            rightVisible: maxFlowX >= targetSpace.x + targetSpace.width - 1,
          }
        })
        .toEqual({
          leftVisible: true,
          rightVisible: true,
        })

      await expect
        .poll(async () => {
          const viewport = await readCanvasViewport(window)
          const minFlowY = -viewport.y / viewport.zoom
          const maxFlowY = (canvasBounds.height - viewport.y) / viewport.zoom
          return {
            topVisible: minFlowY <= targetSpace.y + 1,
            bottomVisible: maxFlowY >= targetSpace.y + targetSpace.height - 1,
          }
        })
        .toEqual({
          topVisible: true,
          bottomVisible: true,
        })
    } finally {
      await electronApp.close()
    }
  })

  test('fits global canvas when clicking All space switch item', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'space-all-node-a',
            title: 'terminal-space-all-a',
            position: { x: 120, y: 120 },
            width: 460,
            height: 300,
          },
          {
            id: 'space-all-node-b',
            title: 'terminal-space-all-b',
            position: { x: 2480, y: 1560 },
            width: 460,
            height: 300,
          },
        ],
        {
          spaces: [
            {
              id: 'space-all-focus',
              name: 'Deep Work',
              directoryPath: testWorkspacePath,
              nodeIds: ['space-all-node-b'],
              rect: {
                x: 2440,
                y: 1520,
                width: 560,
                height: 380,
              },
            },
          ],
          activeSpaceId: null,
        },
      )

      const canvasBounds = await window.evaluate(() => {
        const surface = document.querySelector('.workspace-canvas .react-flow')
        if (!(surface instanceof HTMLElement)) {
          return null
        }

        return {
          width: surface.clientWidth,
          height: surface.clientHeight,
        }
      })

      if (!canvasBounds) {
        throw new Error('react-flow surface size unavailable')
      }

      await window.locator('[data-testid="workspace-space-switch-space-all-focus"]').click()
      await expect(window.locator('.workspace-space-switcher__item--active')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region--active')).toHaveCount(0)

      await window.locator('[data-testid="workspace-space-switch-all"]').click()
      await expect(window.locator('.workspace-space-switcher__item--active')).toHaveCount(0)
      await expect(window.locator('.workspace-space-region--active')).toHaveCount(0)

      const targetNodes = [
        { x: 120, y: 120, width: 460, height: 300 },
        { x: 2480, y: 1560, width: 460, height: 300 },
      ]

      await expect
        .poll(async () => {
          const viewport = await readCanvasViewport(window)
          const minFlowX = -viewport.x / viewport.zoom
          const maxFlowX = (canvasBounds.width - viewport.x) / viewport.zoom
          const minFlowY = -viewport.y / viewport.zoom
          const maxFlowY = (canvasBounds.height - viewport.y) / viewport.zoom

          return targetNodes.every(node => {
            return (
              minFlowX <= node.x + 2 &&
              maxFlowX >= node.x + node.width - 2 &&
              minFlowY <= node.y + 2 &&
              maxFlowY >= node.y + node.height - 2
            )
          })
        })
        .toBe(true)
    } finally {
      await electronApp.close()
    }
  })
})
