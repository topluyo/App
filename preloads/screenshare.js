// preloads/screenshare.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("electron-app");
});

contextBridge.exposeInMainWorld("closeWindow", () => ipcRenderer.send("close"));

contextBridge.exposeInMainWorld("stream", {
  getSources: () => ipcRenderer.invoke("getSources"),
  setSource: (data) =>
    ipcRenderer.invoke("setSource", { id:data.id, isAudioEnabled:data.audio }),
});
