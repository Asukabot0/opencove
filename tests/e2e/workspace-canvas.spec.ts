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
const seededWorkspaceId = 'workspace-seeded'

interface SeedAgentData {
  provider: 'claude-code' | 'codex'
  prompt: string
  model: string | null
  effectiveModel: string | null
  launchMode: 'new' | 'resume'
  resumeSessionId: string | null
  executionDirectory: string
  directoryMode: 'workspace' | 'custom'
  customDirectory: string | null
  shouldCreateDirectory: boolean
}

interface SeedNode {
  id: string
  title: string
  position: {
    x: number
    y: number
  }
  width: number
  height: number
  kind?: 'terminal' | 'agent'
  status?: 'running' | 'exited' | 'failed' | 'stopped' | 'restoring' | null
  startedAt?: string | null
  endedAt?: string | null
  exitCode?: number | null
  lastError?: string | null
  agent?: SeedAgentData | null
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

async function clearAndSeedWorkspace(
  window: Page,
  nodes: SeedNode[],
  options?: {
    settings?: unknown
  },
): Promise<void> {
  const seededState = {
    activeWorkspaceId: seededWorkspaceId,
    workspaces: [
      {
        id: seededWorkspaceId,
        name: path.basename(testWorkspacePath),
        path: testWorkspacePath,
        nodes,
      },
    ],
    ...(options?.settings ? { settings: options.settings } : {}),
  }

  const trySeed = async (attempt: number): Promise<boolean> => {
    if (attempt >= 3) {
      return false
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

    const seededReady = await window.evaluate(
      ({ key, workspaceId }) => {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          return false
        }

        try {
          const parsed = JSON.parse(raw) as {
            workspaces?: Array<{
              id?: string
            }>
          }

          return parsed.workspaces?.some(workspace => workspace.id === workspaceId) ?? false
        } catch {
          return false
        }
      },
      {
        key: storageKey,
        workspaceId: seededWorkspaceId,
      },
    )

    const workspaceCount = await window.locator('.workspace-item').count()
    if (seededReady && workspaceCount > 0) {
      return true
    }

    return await trySeed(attempt + 1)
  }

  const success = await trySeed(0)
  if (!success) {
    throw new Error('Failed to deterministically seed workspace state')
  }
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
      await expect(window.locator('.workspace-item__meta').first()).toContainText('2 terminals')

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

      const resizedNode = await window.evaluate(key => {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          return null
        }

        const state = JSON.parse(raw) as {
          workspaces?: Array<{
            nodes?: Array<{
              id: string
              width: number
              height: number
            }>
          }>
        }

        return state.workspaces?.[0]?.nodes?.find(node => node.id === 'node-1') ?? null
      }, storageKey)

      expect(resizedNode).toBeTruthy()
      expect(resizedNode?.width ?? 0).toBeGreaterThan(460)
      expect(resizedNode?.height ?? 0).toBeGreaterThan(300)
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
      await expect(window.locator('.workspace-agent-item')).toHaveCount(1)
    } finally {
      await electronApp.close()
    }
  })

  test('creates task node with auto title and runs linked agent', async () => {
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
          taskTitleProvider: 'codex',
          taskTitleModel: 'gpt-5.2-codex',
        },
      })

      const pane = window.locator('.workspace-canvas .react-flow__pane')
      await expect(pane).toBeVisible()

      await pane.click({
        button: 'right',
        position: { x: 320, y: 220 },
      })

      await window.locator('[data-testid="workspace-context-new-task"]').click()

      const taskCreator = window.locator('[data-testid="workspace-task-creator"]')
      await expect(taskCreator).toBeVisible()

      const requirement = window.locator('[data-testid="workspace-task-requirement"]')
      await requirement.fill('Implement login retry with exponential backoff and jitter')

      await window.locator('[data-testid="workspace-task-create-submit"]').click()

      const taskNode = window.locator('.task-node').first()
      await expect(taskNode).toBeVisible()
      await expect(taskNode.locator('.task-node__title')).toContainText('Auto:')

      await taskNode.locator('[data-testid="task-node-run-agent"]').click()

      await expect(window.locator('.terminal-node')).toHaveCount(1)
      await expect(window.locator('.workspace-agent-item')).toHaveCount(1)

      const taskStatus = taskNode.locator('[data-testid="task-node-status-select"]')
      await expect(taskStatus).toHaveValue('doing')

      const persisted = await window.evaluate(key => {
        const raw = window.localStorage.getItem(key)
        if (!raw) {
          return null
        }

        const parsed = JSON.parse(raw) as {
          workspaces?: Array<{
            nodes?: Array<{
              kind?: string
              title?: string
              task?: {
                requirement?: string
                autoGeneratedTitle?: boolean
              }
            }>
          }>
        }

        return parsed.workspaces?.[0]?.nodes?.find(node => node.kind === 'task') ?? null
      }, storageKey)

      expect(persisted).toBeTruthy()
      expect(persisted?.task?.requirement).toContain('exponential backoff')
      expect(persisted?.task?.autoGeneratedTitle).toBe(true)
    } finally {
      await electronApp.close()
    }
  })

  test('supports agent controls and sidebar navigation', async () => {
    const { electronApp, window } = await launchApp()

    try {
      await clearAndSeedWorkspace(window, [
        {
          id: 'terminal-nav-node',
          title: 'terminal-1',
          position: { x: 120, y: 120 },
          width: 460,
          height: 300,
          kind: 'terminal',
        },
        {
          id: 'agent-nav-node',
          title: 'codex · gpt-5.2-codex',
          position: { x: 1400, y: 980 },
          width: 520,
          height: 320,
          kind: 'agent',
          status: 'running',
          startedAt: '2026-02-08T15:00:00.000Z',
          endedAt: null,
          exitCode: null,
          lastError: null,
          agent: {
            provider: 'codex',
            prompt: 'Implement resilient retry logic',
            model: 'gpt-5.2-codex',
            effectiveModel: 'gpt-5.2-codex',
            launchMode: 'new',
            resumeSessionId: '019c3e32-52ff-7b00-94ac-e6c5a56b4aa4',
            executionDirectory: testWorkspacePath,
            directoryMode: 'workspace',
            customDirectory: null,
            shouldCreateDirectory: false,
          },
        },
      ])

      const agentItem = window.locator('.workspace-agent-item').first()
      await expect(agentItem).toBeVisible()

      const viewport = window.locator('.react-flow__viewport')
      const beforeTransform = await viewport.getAttribute('style')
      await agentItem.click()
      await window.waitForTimeout(350)
      const afterTransform = await viewport.getAttribute('style')
      expect(afterTransform).not.toBe(beforeTransform)

      const agentNode = window
        .locator('.terminal-node')
        .filter({ has: window.locator('.terminal-node__title', { hasText: 'codex' }) })
        .first()

      await expect(agentNode).toBeVisible()
      await expect(agentNode.locator('.terminal-node__status')).toHaveText('Running')

      await agentNode.locator('.terminal-node__action', { hasText: 'Stop' }).click()
      await expect(agentNode.locator('.terminal-node__status')).toHaveText('Stopped')

      await agentNode.locator('.terminal-node__action', { hasText: 'Rerun' }).click()
      await expect(agentNode.locator('.terminal-node__status')).toHaveText(/Restoring|Running/)

      await expect(agentNode.locator('.terminal-node__status')).toHaveText('Running')

      await agentNode.locator('.terminal-node__action', { hasText: 'Resume' }).click()
      await expect(agentNode.locator('.terminal-node__status')).toHaveText(/Restoring|Running/)
      await expect(agentNode.locator('.terminal-node__status')).toHaveText('Running')
    } finally {
      await electronApp.close()
    }
  })
})
