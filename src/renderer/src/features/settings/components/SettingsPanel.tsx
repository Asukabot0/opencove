import React, { useMemo, useState } from 'react'
import {
  resolveTaskTitleProvider,
  type AgentProvider,
  type AgentSettings,
  type CanvasInputMode,
  type TaskTitleProvider,
} from '../agentConfig'
import { CanvasSection } from './settingsPanel/CanvasSection'
import { GeneralSection } from './settingsPanel/GeneralSection'
import { ModelOverrideSection } from './settingsPanel/ModelOverrideSection'
import { TaskTagsSection } from './settingsPanel/TaskTagsSection'
import { TaskTitleSection } from './settingsPanel/TaskTitleSection'
import { WorkspaceSection } from './settingsPanel/WorkspaceSection'
import type { WorkspaceState } from '../../workspace/types'

interface ProviderModelCatalogEntry {
  models: string[]
  source: string | null
  fetchedAt: string | null
  isLoading: boolean
  error: string | null
}

interface SettingsPanelProps {
  settings: AgentSettings
  modelCatalogByProvider: Record<AgentProvider, ProviderModelCatalogEntry>
  workspaces: WorkspaceState[]
  onWorkspaceWorktreesRootChange: (workspaceId: string, worktreesRoot: string) => void
  onChange: (settings: AgentSettings) => void
  onClose: () => void
}

type CoreSectionId = 'general' | 'canvas' | 'task-tags'
type SettingsSectionId = CoreSectionId | string

function createInitialInputState(): Record<AgentProvider, string> {
  return { 'claude-code': '', codex: '' }
}

function getFolderName(path: string): string {
  const parts = path.split(/[/]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function SettingsPanel({
  settings,
  modelCatalogByProvider,
  workspaces,
  onWorkspaceWorktreesRootChange,
  onChange,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const [addModelInputByProvider, setAddModelInputByProvider] = useState<
    Record<AgentProvider, string>
  >(() => createInitialInputState())
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>('general')
  const [addTaskTagInput, setAddTaskTagInput] = useState('')

  const updateDefaultProvider = (provider: AgentProvider): void =>
    onChange({ ...settings, defaultProvider: provider })
  const updateAgentFullAccess = (enabled: boolean): void =>
    onChange({ ...settings, agentFullAccess: enabled })
  const updateTaskTitleProvider = (provider: TaskTitleProvider): void =>
    onChange({ ...settings, taskTitleProvider: provider })
  const updateTaskTitleModel = (model: string): void =>
    onChange({ ...settings, taskTitleModel: model })
  const updateNormalizeZoomOnTerminalClick = (enabled: boolean): void =>
    onChange({ ...settings, normalizeZoomOnTerminalClick: enabled })
  const updateCanvasInputMode = (mode: CanvasInputMode): void =>
    onChange({ ...settings, canvasInputMode: mode })
  const updateDefaultTerminalWindowScalePercent = (percent: number): void =>
    onChange({ ...settings, defaultTerminalWindowScalePercent: percent })
  const updateTerminalFontSize = (fontSize: number): void =>
    onChange({ ...settings, terminalFontSize: Math.round(fontSize) })
  const updateUiFontSize = (fontSize: number): void =>
    onChange({ ...settings, uiFontSize: fontSize })
  const updateTaskTagOptions = (nextTags: string[]): void =>
    onChange({ ...settings, taskTagOptions: nextTags })

  const removeTaskTagOption = (tag: string): void => {
    const nextTags = settings.taskTagOptions.filter(option => option !== tag)
    if (nextTags.length > 0) {
      updateTaskTagOptions(nextTags)
    }
  }

  const addTaskTagOption = (): void => {
    const candidate = addTaskTagInput.trim()
    if (candidate.length === 0) {
      return
    }

    const nextTags = settings.taskTagOptions.includes(candidate)
      ? settings.taskTagOptions
      : [...settings.taskTagOptions, candidate]
    updateTaskTagOptions(nextTags)
    setAddTaskTagInput('')
  }

  const updateProviderCustomModelEnabled = (provider: AgentProvider, enabled: boolean): void => {
    onChange({
      ...settings,
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: enabled,
      },
    })
  }

  const selectProviderModel = (provider: AgentProvider, model: string): void => {
    onChange({
      ...settings,
      customModelEnabledByProvider: { ...settings.customModelEnabledByProvider, [provider]: true },
      customModelByProvider: { ...settings.customModelByProvider, [provider]: model },
    })
  }

  const removeCustomModelOption = (provider: AgentProvider, model: string): void => {
    const currentOptions = settings.customModelOptionsByProvider[provider]
    if (!currentOptions.includes(model)) {
      return
    }

    const nextOptions = currentOptions.filter(option => option !== model)
    onChange({
      ...settings,
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]:
          settings.customModelByProvider[provider] === model
            ? ''
            : settings.customModelByProvider[provider],
      },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })
  }

  const updateAddModelInput = (provider: AgentProvider, value: string): void =>
    setAddModelInputByProvider(prev => ({ ...prev, [provider]: value }))

  const addCustomModelOption = (provider: AgentProvider): void => {
    const candidate = addModelInputByProvider[provider].trim()
    if (candidate.length === 0) {
      return
    }

    const existingOptions = settings.customModelOptionsByProvider[provider]
    const nextOptions = existingOptions.includes(candidate)
      ? existingOptions
      : [...existingOptions, candidate]
    onChange({
      ...settings,
      customModelEnabledByProvider: { ...settings.customModelEnabledByProvider, [provider]: true },
      customModelByProvider: { ...settings.customModelByProvider, [provider]: candidate },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })
    setAddModelInputByProvider(prev => ({ ...prev, [provider]: '' }))
  }

  const effectiveTaskTitleProvider = useMemo(() => resolveTaskTitleProvider(settings), [settings])

  const scrollToSection = (id: SettingsSectionId, targetId: string): void => {
    setActiveSectionId(id)
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        block: 'start',
        behavior: 'auto',
      })
    })
  }

  const NavButton = ({
    id,
    label,
    targetId,
    testId,
  }: {
    id: SettingsSectionId
    label: string
    targetId: string
    testId?: string
  }) => {
    const isActive = activeSectionId === id
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={() => scrollToSection(id, targetId)}
        className={`settings-panel__nav-button${isActive ? ' settings-panel__nav-button--active' : ''}`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <section className="settings-panel" onClick={e => e.stopPropagation()}>
        <aside className="settings-panel__sidebar">
          <NavButton
            id="general"
            label="General"
            targetId="settings-section-general"
            testId="settings-section-nav-general"
          />
          <NavButton
            id="canvas"
            label="Canvas"
            targetId="settings-section-canvas"
            testId="settings-section-nav-canvas"
          />
          <NavButton
            id="task-tags"
            label="Task Tags"
            targetId="settings-section-task-tags"
            testId="settings-section-nav-task-tags"
          />

          <div style={{ marginTop: '24px', padding: '0 16px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#444',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Projects
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '8px' }}>
            {workspaces.map(workspace => (
              <NavButton
                key={workspace.id}
                id={workspace.id}
                label={
                  workspace.name.trim().length > 0 ? workspace.name : getFolderName(workspace.path)
                }
                targetId={`settings-section-workspace-${workspace.id}`}
              />
            ))}
          </div>
        </aside>

        <div className="settings-panel__content-wrapper">
          <div className="settings-panel__header">
            <h2>Settings</h2>
            <button type="button" className="settings-panel__close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="settings-panel__content">
            <GeneralSection
              defaultProvider={settings.defaultProvider}
              agentFullAccess={settings.agentFullAccess}
              onChangeDefaultProvider={updateDefaultProvider}
              onChangeAgentFullAccess={updateAgentFullAccess}
            />
            <CanvasSection
              canvasInputMode={settings.canvasInputMode}
              normalizeZoomOnTerminalClick={settings.normalizeZoomOnTerminalClick}
              defaultTerminalWindowScalePercent={settings.defaultTerminalWindowScalePercent}
              terminalFontSize={settings.terminalFontSize}
              uiFontSize={settings.uiFontSize}
              onChangeCanvasInputMode={updateCanvasInputMode}
              onChangeNormalizeZoomOnTerminalClick={updateNormalizeZoomOnTerminalClick}
              onChangeDefaultTerminalWindowScalePercent={updateDefaultTerminalWindowScalePercent}
              onChangeTerminalFontSize={updateTerminalFontSize}
              onChangeUiFontSize={updateUiFontSize}
            />
            <TaskTitleSection
              defaultProvider={settings.defaultProvider}
              taskTitleProvider={settings.taskTitleProvider}
              taskTitleModel={settings.taskTitleModel}
              effectiveTaskTitleProvider={effectiveTaskTitleProvider}
              onChangeTaskTitleProvider={updateTaskTitleProvider}
              onChangeTaskTitleModel={updateTaskTitleModel}
            />
            <ModelOverrideSection
              settings={settings}
              modelCatalogByProvider={modelCatalogByProvider}
              addModelInputByProvider={addModelInputByProvider}
              onToggleCustomModelEnabled={updateProviderCustomModelEnabled}
              onSelectProviderModel={selectProviderModel}
              onRemoveCustomModelOption={removeCustomModelOption}
              onChangeAddModelInput={updateAddModelInput}
              onAddCustomModelOption={addCustomModelOption}
            />
            <TaskTagsSection
              tags={settings.taskTagOptions}
              addTaskTagInput={addTaskTagInput}
              onChangeAddTaskTagInput={setAddTaskTagInput}
              onAddTag={addTaskTagOption}
              onRemoveTag={removeTaskTagOption}
            />
            {workspaces.map(workspace => (
              <WorkspaceSection
                key={workspace.id}
                sectionId={`settings-section-workspace-${workspace.id}`}
                workspaceName={workspace.name}
                workspacePath={workspace.path}
                worktreesRoot={workspace.worktreesRoot}
                onChangeWorktreesRoot={root => onWorkspaceWorktreesRootChange(workspace.id, root)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
