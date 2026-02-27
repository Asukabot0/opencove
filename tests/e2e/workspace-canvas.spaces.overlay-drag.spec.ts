import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  launchApp,
  storageKey,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Spaces (Overlay & Drag)', () => {
  test('renders space overlay layer below node windows', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'space-layer-node',
            title: 'terminal-space-layer',
            position: { x: 360, y: 260 },
            width: 460,
            height: 300,
          },
        ],
        {
          spaces: [
            {
              id: 'space-layer',
              name: 'Layer Scope',
              directoryPath: testWorkspacePath,
              nodeIds: ['space-layer-node'],
              rect: {
                x: 320,
                y: 220,
                width: 540,
                height: 380,
              },
            },
          ],
          activeSpaceId: null,
        },
      )

      const levels = await window.evaluate(() => {
        const overlayLayer = document.querySelector(
          '.workspace-canvas .react-flow__viewport-portal',
        ) as HTMLElement | null
        const nodeLayer = document.querySelector(
          '.workspace-canvas .react-flow__nodes',
        ) as HTMLElement | null

        if (!overlayLayer || !nodeLayer) {
          return null
        }

        const parseLevel = (value: string): number => {
          if (value === 'auto') {
            return 0
          }

          const parsed = Number.parseInt(value, 10)
          return Number.isNaN(parsed) ? 0 : parsed
        }

        return {
          overlay: parseLevel(window.getComputedStyle(overlayLayer).zIndex),
          node: parseLevel(window.getComputedStyle(nodeLayer).zIndex),
        }
      })

      if (!levels) {
        throw new Error('unable to read overlay/node z-index levels')
      }

      expect(levels.overlay).toBeLessThan(levels.node)
    } finally {
      await electronApp.close()
    }
  })

  test('drags explicit space border and moves enclosed nodes together', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'space-drag-node',
            title: 'terminal-space-drag',
            position: { x: 420, y: 340 },
            width: 460,
            height: 300,
          },
        ],
        {
          spaces: [
            {
              id: 'space-drag',
              name: 'Drag Scope',
              directoryPath: testWorkspacePath,
              nodeIds: ['space-drag-node'],
              rect: {
                x: 340,
                y: 280,
                width: 620,
                height: 420,
              },
            },
          ],
          activeSpaceId: null,
        },
      )

      const readPersistedSpaceAndNode = async (): Promise<{
        nodeX: number
        nodeY: number
        rectX: number
        rectY: number
      } | null> => {
        return await window.evaluate(
          ({ key, nodeId, spaceId }) => {
            const raw = window.localStorage.getItem(key)
            if (!raw) {
              return null
            }

            const parsed = JSON.parse(raw) as {
              workspaces?: Array<{
                nodes?: Array<{
                  id?: string
                  position?: {
                    x?: number
                    y?: number
                  }
                }>
                spaces?: Array<{
                  id?: string
                  rect?: {
                    x?: number
                    y?: number
                  } | null
                }>
              }>
            }

            const workspace = parsed.workspaces?.[0]
            if (!workspace) {
              return null
            }

            const node = workspace.nodes?.find(item => item.id === nodeId)
            const space = workspace.spaces?.find(item => item.id === spaceId)
            if (!node?.position || !space?.rect) {
              return null
            }

            if (
              typeof node.position.x !== 'number' ||
              typeof node.position.y !== 'number' ||
              typeof space.rect.x !== 'number' ||
              typeof space.rect.y !== 'number'
            ) {
              return null
            }

            return {
              nodeX: node.position.x,
              nodeY: node.position.y,
              rectX: space.rect.x,
              rectY: space.rect.y,
            }
          },
          {
            key: storageKey,
            nodeId: 'space-drag-node',
            spaceId: 'space-drag',
          },
        )
      }

      const before = await readPersistedSpaceAndNode()
      if (!before) {
        throw new Error('failed to read initial persisted space/node state')
      }

      const terminals = window.locator('.terminal-node')
      await expect(terminals).toHaveCount(1)

      const dragHandle = window.locator('[data-testid="workspace-space-drag-space-drag-top"]')
      await expect(dragHandle).toBeVisible()

      const handleBox = await dragHandle.boundingBox()
      if (!handleBox) {
        throw new Error('space drag handle bounding box unavailable')
      }

      const startX = handleBox.x + handleBox.width * 0.9
      const startY = handleBox.y + handleBox.height * 0.5
      const dragDx = 160
      const dragDy = 110

      await window.mouse.move(startX, startY)
      await window.mouse.down()
      await window.mouse.move(startX + dragDx, startY + dragDy, { steps: 12 })
      await window.mouse.up()

      await expect
        .poll(async () => {
          const after = await readPersistedSpaceAndNode()
          return after ? after.nodeX - before.nodeX : Number.NaN
        })
        .toBeGreaterThan(120)

      await expect
        .poll(async () => {
          const after = await readPersistedSpaceAndNode()
          return after ? after.nodeY - before.nodeY : Number.NaN
        })
        .toBeGreaterThan(80)

      await expect
        .poll(async () => {
          const after = await readPersistedSpaceAndNode()
          return after ? after.rectX - before.rectX : Number.NaN
        })
        .toBeGreaterThan(120)

      await expect
        .poll(async () => {
          const after = await readPersistedSpaceAndNode()
          return after ? after.rectY - before.rectY : Number.NaN
        })
        .toBeGreaterThan(80)
    } finally {
      await electronApp.close()
    }
  })
})
