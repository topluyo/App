// preloads/loading.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("electron-app");
});

contextBridge.exposeInMainWorld("closeWindow", () => ipcRenderer.send("close"));
