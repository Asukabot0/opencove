import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp, storageKey } from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Spaces (Push Away)', () => {
  test('pushes away unselected windows when creating a space would overlap them', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'space-create-left',
          title: 'terminal-space-create-left',
          position: { x: 120, y: 200 },
          width: 460,
          height: 300,
        },
        {
          id: 'space-create-middle',
          title: 'terminal-space-create-middle',
          position: { x: 560, y: 260 },
          width: 460,
          height: 300,
        },
        {
          id: 'space-create-right',
          title: 'terminal-space-create-right',
          position: { x: 1020, y: 200 },
          width: 460,
          height: 300,
        },
      ])

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      const leftNode = window
        .locator('.terminal-node')
        .filter({ hasText: 'terminal-space-create-left' })
        .first()
      await expect(leftNode).toBeVisible()
      await leftNode.click()

      const rightNode = window
        .locator('.terminal-node')
        .filter({ hasText: 'terminal-space-create-right' })
        .first()
      const paneBox = await pane.boundingBox()
      if (!paneBox) {
        throw new Error('workspace pane bounding box unavailable')
      }

      // Pan from a safe empty lane near the top so the right node ends up inside the viewport for box selection.
      const panY = paneBox.y + 60
      const panOnce = async (dx: number) => {
        const startX = paneBox.x + paneBox.width * 0.5
        await window.mouse.move(startX, panY)
        await window.mouse.down()
        await window.mouse.move(startX + dx, panY, { steps: 12 })
        await window.mouse.up()
      }

      await panOnce(-520)

      let rightBox = await rightNode.boundingBox()
      if (!rightBox) {
        throw new Error('right node bounding box unavailable')
      }

      if (rightBox.x > paneBox.x + paneBox.width - 120) {
        await panOnce(-520)
        rightBox = await rightNode.boundingBox()
        if (!rightBox) {
          throw new Error('right node bounding box unavailable after pan')
        }
      }

      const selectionStartY = Math.max(paneBox.y + 40, rightBox.y - 24)

      await window.keyboard.down('Shift')
      // Use a narrow box selection that only intersects the right node (avoid selecting middle).
      const rightCenterX = rightBox.x + rightBox.width * 0.82
      const boxHalfWidth = 28
      const boxLeft = Math.max(paneBox.x + 40, rightCenterX - boxHalfWidth)
      const boxRight = Math.min(paneBox.x + paneBox.width - 40, rightCenterX + boxHalfWidth)

      const aboveY = rightBox.y - 36
      const belowY = rightBox.y + rightBox.height + 36
      const canStartAbove = aboveY > paneBox.y + 40
      const canStartBelow = belowY < paneBox.y + paneBox.height - 120
      const startY = canStartAbove ? aboveY : canStartBelow ? belowY : selectionStartY
      const endY = Math.min(paneBox.y + paneBox.height - 120, rightBox.y + rightBox.height * 0.65)

      await window.mouse.move(boxLeft, startY)
      await window.mouse.down()
      await window.mouse.move(boxRight, endY, { steps: 10 })
      await window.mouse.up()
      await window.keyboard.up('Shift')

      await expect(window.locator('.react-flow__node.selected')).toHaveCount(2)

      await window.locator('.react-flow__nodesselection-rect').click({ button: 'right' })
      await window.locator('[data-testid="workspace-selection-create-space"]').click()

      await expect
        .poll(async () => {
          return await window.evaluate(
            ({ key }) => {
              const raw = window.localStorage.getItem(key)
              if (!raw) {
                return false
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
                    nodeIds?: string[]
                  }>
                }>
              }

              const workspace = parsed.workspaces?.[0]
              const space = workspace?.spaces?.[0]
              if (!space?.rect || !Array.isArray(space.nodeIds)) {
                return false
              }

              const rect = space.rect
              if (
                typeof rect.x !== 'number' ||
                typeof rect.y !== 'number' ||
                typeof rect.width !== 'number' ||
                typeof rect.height !== 'number'
              ) {
                return false
              }

              const middle = workspace?.nodes?.find(node => node.id === 'space-create-middle')
              if (
                !middle?.position ||
                typeof middle.position.x !== 'number' ||
                typeof middle.position.y !== 'number' ||
                typeof middle.width !== 'number' ||
                typeof middle.height !== 'number'
              ) {
                return false
              }

              const middleRect = {
                x: middle.position.x,
                y: middle.position.y,
                width: middle.width,
                height: middle.height,
              }

              const spaceRight = rect.x + rect.width
              const spaceBottom = rect.y + rect.height
              const middleRight = middleRect.x + middleRect.width
              const middleBottom = middleRect.y + middleRect.height
              const intersects = !(
                spaceRight <= middleRect.x ||
                rect.x >= middleRight ||
                spaceBottom <= middleRect.y ||
                rect.y >= middleBottom
              )

              const isMember = space.nodeIds.includes('space-create-middle')
              return !intersects && !isMember
            },
            { key: storageKey },
          )
        })
        .toBe(true)
    } finally {
      await electronApp.close()
    }
  })
})
