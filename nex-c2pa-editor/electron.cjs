const { app, BrowserWindow, protocol } = require('electron')
const { readFile } = require('node:fs/promises')
const { extname, resolve, sep } = require('node:path')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function registerAppProtocol() {
  const assetRoot = resolve(__dirname, 'dist')

  protocol.handle('app', async (request) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const assetPath = resolve(assetRoot, relativePath)

      if (assetPath !== assetRoot && !assetPath.startsWith(`${assetRoot}${sep}`)) {
        return new Response('Not found', { status: 404 })
      }

      const body = await readFile(assetPath)
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': mimeTypes[extname(assetPath).toLowerCase()] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: '#f2f2f2',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl) {
    window.loadURL(devServerUrl)
  } else {
    window.loadURL('app://app/')
  }
}

app.whenReady().then(() => {
  registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})