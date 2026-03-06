import React from 'react'
import {
  CANVAS_INPUT_MODES,
  MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT,
  MAX_TERMINAL_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT,
  MIN_TERMINAL_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  type CanvasInputMode,
} from '../../agentConfig'

export function CanvasSection(props: {
  canvasInputMode: CanvasInputMode
  normalizeZoomOnTerminalClick: boolean
  defaultTerminalWindowScalePercent: number
  terminalFontSize: number
  uiFontSize: number
  onChangeCanvasInputMode: (mode: CanvasInputMode) => void
  onChangeNormalizeZoomOnTerminalClick: (enabled: boolean) => void
  onChangeDefaultTerminalWindowScalePercent: (percent: number) => void
  onChangeTerminalFontSize: (size: number) => void
  onChangeUiFontSize: (size: number) => void
}): React.JSX.Element {
  const {
    canvasInputMode,
    normalizeZoomOnTerminalClick,
    defaultTerminalWindowScalePercent,
    terminalFontSize,
    uiFontSize,
    onChangeCanvasInputMode,
    onChangeNormalizeZoomOnTerminalClick,
    onChangeDefaultTerminalWindowScalePercent,
    onChangeTerminalFontSize,
    onChangeUiFontSize,
  } = props

  return (
    <div className="settings-panel__section" id="settings-section-canvas">
      <h3 className="settings-panel__section-title">Canvas & UI</h3>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>Input Mode</strong>
          <span>How interactions are handled on the canvas.</span>
        </div>
        <div className="settings-panel__control">
          <select
            id="settings-canvas-input-mode"
            data-testid="settings-canvas-input-mode"
            value={canvasInputMode}
            onChange={event => onChangeCanvasInputMode(event.target.value as CanvasInputMode)}
          >
            {CANVAS_INPUT_MODES.map(mode => (
              <option key={mode} value={mode}>
                {mode === 'auto' ? 'Auto (Smart)' : mode === 'trackpad' ? 'Trackpad' : 'Mouse'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>Initial Window Size</strong>
        </div>
        <div className="settings-panel__control" style={{ alignItems: 'center', gap: '8px' }}>
          <input
            style={{ width: '80px' }}
            type="number"
            min={MIN_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT}
            max={MAX_DEFAULT_TERMINAL_WINDOW_SCALE_PERCENT}
            value={defaultTerminalWindowScalePercent}
            onChange={event =>
              onChangeDefaultTerminalWindowScalePercent(Number(event.target.value))
            }
          />
          <span style={{ fontSize: '12px', color: '#666' }}>%</span>
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>Terminal Font Size</strong>
        </div>
        <div className="settings-panel__control" style={{ alignItems: 'center', gap: '8px' }}>
          <input
            style={{ width: '80px' }}
            type="number"
            min={MIN_TERMINAL_FONT_SIZE}
            max={MAX_TERMINAL_FONT_SIZE}
            value={terminalFontSize}
            onChange={event => onChangeTerminalFontSize(Number(event.target.value))}
          />
          <span style={{ fontSize: '12px', color: '#666' }}>px</span>
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>Interface Font Size</strong>
        </div>
        <div className="settings-panel__control" style={{ alignItems: 'center', gap: '8px' }}>
          <input
            style={{ width: '80px' }}
            type="number"
            min={MIN_UI_FONT_SIZE}
            max={MAX_UI_FONT_SIZE}
            value={uiFontSize}
            onChange={event => onChangeUiFontSize(Number(event.target.value))}
          />
          <span style={{ fontSize: '12px', color: '#666' }}>px</span>
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>Auto-zoom on Click</strong>
          <span>Zoom to 100% when a terminal is clicked.</span>
        </div>
        <div className="settings-panel__control">
          <label className="cove-toggle">
            <input
              type="checkbox"
              data-testid="settings-normalize-zoom-on-terminal-click"
              checked={normalizeZoomOnTerminalClick}
              onChange={event => onChangeNormalizeZoomOnTerminalClick(event.target.checked)}
            />
            <span className="cove-toggle__slider"></span>
          </label>
        </div>
      </div>
    </div>
  )
}
