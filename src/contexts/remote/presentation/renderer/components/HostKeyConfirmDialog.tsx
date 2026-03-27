import { useCallback, useState } from 'react'
import { useTranslation } from '@app/renderer/i18n'

export interface HostKeyConfirmProps {
  host: string
  fingerprint: string
  status: 'unknown' | 'mismatch'
  onAccept: () => void
  onReject: () => void
}

export function HostKeyConfirmDialog({
  host,
  fingerprint,
  status,
  onAccept,
  onReject,
}: HostKeyConfirmProps) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(false)

  const handleAccept = useCallback(() => {
    setDismissed(true)
    onAccept()
  }, [onAccept])

  const handleReject = useCallback(() => {
    setDismissed(true)
    onReject()
  }, [onReject])

  if (dismissed) {
    return null
  }

  const isMismatch = status === 'mismatch'
  const title = isMismatch ? t('remote.hostKey.mismatchTitle') : t('remote.hostKey.unknownTitle')
  const message = isMismatch
    ? t('remote.hostKey.mismatchMessage', { host })
    : t('remote.hostKey.unknownMessage', { host, fingerprint })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[420px] rounded-lg bg-neutral-800 p-4 shadow-xl">
        <h3
          className={`mb-2 text-sm font-semibold ${isMismatch ? 'text-red-400' : 'text-yellow-400'}`}
        >
          {title}
        </h3>
        <p className="mb-3 whitespace-pre-line text-xs text-neutral-300">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleReject}
            className="rounded px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
          >
            {t('remote.hostKey.reject')}
          </button>
          {!isMismatch && (
            <button
              onClick={handleAccept}
              className="rounded bg-yellow-600 px-3 py-1 text-xs text-white hover:bg-yellow-500"
            >
              {t('remote.hostKey.accept')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
