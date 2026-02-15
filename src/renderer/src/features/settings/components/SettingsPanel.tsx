import React, { useMemo, useState } from 'react'
import {
  AGENT_PROVIDER_LABEL,
  AGENT_PROVIDERS,
  CANVAS_INPUT_MODES,
  resolveAgentModel,
  resolveTaskTitleProvider,
  type AgentProvider,
  type AgentSettings,
  type CanvasInputMode,
  type TaskTitleProvider,
} from '../agentConfig'

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
  onRefreshProviderModels: (provider: AgentProvider) => void
  onChange: (settings: AgentSettings) => void
  onClose: () => void
}

type SettingsSectionId = 'general' | 'canvas' | 'task-title' | 'task-tags' | 'model-override'

interface SettingsSection {
  id: SettingsSectionId
  title: string
  anchorId: string
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'general',
    title: 'General',
    anchorId: 'settings-section-general',
  },
  {
    id: 'canvas',
    title: 'Canvas',
    anchorId: 'settings-section-canvas',
  },
  {
    id: 'task-title',
    title: 'Task Title',
    anchorId: 'settings-section-task-title',
  },
  {
    id: 'task-tags',
    title: 'Task Tags',
    anchorId: 'settings-section-task-tags',
  },
  {
    id: 'model-override',
    title: 'Model Override',
    anchorId: 'settings-section-model-override',
  },
]

function createInitialInputState(): Record<AgentProvider, string> {
  return {
    'claude-code': '',
    codex: '',
  }
}

export function SettingsPanel({
  settings,
  modelCatalogByProvider,
  onRefreshProviderModels,
  onChange,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const [addModelInputByProvider, setAddModelInputByProvider] = useState<
    Record<AgentProvider, string>
  >(() => createInitialInputState())
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>('general')
  const [addTaskTagInput, setAddTaskTagInput] = useState('')

  const updateDefaultProvider = (provider: AgentProvider): void => {
    onChange({
      ...settings,
      defaultProvider: provider,
    })
  }

  const updateTaskTitleProvider = (provider: TaskTitleProvider): void => {
    onChange({
      ...settings,
      taskTitleProvider: provider,
    })
  }

  const updateTaskTitleModel = (model: string): void => {
    onChange({
      ...settings,
      taskTitleModel: model,
    })
  }

  const updateNormalizeZoomOnTerminalClick = (enabled: boolean): void => {
    onChange({
      ...settings,
      normalizeZoomOnTerminalClick: enabled,
    })
  }

  const updateCanvasInputMode = (mode: CanvasInputMode): void => {
    onChange({
      ...settings,
      canvasInputMode: mode,
    })
  }

  const updateTaskTagOptions = (nextTags: string[]): void => {
    onChange({
      ...settings,
      taskTagOptions: nextTags,
    })
  }

  const removeTaskTagOption = (tag: string): void => {
    if (!settings.taskTagOptions.includes(tag)) {
      return
    }

    const nextTags = settings.taskTagOptions.filter(option => option !== tag)
    if (nextTags.length === 0) {
      return
    }

    updateTaskTagOptions(nextTags)
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
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: true,
      },
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: model,
      },
    })
  }

  const removeCustomModelOption = (provider: AgentProvider, model: string): void => {
    const currentOptions = settings.customModelOptionsByProvider[provider]
    if (!currentOptions.includes(model)) {
      return
    }

    const nextOptions = currentOptions.filter(option => option !== model)
    const currentSelected = settings.customModelByProvider[provider]

    onChange({
      ...settings,
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: currentSelected === model ? '' : currentSelected,
      },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })
  }

  const updateAddModelInput = (provider: AgentProvider, value: string): void => {
    setAddModelInputByProvider(prev => ({
      ...prev,
      [provider]: value,
    }))
  }

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
      customModelEnabledByProvider: {
        ...settings.customModelEnabledByProvider,
        [provider]: true,
      },
      customModelByProvider: {
        ...settings.customModelByProvider,
        [provider]: candidate,
      },
      customModelOptionsByProvider: {
        ...settings.customModelOptionsByProvider,
        [provider]: nextOptions,
      },
    })

    setAddModelInputByProvider(prev => ({
      ...prev,
      [provider]: '',
    }))
  }

  const selectedModel =
    resolveAgentModel(settings, settings.defaultProvider) ?? 'Default (Follow CLI)'

  const effectiveTaskTitleProvider = useMemo(() => {
    return resolveTaskTitleProvider(settings)
  }, [settings])

  const scrollToSection = (section: SettingsSection): void => {
    setActiveSectionId(section.id)
    const element = document.getElementById(section.anchorId)
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div
      className="settings-backdrop"
      onClick={() => {
        onClose()
      }}
    >
      <section
        className="settings-panel"
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="settings-panel__header">
          <h2>Settings</h2>
          <button
            type="button"
            className="settings-panel__close"
            onClick={() => {
              onClose()
            }}
          >
            ×
          </button>
        </div>

        <div className="settings-panel__layout">
          <aside className="settings-panel__sidebar" aria-label="Settings Sections">
            {SETTINGS_SECTIONS.map(section => {
              const isActive = section.id === activeSectionId

              return (
                <button
                  key={section.id}
                  type="button"
                  className={`settings-panel__nav-button${isActive ? ' settings-panel__nav-button--active' : ''}`}
                  data-testid={`settings-section-nav-${section.id}`}
                  onClick={() => {
                    scrollToSection(section)
                  }}
                >
                  {section.title}
                </button>
              )
            })}
          </aside>

          <div className="settings-panel__content">
            <div className="settings-panel__section" id="settings-section-general">
              <label htmlFor="settings-default-provider">Default Agent</label>
              <select
                id="settings-default-provider"
                value={settings.defaultProvider}
                onChange={event => {
                  updateDefaultProvider(event.target.value as AgentProvider)
                }}
              >
                {AGENT_PROVIDERS.map(provider => (
                  <option value={provider} key={provider}>
                    {AGENT_PROVIDER_LABEL[provider]}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-panel__section" id="settings-section-canvas">
              <h3>Canvas Interaction</h3>
              <div className="settings-panel__row">
                <span>Input Mode</span>
                <select
                  id="settings-canvas-input-mode"
                  data-testid="settings-canvas-input-mode"
                  value={settings.canvasInputMode}
                  onChange={event => {
                    updateCanvasInputMode(event.target.value as CanvasInputMode)
                  }}
                >
                  {CANVAS_INPUT_MODES.map(mode => (
                    <option key={mode} value={mode}>
                      {mode === 'auto'
                        ? 'Auto (Detect from gestures)'
                        : mode === 'trackpad'
                          ? 'Trackpad (Drag selects)'
                          : 'Mouse (Shift+Drag selects)'}
                    </option>
                  ))}
                </select>
              </div>
              <label className="settings-provider-card__toggle">
                <input
                  id="settings-normalize-zoom-on-terminal-click"
                  data-testid="settings-normalize-zoom-on-terminal-click"
                  type="checkbox"
                  checked={settings.normalizeZoomOnTerminalClick}
                  onChange={event => {
                    updateNormalizeZoomOnTerminalClick(event.target.checked)
                  }}
                />
                <span>Click terminal auto-zooms canvas to 100%</span>
              </label>
              <p className="settings-panel__hint">
                Auto mode infers trackpad vs mouse from wheel and pinch input. If detection does not
                match your hardware, choose a fixed mode.
              </p>
            </div>

            <div className="settings-panel__section" id="settings-section-task-title">
              <h3>Task Title Generation</h3>
              <div className="settings-panel__row">
                <span>CLI Provider</span>
                <select
                  id="settings-task-title-provider"
                  data-testid="settings-task-title-provider"
                  value={settings.taskTitleProvider}
                  onChange={event => {
                    updateTaskTitleProvider(event.target.value as TaskTitleProvider)
                  }}
                >
                  <option value="default">
                    Follow Default Agent ({AGENT_PROVIDER_LABEL[settings.defaultProvider]})
                  </option>
                  {AGENT_PROVIDERS.map(provider => (
                    <option value={provider} key={provider}>
                      {AGENT_PROVIDER_LABEL[provider]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="settings-panel__row">
                <span>Model (optional)</span>
                <input
                  id="settings-task-title-model"
                  data-testid="settings-task-title-model"
                  value={settings.taskTitleModel}
                  placeholder="Leave empty to follow CLI default model"
                  onChange={event => {
                    updateTaskTitleModel(event.target.value)
                  }}
                />
              </div>

              <p className="settings-panel__hint">
                Effective provider: {AGENT_PROVIDER_LABEL[effectiveTaskTitleProvider]}
              </p>
            </div>

            <div className="settings-panel__section" id="settings-section-task-tags">
              <h3>Task Tags</h3>

              <div
                className="settings-provider-card__model-list"
                data-testid="settings-task-tag-list"
              >
                {settings.taskTagOptions.map(tag => (
                  <div className="settings-provider-card__model-item" key={tag}>
                    <span className="settings-provider-card__model-radio">
                      <span>{tag}</span>
                    </span>
                    <button
                      type="button"
                      className="settings-provider-card__model-remove"
                      data-testid={`settings-task-tag-remove-${tag}`}
                      disabled={settings.taskTagOptions.length <= 1}
                      onClick={() => {
                        removeTaskTagOption(tag)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="settings-provider-card__add-row">
                <input
                  type="text"
                  data-testid="settings-task-tag-add-input"
                  value={addTaskTagInput}
                  placeholder="Example: perf"
                  onChange={event => {
                    setAddTaskTagInput(event.target.value)
                  }}
                  onKeyDown={event => {
                    if (event.key !== 'Enter') {
                      return
                    }

                    event.preventDefault()
                    addTaskTagOption()
                  }}
                />
                <button
                  type="button"
                  data-testid="settings-task-tag-add-button"
                  disabled={addTaskTagInput.trim().length === 0}
                  onClick={() => {
                    addTaskTagOption()
                  }}
                >
                  Add
                </button>
              </div>

              <p className="settings-panel__hint">
                Tasks can only select from this list; AI generation also picks from this list.
              </p>
            </div>

            <div className="settings-panel__section" id="settings-section-model-override">
              <h3>Model Override</h3>
              {AGENT_PROVIDERS.map(provider => {
                const modelCatalog = modelCatalogByProvider[provider]
                const customEnabled = settings.customModelEnabledByProvider[provider]
                const customModel = settings.customModelByProvider[provider]
                const customOptions = settings.customModelOptionsByProvider[provider]

                const allModels = [
                  ...new Set(
                    [...modelCatalog.models, ...customOptions, customModel]
                      .map(model => model.trim())
                      .filter(model => model.length > 0),
                  ),
                ]

                const addInputValue = addModelInputByProvider[provider]
                const addInputPlaceholder =
                  provider === 'codex'
                    ? 'Example: gpt-5.2-codex'
                    : 'Example: claude-sonnet-4-5-20250929'

                return (
                  <article className="settings-provider-card" key={provider}>
                    <div className="settings-provider-card__header">
                      <strong>{AGENT_PROVIDER_LABEL[provider]}</strong>
                      <button
                        type="button"
                        className="settings-provider-card__refresh"
                        disabled={modelCatalog.isLoading}
                        onClick={() => {
                          onRefreshProviderModels(provider)
                        }}
                      >
                        {modelCatalog.isLoading ? 'Refreshing...' : 'Refresh Models'}
                      </button>
                    </div>

                    <label className="settings-provider-card__toggle">
                      <input
                        type="checkbox"
                        data-testid={`settings-custom-model-enabled-${provider}`}
                        checked={customEnabled}
                        onChange={event => {
                          updateProviderCustomModelEnabled(provider, event.target.checked)
                        }}
                      />
                      <span>Use custom model (unchecked = follow CLI default)</span>
                    </label>

                    <div
                      className="settings-provider-card__model-list"
                      data-testid={`settings-model-list-${provider}`}
                    >
                      {allModels.length === 0 ? (
                        <p className="settings-provider-card__empty">
                          No models yet. Add one below.
                        </p>
                      ) : (
                        allModels.map(model => {
                          const isCustomOption = customOptions.includes(model)

                          return (
                            <div className="settings-provider-card__model-item" key={model}>
                              <label className="settings-provider-card__model-radio">
                                <input
                                  type="radio"
                                  name={`settings-model-${provider}`}
                                  checked={customModel === model}
                                  onChange={() => {
                                    selectProviderModel(provider, model)
                                  }}
                                />
                                <span>{model}</span>
                              </label>

                              {isCustomOption ? (
                                <button
                                  type="button"
                                  className="settings-provider-card__model-remove"
                                  onClick={() => {
                                    removeCustomModelOption(provider, model)
                                  }}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>

                    <div className="settings-provider-card__add-row">
                      <input
                        type="text"
                        data-testid={`settings-custom-model-add-input-${provider}`}
                        value={addInputValue}
                        placeholder={addInputPlaceholder}
                        onChange={event => {
                          updateAddModelInput(provider, event.target.value)
                        }}
                        onKeyDown={event => {
                          if (event.key !== 'Enter') {
                            return
                          }

                          event.preventDefault()
                          addCustomModelOption(provider)
                        }}
                      />
                      <button
                        type="button"
                        data-testid={`settings-custom-model-add-button-${provider}`}
                        disabled={addInputValue.trim().length === 0}
                        onClick={() => {
                          addCustomModelOption(provider)
                        }}
                      >
                        Add
                      </button>
                    </div>

                    <div className="settings-provider-card__meta">
                      <span>
                        Source: {modelCatalog.source ?? 'N/A'} · {modelCatalog.models.length} models
                      </span>
                      {modelCatalog.error ? (
                        <span className="settings-provider-card__error">
                          Error: {modelCatalog.error}
                        </span>
                      ) : modelCatalog.fetchedAt ? (
                        <span>
                          Updated: {new Date(modelCatalog.fetchedAt).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span>Waiting for first fetch...</span>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>

            <p className="settings-panel__hint">
              Current default: {AGENT_PROVIDER_LABEL[settings.defaultProvider]} · {selectedModel}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
