// preloads/notification.js
const { ipcRenderer, contextBridge } = require("electron");

let isClosing = false;

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("electron-app");

  window.addEventListener("mousedown", () => {
    setTimeout(() => {
      if (!isClosing) {
        ipcRenderer.send("notification:click");
      }
    }, 50);
  });
});

contextBridge.exposeInMainWorld("NotificationClose", () => {
  isClosing = true;
  ipcRenderer.send('notification:close');
});

contextBridge.exposeInMainWorld("closeWindow", () => {
  isClosing = true;
  ipcRenderer.send('notification:close');
});

contextBridge.exposeInMainWorld("NotificationResponse", (obj) => {
  ipcRenderer.send('notification:event', obj);
});
