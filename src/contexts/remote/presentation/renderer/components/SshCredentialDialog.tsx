import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { SshCredentialRequestDto } from '@shared/contracts/dto/remote'

export function SshCredentialDialog() {
  const { t } = useTranslation()
  const [request, setRequest] = useState<SshCredentialRequestDto | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = window.opencoveApi.ssh.onCredentialRequest((event: unknown) => {
      const req = event as SshCredentialRequestDto
      setRequest(req)
      setValue('')
    })
    return unsub
  }, [])

  useEffect(() => {
    if (request) {inputRef.current?.focus()}
  }, [request])

  const submit = useCallback(() => {
    if (!request) {return}
    window.opencoveApi.ssh.sendCredentialResponse({
      requestId: request.requestId,
      value,
    })
    setRequest(null)
    setValue('')
  }, [request, value])

  const cancel = useCallback(() => {
    if (!request) {return}
    window.opencoveApi.ssh.sendCredentialResponse({
      requestId: request.requestId,
      value: '',
      cancelled: true,
    })
    setRequest(null)
    setValue('')
  }, [request])

  if (!request) {return null}

  const prompt =
    request.type === 'password'
      ? t('remote.credential.passwordPrompt', { user: '', host: '' })
      : t('remote.credential.passphrasePrompt')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-lg bg-neutral-800 p-4 shadow-xl">
        <h3 className="mb-2 text-sm font-semibold text-neutral-100">
          {t('remote.credential.title')}
        </h3>
        <p className="mb-3 text-xs text-neutral-400">{request.prompt ?? prompt}</p>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {submit()}
            if (e.key === 'Escape') {cancel()}
          }}
          className="mb-3 w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-blue-500"
          autoComplete="off"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
          >
            {t('remote.credential.cancel')}
          </button>
          <button
            onClick={submit}
            className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
          >
            {t('remote.credential.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
