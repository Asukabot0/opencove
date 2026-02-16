import { expect, test } from '@playwright/test'
import {
  clearAndSeedWorkspace,
  launchApp,
  seedWorkspaceState,
  storageKey,
  testWorkspacePath,
} from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Persistence', () => {
  test('preserves terminal history after workspace switch', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await seedWorkspaceState(window, {
        activeWorkspaceId: 'workspace-a',
        workspaces: [
          {
            id: 'workspace-a',
            name: 'workspace-a',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'node-a',
                title: 'terminal-a',
                position: { x: 120, y: 120 },
                width: 460,
                height: 300,
              },
            ],
          },
          {
            id: 'workspace-b',
            name: 'workspace-b',
            path: testWorkspacePath,
            nodes: [
              {
                id: 'node-b',
                title: 'terminal-b',
                position: { x: 160, y: 160 },
                width: 460,
                height: 300,
              },
            ],
          },
        ],
      })

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()
      await expect(terminal.locator('.xterm')).toBeVisible()

      const token = `COVE_PERSIST_${Date.now()}`
      await terminal.locator('.xterm').click()
      await window.keyboard.type(`echo ${token}`)
      await window.keyboard.press('Enter')
      await expect(terminal).toContainText(token)

      await window.locator('.workspace-item').nth(1).click()
      await expect(window.locator('.workspace-item').nth(1)).toHaveClass(/workspace-item--active/)
      await expect(window.locator('.terminal-node')).toHaveCount(1)

      await window.locator('.workspace-item').nth(0).click()
      await expect(window.locator('.workspace-item').nth(0)).toHaveClass(/workspace-item--active/)
      await expect(window.locator('.terminal-node')).toHaveCount(1)
      await expect(window.locator('.terminal-node').first()).toContainText(token)
    } finally {
      await electronApp.close()
    }
  })

  test('preserves terminal history after app reload', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'node-reload',
          title: 'terminal-reload',
          position: { x: 120, y: 120 },
          width: 460,
          height: 300,
        },
      ])

      const terminal = window.locator('.terminal-node').first()
      await expect(terminal).toBeVisible()
      await expect(terminal.locator('.xterm')).toBeVisible()

      const token = `COVE_RELOAD_${Date.now()}`
      await terminal.locator('.xterm').click()
      await window.keyboard.type(`echo ${token}`)
      await window.keyboard.press('Enter')
      await expect(terminal).toContainText(token)

      await expect
        .poll(
          async () => {
            return await window.evaluate(
              ({ key, nodeId, expected }) => {
                const raw = window.localStorage.getItem(key)
                if (!raw) {
                  return false
                }

                const parsed = JSON.parse(raw) as {
                  workspaces?: Array<{
                    id?: string
                    nodes?: Array<{
                      id?: string
                      scrollback?: string | null
                    }>
                  }>
                }

                const workspace = parsed.workspaces?.find(item => item.id === 'workspace-seeded')
                const node = workspace?.nodes?.find(item => item.id === nodeId)
                return typeof node?.scrollback === 'string' && node.scrollback.includes(expected)
              },
              {
                key: storageKey,
                nodeId: 'node-reload',
                expected: token,
              },
            )
          },
          { timeout: 10_000 },
        )
        .toBe(true)

      await window.reload({ waitUntil: 'domcontentloaded' })

      const reloadedTerminal = window.locator('.terminal-node').first()
      await expect(reloadedTerminal).toBeVisible()
      await expect(reloadedTerminal.locator('.xterm')).toBeVisible()
      await expect(reloadedTerminal).toContainText(token)
      await expect(reloadedTerminal).not.toContainText('^[')
    } finally {
      await electronApp.close()
    }
  })
})
