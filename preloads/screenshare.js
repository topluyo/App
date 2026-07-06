// preloads/screenshare.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    ipcRenderer.send("close");
  };
  document.body.classList.add("electron-app");
});

try {
  contextBridge.exposeInMainWorld("stream", {
    getSources: () => ipcRenderer.invoke("getSources"),
    setSource: (data) =>
      ipcRenderer.invoke("setSource", { id:data.id, isAudioEnabled:data.audio }),
  });
} catch (e) {
  window.stream = {
    getSources: () => ipcRenderer.invoke("getSources"),
    setSource: (data) =>
      ipcRenderer.invoke("setSource", { id:data.id, isAudioEnabled:data.audio }),
  };
}
