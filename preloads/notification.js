// preloads/notification.js
const { ipcRenderer, contextBridge } = require("electron");

let isClosing = false;

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    isClosing = true;
    ipcRenderer.send("notification:close"); 
  };
  document.body.classList.add("electron-app");

  window.addEventListener("mousedown", () => {
    setTimeout(() => {
      if (!isClosing) {
        ipcRenderer.send("notification:click");
      }
    }, 50);
  });
});

try {
  contextBridge.exposeInMainWorld("NotificationClose", () => {
    isClosing = true;
    ipcRenderer.send('notification:close');
  });
  contextBridge.exposeInMainWorld("NotificationResponse", (obj) => ipcRenderer.send('notification:event', obj));
} catch (e) {
  window.NotificationClose = () => {
    isClosing = true;
    ipcRenderer.send('notification:close');
  };
  window.NotificationResponse = (obj) => ipcRenderer.send('notification:event', obj);
}
