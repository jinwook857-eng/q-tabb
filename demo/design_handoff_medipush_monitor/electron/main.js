const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1280,
    title: 'Medi-Push One — Smart Monitoring',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });

  // Web Serial: Electron에서는 포트 선택 다이얼로그가 없으므로 첫 포트를 자동 승인.
  win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    const arduino = portList.find(p => /arduino|usb|wch|ch340/i.test((p.displayName || '') + (p.portName || ''))) || portList[0];
    callback(arduino ? arduino.portId : '');
  });
  win.webContents.session.setPermissionCheckHandler(() => true);
  win.webContents.session.setDevicePermissionHandler(() => true);

  win.loadFile(path.join(__dirname, '..', 'Medi-Push Monitor.dc.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

/* ── 방법 2: node-serialport 사용 시 ──
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const port = new SerialPort({ path: 'COM3', baudRate: 9600 });
port.pipe(new ReadlineParser({ delimiter: '\n' }))
    .on('data', line => win.webContents.send('serial-line', line.trim()));
*/
