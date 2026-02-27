import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  launchApp,
  storageKey,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Spaces (Node Resize)', () => {
  test('clamps terminal resize so it stays within its space bounds', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(
        window,
        [
          {
            id: 'space-resize-terminal',
            title: 'terminal-in-space',
            position: { x: 140, y: 140 },
            width: 460,
            height: 300,
            kind: 'terminal',
            status: null,
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: null,
            scrollback: null,
            executionDirectory: testWorkspacePath,
            expectedDirectory: testWorkspacePath,
            agent: null,
            task: null,
          },
        ],
        {
          spaces: [
            {
              id: 'space-resize',
              name: 'Resize Space',
              directoryPath: testWorkspacePath,
              nodeIds: ['space-resize-terminal'],
              rect: { x: 100, y: 100, width: 600, height: 400 },
            },
          ],
          activeSpaceId: null,
        },
      )

      const terminalNode = window.locator('.terminal-node').first()
      await expect(terminalNode).toBeVisible()

      const rightResizer = terminalNode.locator('[data-testid="terminal-resizer-right"]')
      const rightBox = await rightResizer.boundingBox()
      if (!rightBox) {
        throw new Error('terminal right resizer bounding box unavailable')
      }

      await window.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + rightBox.height / 2)
      await window.mouse.down()
      await window.mouse.move(
        rightBox.x + rightBox.width / 2 + 1200,
        rightBox.y + rightBox.height / 2,
      )
      await window.mouse.up()

      const bottomResizer = terminalNode.locator('[data-testid="terminal-resizer-bottom"]')
      const bottomBox = await bottomResizer.boundingBox()
      if (!bottomBox) {
        throw new Error('terminal bottom resizer bounding box unavailable')
      }

      await window.mouse.move(bottomBox.x + bottomBox.width / 2, bottomBox.y + bottomBox.height / 2)
      await window.mouse.down()
      await window.mouse.move(
        bottomBox.x + bottomBox.width / 2,
        bottomBox.y + bottomBox.height / 2 + 1200,
      )
      await window.mouse.up()

      const result = await window.evaluate(key => {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          return null
        }

        const parsed = JSON.parse(raw) as {
          workspaces?: Array<{
            nodes?: Array<{
              id?: string
              position?: { x?: number; y?: number }
              width?: number
              height?: number
            }>
            spaces?: Array<{
              id?: string
              rect?: { x?: number; y?: number; width?: number; height?: number } | null
            }>
          }>
        }

        const workspace = parsed.workspaces?.[0]
        const node = (workspace?.nodes ?? []).find(item => item.id === 'space-resize-terminal')
        const space = (workspace?.spaces ?? []).find(item => item.id === 'space-resize')

        return { node, rect: space?.rect ?? null }
      }, storageKey)

      expect(result).toBeTruthy()

      const node = result?.node
      const rect = result?.rect

      expect(node?.position?.x).toBe(140)
      expect(node?.position?.y).toBe(140)
      expect(rect).toEqual({ x: 100, y: 100, width: 600, height: 400 })

      const maxWidth = 100 + 600 - 140
      const maxHeight = 100 + 400 - 140

      expect((node?.width ?? 0) <= maxWidth).toBe(true)
      expect((node?.height ?? 0) <= maxHeight).toBe(true)
    } finally {
      await electronApp.close()
    }
  })
})
