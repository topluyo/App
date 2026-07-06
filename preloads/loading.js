// preloads/loading.js
const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    ipcRenderer.send("close");
  };
  document.body.classList.add("electron-app");
});
