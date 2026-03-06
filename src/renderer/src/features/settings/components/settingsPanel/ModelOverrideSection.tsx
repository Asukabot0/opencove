import React from 'react'
import {
  AGENT_PROVIDERS,
  AGENT_PROVIDER_LABEL,
  type AgentProvider,
  type AgentSettings,
} from '../../agentConfig'

interface ProviderModelCatalogEntry {
  models: string[]
  source: string | null
  fetchedAt: string | null
  isLoading: boolean
  error: string | null
}

export function ModelOverrideSection(props: {
  settings: AgentSettings
  modelCatalogByProvider: Record<AgentProvider, ProviderModelCatalogEntry>
  addModelInputByProvider: Record<AgentProvider, string>
  onToggleCustomModelEnabled: (provider: AgentProvider, enabled: boolean) => void
  onSelectProviderModel: (provider: AgentProvider, model: string) => void
  onRemoveCustomModelOption: (provider: AgentProvider, model: string) => void
  onChangeAddModelInput: (provider: AgentProvider, value: string) => void
  onAddCustomModelOption: (provider: AgentProvider) => void
}): React.JSX.Element {
  const {
    settings,
    onToggleCustomModelEnabled,
    onSelectProviderModel,
    onRemoveCustomModelOption,
    onChangeAddModelInput,
    onAddCustomModelOption,
    modelCatalogByProvider,
    addModelInputByProvider,
  } = props

  return (
    <div
      className="settings-panel__section settings-panel__section--vertical"
      id="settings-section-model-override"
    >
      <h3 className="settings-panel__section-title">Model Overrides</h3>

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

        return (
          <div
            className="settings-provider-card"
            key={provider}
            style={{
              borderTop: 'none',
              padding: '24px 0',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div className="settings-provider-card__header">
              <strong style={{ fontSize: '14px', color: '#fff' }}>
                {AGENT_PROVIDER_LABEL[provider]}
              </strong>
            </div>

            <div className="settings-panel__row settings-panel__row--horizontal">
              <div className="settings-panel__row-label">
                <strong>Use Custom Model</strong>
              </div>
              <div className="settings-panel__control">
                <label className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid={`settings-custom-model-enabled-${provider}`}
                    checked={customEnabled}
                    onChange={event => onToggleCustomModelEnabled(provider, event.target.checked)}
                  />
                  <span className="cove-toggle__slider"></span>
                </label>
              </div>
            </div>

            {customEnabled && (
              <div style={{ marginTop: '8px' }}>
                <div
                  className="settings-list-container"
                  data-testid={`settings-model-list-${provider}`}
                >
                  {allModels.map(model => (
                    <div className="settings-list-item" key={model}>
                      <label className="settings-list-item__left">
                        <input
                          type="radio"
                          name={`settings-model-${provider}`}
                          checked={customModel === model}
                          onChange={() => onSelectProviderModel(provider, model)}
                        />
                        <span>{model}</span>
                      </label>
                      {customOptions.includes(model) && (
                        <button
                          type="button"
                          className="secondary"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => onRemoveCustomModelOption(provider, model)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', width: '100%' }}>
                  <input
                    type="text"
                    style={{ flex: 1 }}
                    data-testid={`settings-custom-model-add-input-${provider}`}
                    value={addInputValue}
                    placeholder="Add model..."
                    onChange={event => onChangeAddModelInput(provider, event.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onAddCustomModelOption(provider)}
                  />
                  <button
                    type="button"
                    className="primary"
                    data-testid={`settings-custom-model-add-button-${provider}`}
                    disabled={addInputValue.trim().length === 0}
                    onClick={() => onAddCustomModelOption(provider)}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {modelCatalog.error && (
              <div style={{ marginTop: '12px', fontSize: '11px', color: '#ff4d4d' }}>
                Error: {modelCatalog.error}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
