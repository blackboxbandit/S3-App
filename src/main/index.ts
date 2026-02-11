import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers, bindProgressToWindow } from './ipc-handlers'

function createWindow(): BrowserWindow {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'S3 Client',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#0f0f1a',
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    // Show window when ready to avoid flash
    mainWindow.on('ready-to-show', () => {
        mainWindow.show()
    })

    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Only allow http/https URLs to prevent protocol handler abuse
        if (/^https?:\/\//i.test(url)) {
            shell.openExternal(url)
        }
        return { action: 'deny' }
    })

    // Load the renderer
    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return mainWindow
}

app.whenReady().then(() => {
    const mainWindow = createWindow()

    // Register IPC handlers exactly once (they are global singletons)
    registerIpcHandlers(mainWindow)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            const win = createWindow()
            // Re-bind only the progress callback to the new window
            bindProgressToWindow(win)
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
