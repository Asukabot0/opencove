import { expect, test } from '@playwright/test'
import { clearAndSeedWorkspace, launchApp } from './workspace-canvas.helpers'

test.describe('Workspace Canvas - Agent Launcher', () => {
  test('runs agent from launcher v2 and creates node', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [], {
        settings: {
          defaultProvider: 'codex',
          customModelEnabledByProvider: {
            'claude-code': false,
            codex: true,
          },
          customModelByProvider: {
            'claude-code': '',
            codex: 'gpt-5.2-codex',
          },
          customModelOptionsByProvider: {
            'claude-code': [],
            codex: ['gpt-5.2-codex'],
          },
        },
      })

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      await pane.click({
        button: 'right',
        position: { x: 320, y: 220 },
      })

      const runButton = window.locator('[data-testid="workspace-context-run-default-agent"]')
      await expect(runButton).toBeVisible()
      await runButton.click()

      const launcher = window.locator('[data-testid="workspace-agent-launcher"]')
      await expect(launcher).toBeVisible()

      await window.locator('[data-testid="workspace-agent-launch-provider"]').selectOption('codex')
      await window.locator('[data-testid="workspace-agent-launch-model"]').fill('gpt-5.2-codex')

      const promptInput = window.locator('[data-testid="workspace-agent-launch-prompt"]')
      await promptInput.fill('Generate implementation plan for API error handling')

      const submitButton = window.locator('[data-testid="workspace-agent-launch-submit"]')
      await submitButton.click()

      await expect(window.locator('.terminal-node')).toHaveCount(1)
      await expect(window.locator('.terminal-node__title').first()).toContainText('gpt-5.2-codex')
      await expect(window.locator('.terminal-node').first().locator('.xterm')).toBeVisible()
      await expect(window.locator('.terminal-node').first()).toContainText(
        '[cove-test-agent] codex new',
      )
      await expect(window.locator('.workspace-sidebar .workspace-agent-item')).toHaveCount(1)
    } finally {
      await electronApp.close()
    }
  })
})
