import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { RemoteTargetDto, CreateRemoteTargetInput } from '@shared/contracts/dto/remote'

interface RemoteTargetManagerProps {
  workspaceId: string
}

export function RemoteTargetManager({ workspaceId }: RemoteTargetManagerProps) {
  const { t } = useTranslation()
  const [targets, setTargets] = useState<RemoteTargetDto[]>([])
  const [showForm, setShowForm] = useState(false)

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
    await window.opencoveApi.remote.importSshConfig({ workspaceId })
    await loadTargets()
  }, [workspaceId, loadTargets])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-200">{t('remote.title')}</h3>
        <div className="flex gap-1.5">
          <button
            onClick={handleImport}
            className="rounded px-2 py-0.5 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          >
            {t('remote.importSshConfig')}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500"
          >
            {t('remote.addTarget')}
          </button>
        </div>
      </div>

      {targets.length === 0 && !showForm && (
        <p className="text-xs text-neutral-500">{t('remote.noTargets')}</p>
      )}

      {showForm && (
        <RemoteTargetForm
          workspaceId={workspaceId}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="space-y-1">
        {targets.map(target => (
          <div
            key={target.id}
            className="flex items-center justify-between rounded bg-neutral-800 px-3 py-2"
          >
            <div>
              <span className="text-sm text-neutral-200">{target.name}</span>
              <span className="ml-2 text-xs text-neutral-500">
                {target.username}@{target.host}:{target.port}
              </span>
            </div>
            <button
              onClick={() => handleDelete(target.id)}
              className="text-xs text-neutral-500 hover:text-red-400"
            >
              {t('remote.deleteTarget')}
            </button>
          </div>
        ))}
      </div>
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
    if (!name.trim() || !host.trim() || !username.trim()) {return}
    onSave({
      workspaceId,
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
    })
  }, [workspaceId, name, host, port, username, onSave])

  return (
    <div className="space-y-2 rounded border border-neutral-700 bg-neutral-800/50 p-3">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={t('remote.name')}
        className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-blue-500"
      />
      <div className="flex gap-2">
        <input
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder={t('remote.host')}
          className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-blue-500"
        />
        <input
          value={port}
          onChange={e => setPort(e.target.value)}
          placeholder={t('remote.port')}
          className="w-20 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-blue-500"
        />
      </div>
      <input
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder={t('remote.username')}
        className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-blue-500"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
        >
          {t('remote.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
        >
          {t('remote.save')}
        </button>
      </div>
    </div>
  )
}
