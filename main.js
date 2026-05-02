// Had codex do this but I explain what it does 
// Starts the local server before the Electron window opens.
// This imports the resume page which is created on the server.js file
import './server.js'

// Import Electron tools:
// electronApp controls the app lifecycle,
// BrowserWindow creates the desktop window,
// shell opens external links in the default browser.
import { app as electronApp, BrowserWindow, shell } from 'electron'

// Creates the main desktop application window.
function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 850,
        minWidth: 900,
        minHeight: 700,
        title: 'Resume.Pro',

        // Security settings for the web page loaded inside Electron.
        webPreferences: {
            // Prevents the loaded page from directly using Node.js APIs.
            nodeIntegration: false,

            // Keeps the browser page isolated from Electron internals.
            contextIsolation: true
        }
    })

    // Loads the resume page from the local server.
    win.loadURL('http://localhost:8000/resume')

    // Handles links that try to open a new window.
    win.webContents.setWindowOpenHandler(({ url }) => {
        // Opens the link in the user's default browser instead.
        shell.openExternal(url)

        // Prevents Electron from opening a new app window.
        return { action: 'deny' };
    })
}

// Waits until Electron is fully ready before creating the window.
electronApp.whenReady().then(() => {
    // Gives the local server a short moment to start before loading the page.
    setTimeout(createWindow, 500)

    // On macOS, clicking the dock icon should reopen the app
    // if all windows were previously closed.
    electronApp.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// Runs when all app windows are closed.
electronApp.on('window-all-closed', () => {
    // On Windows/Linux, quit the app completely.
    // On macOS, apps usually stay open until the user quits manually.
    if (process.platform !== 'darwin') {
        electronApp.quit()
    }
})
