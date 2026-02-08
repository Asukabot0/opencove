import {
  expect,
  test,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import path from 'path'

const electronAppPath = path.resolve(__dirname, '../../')
const testWorkspacePath = path.resolve(__dirname, '../../')
const storageKey = 'cove:m0:workspace-state'

interface SeedNode {
  id: string
  title: string
  position: {
    x: number
    y: number
  }
  width: number
  height: number
}

async function launchApp(): Promise<{ electronApp: ElectronApplication; window: Page }> {
  const electronApp = await electron.launch({
    args: [electronAppPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      COVE_TEST_WORKSPACE: testWorkspacePath,
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return { electronApp, window }
}

async function clearAndSeedWorkspace(window: Page, nodes: SeedNode[]): Promise<void> {
  const seededState = {
    activeWorkspaceId: 'workspace-seeded',
    workspaces: [
      {
        id: 'workspace-seeded',
        name: path.basename(testWorkspacePath),
        path: testWorkspacePath,
        nodes,
      },
    ],
  }

  await window.evaluate(
    ({ key, state }) => {
      window.localStorage.setItem(key, JSON.stringify(state))
    },
    {
      key: storageKey,
      state: seededState,
    },
  )

  await window.reload({ waitUntil: 'domcontentloaded' })
}

test.describe('Workspace Canvas Interactions', () => {
  test('keeps terminal visible after drag, resize, and node interactions', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'node-1',
          title: 'terminal-1',
          position: { x: 120, y: 120 },
          width: 460,
          height: 300,
        },
        {
          id: 'node-2',
          title: 'terminal-2',
          position: { x: 760, y: 200 },
          width: 460,
          height: 300,
        },
      ])

      await expect(window.locator('.workspace-canvas')).toBeVisible()
      await expect(window.locator('.workspace-item__meta').first()).toHaveText('2 terminals')

      const terminals = window.locator('.terminal-node')
      await expect(terminals).toHaveCount(2)

      const firstTerminal = terminals.first()
      await expect(firstTerminal).toBeVisible()
      await expect(firstTerminal.locator('.xterm')).toBeVisible()

      const header = firstTerminal.locator('.terminal-node__header')
      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      await header.dragTo(pane, {
        sourcePosition: { x: 80, y: 16 },
        targetPosition: { x: 520, y: 420 },
      })

      await expect(firstTerminal).toBeVisible()
      await expect(firstTerminal.locator('.xterm')).toBeVisible()

      const beforeResize = await firstTerminal.boundingBox()
      if (!beforeResize) {
        throw new Error('terminal bounding box unavailable before resize')
      }

      const resizer = firstTerminal.locator('.terminal-node__resizer')
      const resizerBox = await resizer.boundingBox()
      if (!resizerBox) {
        throw new Error('terminal resizer bounding box unavailable')
      }

      const startX = resizerBox.x + resizerBox.width / 2
      const startY = resizerBox.y + resizerBox.height / 2

      await window.mouse.move(startX, startY)
      await window.mouse.down()
      await window.mouse.move(startX + 120, startY + 80)
      await window.mouse.up()

      const afterResize = await firstTerminal.boundingBox()
      if (!afterResize) {
        throw new Error('terminal bounding box unavailable after resize')
      }

      expect(afterResize.width).toBeGreaterThan(beforeResize.width + 40)
      expect(afterResize.height).toBeGreaterThan(beforeResize.height + 20)
      await expect(firstTerminal.locator('.xterm')).toBeVisible()

      await terminals.nth(1).locator('.terminal-node__header').click()

      await expect(firstTerminal).toBeVisible()
      await expect(firstTerminal.locator('.xterm')).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })

  test('wheel over terminal does not zoom canvas', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'node-wheel',
          title: 'terminal-wheel',
          position: { x: 120, y: 120 },
          width: 460,
          height: 300,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()
      await expect(terminal.locator('.xterm')).toBeVisible()

      const viewport = window.locator('.react-flow__viewport')
      const beforeTransform = await viewport.getAttribute('style')

      await terminal.hover()
      await window.mouse.wheel(0, -1200)

      const afterTransform = await viewport.getAttribute('style')
      expect(afterTransform).toBe(beforeTransform)
      await expect(terminal.locator('.xterm')).toBeVisible()
    } finally {
      await electronApp.close()
    }
  })
})
