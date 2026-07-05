// preloads/notification.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    ipcRenderer.send("notification:close"); // we handle close ourselves in NotificationManager
  };
  document.body.classList.add("electron-app");
});

try {
  contextBridge.exposeInMainWorld("NotificationClose", () => ipcRenderer.send('notification:close'));
  contextBridge.exposeInMainWorld("NotificationResponse", (obj) => ipcRenderer.send('notification:event', obj));
} catch (e) {
  window.NotificationClose = () => ipcRenderer.send('notification:close');
  window.NotificationResponse = (obj) => ipcRenderer.send('notification:event', obj);
}
