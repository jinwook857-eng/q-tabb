const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

const WINDOW_WIDTH = 420;
const DEFAULT_WINDOW_HEIGHT = 760;
const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 640;
const WORK_AREA_MARGIN = 24;

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const initialWidth = Math.min(WINDOW_WIDTH, workAreaSize.width);
  const minHeight = Math.min(MIN_WINDOW_HEIGHT, workAreaSize.height);
  const initialHeight = Math.max(
    minHeight,
    Math.min(DEFAULT_WINDOW_HEIGHT, workAreaSize.height - WORK_AREA_MARGIN)
  );
  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: Math.min(MIN_WINDOW_WIDTH, workAreaSize.width),
    minHeight,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    title: 'Medi-Push One — Smart Monitoring',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Electron has no native Web Serial chooser. Prefer Arduino-compatible
  // USB devices, then approve the first available device as the reference does.
  win.webContents.session.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    const arduino = portList.find((port) =>
      /arduino|usb|wch|ch340/i.test(`${port.displayName || ''} ${port.portName || ''}`)
    );
    const selectedPort = arduino || portList[0];
    callback(selectedPort ? selectedPort.portId : '');
  });

  win.webContents.session.setPermissionCheckHandler(
    (_webContents, permission) => permission === 'serial'
  );
  win.webContents.session.setDevicePermissionHandler(
    (details) => details.deviceType === 'serial'
  );

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
