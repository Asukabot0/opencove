import { app, shell, BrowserWindow } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { hydrateCliPathForPackagedApp } from './infrastructure/env/CliEnvironment'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'

let ipcDisposable: ReturnType<typeof registerIpcHandlers> | null = null

if (process.env.NODE_ENV === 'test' && process.env['COVE_TEST_USER_DATA_DIR']) {
  app.setPath('userData', resolve(process.env['COVE_TEST_USER_DATA_DIR']))
} else if (app.isPackaged === false) {
  const wantsSharedUserData =
    isTruthyEnv(process.env['COVE_DEV_USE_SHARED_USER_DATA']) ||
    process.argv.includes('--cove-shared-user-data') ||
    process.argv.includes('--shared-user-data')

  if (!wantsSharedUserData) {
    const explicitDevUserDataDir = process.env['COVE_DEV_USER_DATA_DIR']
    const defaultUserDataDir = app.getPath('userData')
    const devUserDataDir = explicitDevUserDataDir
      ? resolve(explicitDevUserDataDir)
      : `${defaultUserDataDir}-dev`

    app.setPath('userData', devUserDataDir)
  }
}

const EXTERNAL_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:', 'mailto:'])
const E2E_OFFSCREEN_COORDINATE = -50_000
type E2EWindowMode = 'normal' | 'inactive' | 'hidden' | 'offscreen'

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl.trim())
  } catch {
    return null
  }
}

function shouldOpenUrlExternally(rawUrl: string): boolean {
  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return false
  }

  return EXTERNAL_PROTOCOL_ALLOWLIST.has(parsed.protocol)
}

function resolveDevRendererOrigin(): string | null {
  const raw = process.env['ELECTRON_RENDERER_URL']
  if (!raw) {
    return null
  }

  const parsed = parseUrl(raw)
  return parsed ? parsed.origin : null
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)

  if (relativePath === '') {
    return true
  }

  if (relativePath === '..') {
    return false
  }

  if (relativePath.startsWith(`..${sep}`)) {
    return false
  }

  if (isAbsolute(relativePath)) {
    return false
  }

  return true
}

function isAllowedFileNavigation(parsed: URL, rendererRootDir: string): boolean {
  let filePath: string

  try {
    filePath = fileURLToPath(parsed)
  } catch {
    return false
  }

  const normalizedRoot = resolve(rendererRootDir)
  const normalizedTarget = resolve(filePath)
  return isPathWithinRoot(normalizedRoot, normalizedTarget)
}

function isAllowedNavigationTarget(
  rawUrl: string,
  devOrigin: string | null,
  rendererRootDir: string,
): boolean {
  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return false
  }

  if (devOrigin && parsed.origin === devOrigin) {
    return true
  }

  if (!devOrigin && parsed.protocol === 'file:') {
    return isAllowedFileNavigation(parsed, rendererRootDir)
  }

  return false
}

function isTruthyEnv(rawValue: string | undefined): boolean {
  if (!rawValue) {
    return false
  }

  return rawValue === '1' || rawValue.toLowerCase() === 'true'
}

function parseE2EWindowMode(rawValue: string | undefined): E2EWindowMode | null {
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.toLowerCase()
  if (
    normalized === 'normal' ||
    normalized === 'inactive' ||
    normalized === 'hidden' ||
    normalized === 'offscreen'
  ) {
    return normalized
  }

  return null
}

function resolveE2EWindowMode(): E2EWindowMode {
  if (process.env['NODE_ENV'] !== 'test') {
    return 'normal'
  }

  const explicitMode = parseE2EWindowMode(process.env['COVE_E2E_WINDOW_MODE'])
  if (explicitMode) {
    return explicitMode
  }

  // Backward compatibility: keep honoring old no-focus flag.
  if (isTruthyEnv(process.env['COVE_E2E_NO_FOCUS'])) {
    return 'inactive'
  }

  return 'normal'
}

function createWindow(): void {
  const devOrigin = is.dev ? resolveDevRendererOrigin() : null
  const rendererRootDir = join(__dirname, '../renderer')
  const e2eWindowMode = resolveE2EWindowMode()
  const keepRendererActiveInBackground = e2eWindowMode !== 'normal'
  const keepRendererActiveWhenHidden = e2eWindowMode === 'hidden'
  const placeWindowOffscreen = e2eWindowMode === 'offscreen'
  const disableRendererSandboxForTests = process.env['NODE_ENV'] === 'test'

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    ...(keepRendererActiveWhenHidden ? { paintWhenInitiallyHidden: true } : {}),
    ...(placeWindowOffscreen ? { x: E2E_OFFSCREEN_COORDINATE, y: E2E_OFFSCREEN_COORDINATE } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !disableRendererSandboxForTests,
      ...(keepRendererActiveInBackground ? { backgroundThrottling: false } : {}),
    },
  })

  mainWindow.on('ready-to-show', () => {
    if (e2eWindowMode === 'hidden') {
      return
    }

    if (e2eWindowMode === 'offscreen') {
      mainWindow.setPosition(E2E_OFFSCREEN_COORDINATE, E2E_OFFSCREEN_COORDINATE, false)
      mainWindow.showInactive()
      return
    }

    if (e2eWindowMode === 'inactive') {
      mainWindow.showInactive()
      return
    }

    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(details => {
    if (shouldOpenUrlExternally(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationTarget(url, devOrigin, rendererRootDir)) {
      return
    }

    event.preventDefault()

    if (shouldOpenUrlExternally(url)) {
      void shell.openExternal(url)
    }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  hydrateCliPathForPackagedApp(app.isPackaged === true)

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcDisposable = registerIpcHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ipcDisposable?.dispose()
    ipcDisposable = null

    app.quit()
  }
})

app.on('before-quit', () => {
  ipcDisposable?.dispose()
  ipcDisposable = null
})
