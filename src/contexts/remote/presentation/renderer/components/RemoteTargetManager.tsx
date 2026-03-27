import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { useAppStore } from '@app/renderer/shell/store/useAppStore'
import type {
  RemoteTargetDto,
  CreateRemoteTargetInput,
  SshConnectResult,
  SshConnectError,
} from '@shared/contracts/dto/remote'

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface RemoteTargetManagerProps {
  workspaceId: string
}

export function RemoteTargetManager({ workspaceId }: RemoteTargetManagerProps) {
  const { t } = useTranslation()
  const [targets, setTargets] = useState<RemoteTargetDto[]>([])
  const [showForm, setShowForm] = useState(false)
  const [connectionStates, setConnectionStates] = useState<Map<string, ConnectionStatus>>(new Map())
  const [connectionErrors, setConnectionErrors] = useState<Map<string, string>>(new Map())
  const [importError, setImportError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const { setPendingSshSession, setIsSettingsOpen } = useAppStore()

  const loadTargets = useCallback(async () => {
    const result = (await window.opencoveApi.remote.listTargets(workspaceId)) as RemoteTargetDto[]
    setTargets(result)
  }, [workspaceId])

  useEffect(() => {
    void loadTargets()
  }, [loadTargets])

  const handleCreate = useCallback(
    async (input: CreateRemoteTargetInput) => {
      await window.opencoveApi.remote.createTarget(input)
      setShowForm(false)
      await loadTargets()
    },
    [loadTargets],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.opencoveApi.remote.deleteTarget({ id })
      await loadTargets()
    },
    [loadTargets],
  )

  const handleImport = useCallback(async () => {
    setImportError(null)
    setImportMessage(null)
    try {
      const result = await window.opencoveApi.remote.importSshConfig({ workspaceId })
      const res = result as {
        imported?: number
        skipped?: number
        overwritten?: number
        error?: string
        message?: string
      }
      if (res.error) {
        setImportError(res.message ?? res.error)
      } else {
        await loadTargets()
        const imported = res.imported ?? 0
        const skipped = res.skipped ?? 0
        const overwritten = res.overwritten ?? 0
        if (imported === 0 && skipped === 0 && overwritten === 0) {
          setImportMessage(t('remote.noTargets') + ' (~/.ssh/config)')
        } else {
          setImportMessage(t('remote.importResult', { imported, skipped, overwritten }))
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }, [workspaceId, loadTargets, t])

  const handleConnect = useCallback(
    async (target: RemoteTargetDto) => {
      setConnectionStates(prev => new Map(prev).set(target.id, 'connecting'))
      setConnectionErrors(prev => {
        const next = new Map(prev)
        next.delete(target.id)
        return next
      })

      try {
        const result = await window.opencoveApi.ssh.connect({
          targetId: target.id,
          cols: 80,
          rows: 24,
        })

        if ('sessionId' in (result as SshConnectResult)) {
          setConnectionStates(prev => new Map(prev).set(target.id, 'connected'))
          setPendingSshSession({
            sessionId: (result as SshConnectResult).sessionId,
            targetName: target.name,
            targetId: target.id,
          })
          setIsSettingsOpen(false)
        } else {
          const err = result as SshConnectError
          setConnectionStates(prev => new Map(prev).set(target.id, 'error'))
          setConnectionErrors(prev => new Map(prev).set(target.id, err.message))
        }
      } catch (err) {
        setConnectionStates(prev => new Map(prev).set(target.id, 'error'))
        setConnectionErrors(prev =>
          new Map(prev).set(target.id, err instanceof Error ? err.message : String(err)),
        )
      }
    },
    [setPendingSshSession, setIsSettingsOpen],
  )

  return (
    <div className="settings-panel__section" id="settings-section-remote">
      <h3 className="settings-panel__section-title">{t('remote.title')}</h3>

      <div className="settings-panel__subsection">
        <div className="settings-panel__subsection-header">
          <strong>{t('remote.title')}</strong>
          <span>{t('remote.noTargets')}</span>
        </div>

        <div className="settings-list-container" data-testid="remote-targets-list">
          {targets.map(target => {
            const status = connectionStates.get(target.id) ?? 'idle'
            const error = connectionErrors.get(target.id)
            return (
              <div key={target.id}>
                <div className="settings-list-item">
                  <span className="settings-panel__value">
                    {target.name}
                    <span style={{ marginLeft: 8, opacity: 0.5 }}>
                      {target.username}@{target.host}:{target.port}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="primary"
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                      disabled={status === 'connecting'}
                      onClick={() => handleConnect(target)}
                    >
                      {status === 'connecting'
                        ? t('remote.connectionStatus.connecting')
                        : status === 'connected'
                          ? t('remote.connectionStatus.connected')
                          : t('remote.connect')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                      onClick={() => handleDelete(target.id)}
                    >
                      {t('remote.deleteTarget')}
                    </button>
                  </div>
                </div>
                {status === 'error' && error ? (
                  <p style={{ padding: '4px 12px', fontSize: '12px', color: 'var(--cove-error)' }}>
                    {error}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {importError ? (
          <p style={{ fontSize: '12px', color: 'var(--cove-error)' }}>{importError}</p>
        ) : null}
        {importMessage ? (
          <p style={{ fontSize: '12px', color: 'var(--cove-text-muted)' }}>{importMessage}</p>
        ) : null}

        <div className="settings-panel__input-row">
          <button type="button" className="secondary" onClick={handleImport}>
            {t('remote.importSshConfig')}
          </button>
          <button type="button" className="primary" onClick={() => setShowForm(true)}>
            {t('remote.addTarget')}
          </button>
        </div>
      </div>

      {showForm ? (
        <RemoteTargetForm
          workspaceId={workspaceId}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
    </div>
  )
}

function RemoteTargetForm({
  workspaceId,
  onSave,
  onCancel,
}: {
  workspaceId: string
  onSave: (input: CreateRemoteTargetInput) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !host.trim() || !username.trim()) {
      return
    }
    onSave({
      workspaceId,
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
    })
  }, [workspaceId, name, host, port, username, onSave])

  return (
    <div className="settings-panel__subsection">
      <div className="settings-panel__subsection-header">
        <strong>{t('remote.addTarget')}</strong>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('remote.name')}</strong>
        </div>
        <div className="settings-panel__control">
          <input
            type="text"
            className="cove-field"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('remote.name')}
          />
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('remote.host')}</strong>
        </div>
        <div className="settings-panel__control">
          <div className="settings-panel__input-row">
            <input
              type="text"
              className="cove-field"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder={t('remote.host')}
            />
            <input
              type="text"
              className="cove-field"
              style={{ maxWidth: 80 }}
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder={t('remote.port')}
            />
          </div>
        </div>
      </div>

      <div className="settings-panel__row">
        <div className="settings-panel__row-label">
          <strong>{t('remote.username')}</strong>
        </div>
        <div className="settings-panel__control">
          <input
            type="text"
            className="cove-field"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t('remote.username')}
          />
        </div>
      </div>

      <div className="settings-panel__input-row">
        <button type="button" className="secondary" onClick={onCancel}>
          {t('remote.cancel')}
        </button>
        <button type="button" className="primary" onClick={handleSubmit}>
          {t('remote.save')}
        </button>
      </div>
    </div>
  )
}
