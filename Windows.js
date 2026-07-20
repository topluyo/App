const { BrowserWindow, session, app } = require("electron");
const path = require("path");
const log = require("electron-log");
const { mediaHandler } = require("./utils");

// Windows Store detection
const isWindowsStore = process.env.WINDOWS_STORE === 'true' || process.env.STOREBUILD === 'true';

// Store versiyonunda electron-updater yükleme
let autoUpdater = null;
if (!isWindowsStore) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
  } catch (error) {
    console.log("electron-updater not available in Store version");
  }
}

function createMainWindow(windowstate, url) {
  let mainWindow = new BrowserWindow({
    x: windowstate.x,
    y: windowstate.y,
    width: windowstate.width,
    height: windowstate.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: "#ffffff",
    icon: path.join(__dirname, "topluyo.png"),
    webPreferences: {
      devTools: process.env.NODE_ENV === "development",
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: true,
      preload: path.join(__dirname, "preloads/main.js"),
    },
  });

  // Başlangıçta loading ekranı yükle
  mainWindow.loadFile("loading.html");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });
  if (windowstate) windowstate.manage(mainWindow);
  if (!url) {
    mainWindow.webContents.once("did-finish-load", () => {
      // Store versiyonunda auto-updater çalıştırma
      if (!isWindowsStore) {
        checkForUpdatesAndLoad(mainWindow);
      } else {
        // Store versiyonunda direkt ana sayfayı yükle
        mainWindow.loadURL("https://topluyo.com");
      }
    });
  } else {
    url = url.startsWith("/") ? url : `/${url}`;
    mainWindow.loadURL("https://topluyo.com" + url);
  }

  mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
    console.error("Yükleme hatası:", code, desc);
  });

  session.defaultSession.setDisplayMediaRequestHandler(mediaHandler);
  //mainWindow.webContents.openDevTools();

  mainWindow.on("unresponsive", () => {
    console.error("Ana pencere yanıt vermiyor.");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-message", "❗ Ana pencere yanıt vermiyor.");
    }
  });

  mainWindow.on("closed", () => {
    // Close all remaining child windows when main window is destroyed
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== mainWindow && !win.isDestroyed()) {
        win.destroy();
      }
    });
    mainWindow = null;
  });
  return mainWindow;
}

function checkForUpdatesAndLoad(mainWindow) {
  // Desteklenmeyen ortamlarda (Store, development/paketlenmemiş veya AppImage olmayan Linux) güncellemeyi atla
  if (
    !autoUpdater ||
    isWindowsStore ||
    !app.isPackaged ||
    (process.platform === "linux" && !process.env.APPIMAGE)
  ) {
    console.log("Auto-updater not supported in this environment, loading main page...");
    mainWindow.loadURL("https://topluyo.com");
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = "info";
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("checking-for-update", () => {
    console.log("Güncellemeler kontrol ediliyor...");
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send(
      "update-message",
      "🔍 Güncellemeler kontrol ediliyor..."
    );
  });

  autoUpdater.on("update-available", () => {
    console.log("Güncellemeler kontrol ediliyor...");
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send(
      "update-message",
      "✅ Güncelleme bulundu. İndiriliyor..."
    );
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
    mainWindow.webContents.send(
      "update-message",
      "🎉 Güncelleme indirildi. Uygulama yeniden başlatılıyor..."
    );
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 2000);
  });

  autoUpdater.on("update-not-available", () => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    mainWindow.webContents.send(
      "update-message",
      "🚀 Güncel sürüm kullanılıyor."
    );
    setTimeout(() => {
      mainWindow.loadURL("https://topluyo.com");
    }, 1000);
  });

  autoUpdater.on("error", (err) => {
    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = "info";
    console.error("Güncelleme hatası:", err.message);
    mainWindow.webContents.send(
      "update-message",
      `❌ Güncelleme hatası: ${err.message}`
    );
    setTimeout(() => {
      mainWindow.loadURL("https://topluyo.com");
    }, 2000);
  });

  autoUpdater.checkForUpdates();
  //mainWindow.loadURL("https://topluyo.com");
}

exports.createMainWindow = createMainWindow;
exports.checkForUpdatesAndLoad = checkForUpdatesAndLoad;
