const { BrowserWindow, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const log = require("electron-log");
const { mediaHandler } = require("./utils");

function createMainWindow(windowstate, url) {
  let mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    frame: false,
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "topluyo.png"),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Başlangıçta loading ekranı yükle
  mainWindow.loadFile("loading.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  if (windowstate)
    windowstate.manage(mainWindow);
  if (!url) {
    mainWindow.webContents.once("did-finish-load", () => {
      checkForUpdatesAndLoad(mainWindow);
    });
  } else {
    url = url.startsWith("/") ? url : `/${url}`;
    mainWindow.loadURL("https://topluyo.com" + url);
  }

  mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
    console.error("Yükleme hatası:", code, desc);
  });

  session.defaultSession.setDisplayMediaRequestHandler(mediaHandler);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.on("unresponsive", () => {
    console.error("Ana pencere yanıt vermiyor.");
    mainWindow.webContents.send("update-message", "❗ Ana pencere yanıt vermiyor.");
  });
  mainWindow.on("closed",()=>{
    mainWindow = null;
  })
  return mainWindow;
}

function checkForUpdatesAndLoad(mainWindow) {

  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  console.log("calisiyor mu");

  autoUpdater.on("checking-for-update", () => {
    console.log("Güncellemeler kontrol ediliyor...");
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send("update-message", "🔍 Güncellemeler kontrol ediliyor...");
  });

  autoUpdater.on("update-available", () => {
    console.log("Güncellemeler kontrol ediliyor...");
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send("update-message", "✅ Güncelleme bulundu. İndiriliyor...");
  });

  autoUpdater.on("download-progress", (progressObj) => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    console.log("Güncellemeler kontrol ediliyor...");
    mainWindow.webContents.send("download-progress", {
      percent: progressObj.percent,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send("update-message", "🎉 Güncelleme indirildi. Uygulama yeniden başlatılıyor...");
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 2000);
  });

  autoUpdater.on("update-not-available", () => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send("update-message", "🚀 Güncel sürüm kullanılıyor.");
    setTimeout(() => {
      mainWindow.loadURL("https://topluyo.com");
    }, 1000);
  });

  autoUpdater.on("error", (err) => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    console.error("Güncelleme hatası:", err.message);
    mainWindow.webContents.send("update-message", `❌ Güncelleme hatası: ${err.message}`);
    setTimeout(() => {
      mainWindow.loadURL("https://topluyo.com");
    }, 2000);
  });

  autoUpdater.checkForUpdates();
}

exports.createMainWindow = createMainWindow;
exports.checkForUpdatesAndLoad = checkForUpdatesAndLoad;