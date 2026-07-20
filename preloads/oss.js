// preloads/oss.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("electron-app");
});

contextBridge.exposeInMainWorld("closeWindow", () => ipcRenderer.send("close"));

contextBridge.exposeInMainWorld("electronAPI", {
  getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url)
});
