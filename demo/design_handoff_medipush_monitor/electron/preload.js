// 방법 2(node-serialport + IPC)를 쓸 때만 필요. Web Serial 사용 시 비워둬도 됨.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mediPush', {
  onSerialLine: (cb) => ipcRenderer.on('serial-line', (_e, line) => cb(line))
});
// 렌더러 측: window.mediPush?.onSerialLine(line => /* handleLine(line) 호출 */ 0);
