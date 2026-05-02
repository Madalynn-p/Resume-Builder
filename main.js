import './server.js';
import { app as electronApp, BrowserWindow, shell } from 'electron';

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 850,
        minWidth: 900,
        minHeight: 700,
        title: 'Resume.Pro',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    win.loadURL('http://localhost:8000/resume');

    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

electronApp.whenReady().then(() => {
    setTimeout(createWindow, 500);

    electronApp.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

electronApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electronApp.quit();
    }
});
