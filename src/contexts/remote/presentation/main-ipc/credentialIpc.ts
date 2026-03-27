import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc/channels'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import type {
  SshCredentialRequestDto,
  SshCredentialResponseDto,
} from '../../../../shared/contracts/dto/remote'
import type {
  CredentialResolver,
  SshCredentialRequest,
} from '../../../../platform/process/ssh/SshAdapter'

const CREDENTIAL_TIMEOUT_MS = 60_000

interface PendingRequest {
  resolve: (response: SshCredentialResponseDto) => void
  reject: (error: Error) => void
  cleanup: () => void
  webContentsId: number
}

const pendingRequests = new Map<string, PendingRequest>()

/**
 * Creates a CredentialResolver that sends credential requests to a specific
 * webContents and waits for the response via IPC.
 */
export function createWebContentsCredentialResolver(webContents: WebContents): CredentialResolver {
  return async (request: SshCredentialRequest) => {
    const dto: SshCredentialRequestDto = {
      requestId: request.requestId,
      targetId: request.targetId,
      type: request.type,
      prompt: request.prompt,
      user: request.user,
      host: request.host,
    }

    return new Promise<SshCredentialResponseDto>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pending = pendingRequests.get(request.requestId)
        if (pending) {
          pending.cleanup()
          reject(new Error('Credential request timed out'))
        }
      }, CREDENTIAL_TIMEOUT_MS)

      const onDestroyed = () => {
        const pending = pendingRequests.get(request.requestId)
        if (pending) {
          pending.cleanup()
          reject(new Error('WebContents destroyed during credential request'))
        }
      }

      const cleanup = () => {
        clearTimeout(timeoutId)
        pendingRequests.delete(request.requestId)
        try {
          webContents.off('destroyed', onDestroyed)
        } catch {
          // webContents may already be destroyed
        }
      }

      pendingRequests.set(request.requestId, {
        resolve,
        reject,
        cleanup,
        webContentsId: webContents.id,
      })
      webContents.once('destroyed', onDestroyed)

      // Send credential request to the specific webContents
      webContents.send(IPC_CHANNELS.sshCredentialRequest, dto)
    })
  }
}

/**
 * Register the global credential response listener.
 * Must be called once during app startup.
 */
export function registerCredentialResponseHandler(): IpcRegistrationDisposable {
  const handler = (event: Electron.IpcMainEvent, response: unknown) => {
    if (!response || typeof response !== 'object') {
      return
    }
    const dto = response as SshCredentialResponseDto
    if (typeof dto.requestId !== 'string') {
      return
    }

    const pending = pendingRequests.get(dto.requestId)
    if (!pending) {
      return
    }

    // Verify the response comes from the expected webContents
    if (event.sender.id !== pending.webContentsId) {
      return
    }

    pending.cleanup()
    pending.resolve(dto)
  }

  ipcMain.on(IPC_CHANNELS.sshCredentialResponse, handler)

  return {
    dispose: () => {
      ipcMain.removeListener(IPC_CHANNELS.sshCredentialResponse, handler)
      // Reject all pending requests on dispose
      for (const [, pending] of pendingRequests) {
        pending.cleanup()
        pending.reject(new Error('Credential handler disposed'))
      }
      pendingRequests.clear()
    },
  }
}
