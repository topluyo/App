// preloads/oss.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    ipcRenderer.send("close");
  };
  document.body.classList.add("electron-app");
});

try {
  contextBridge.exposeInMainWorld("electronAPI", {
    getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url)
  });
} catch (e) {
  window.electronAPI = {
    getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url)
  };
}
