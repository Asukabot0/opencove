import React from 'react'

export function TaskTagsSection(props: {
  tags: string[]
  addTaskTagInput: string
  onChangeAddTaskTagInput: (value: string) => void
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
}): React.JSX.Element {
  const { tags, addTaskTagInput, onChangeAddTaskTagInput, onAddTag, onRemoveTag } = props

  return (
    <div
      className="settings-panel__section settings-panel__section--vertical"
      id="settings-section-task-tags"
    >
      <h3 className="settings-panel__section-title">Task Tags</h3>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label" style={{ marginBottom: '8px' }}>
          <span>Common tags used to categorize and filter tasks.</span>
        </div>

        <div className="settings-list-container" data-testid="settings-task-tag-list">
          {tags.map(tag => (
            <div className="settings-list-item" key={tag}>
              <span style={{ fontSize: '13px', color: '#ccc' }}>{tag}</span>
              <button
                type="button"
                className="secondary"
                style={{ padding: '2px 8px', fontSize: '11px' }}
                data-testid={`settings-task-tag-remove-${tag}`}
                disabled={tags.length <= 1}
                onClick={() => onRemoveTag(tag)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%' }}>
          <input
            type="text"
            style={{ flex: 1 }}
            data-testid="settings-task-tag-add-input"
            value={addTaskTagInput}
            placeholder="Add new tag..."
            onChange={event => onChangeAddTaskTagInput(event.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAddTag()}
          />
          <button
            type="button"
            className="primary"
            data-testid="settings-task-tag-add-button"
            disabled={addTaskTagInput.trim().length === 0}
            onClick={() => onAddTag()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
