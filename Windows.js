const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
} = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const {mediaHandler} = require("./utils")

//* Main Window BrowserWindow
function createMainWindow(mainWindowState) {
  //* create Main Window Settings
  const mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    title: "Topluyo",
    frame: false,
    closable: true,
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "topluyo.png"),
    webPreferences: {
      allowRunningInsecureContent: true,
      enableRemoteModule: true,
      contextIsolation: false,
      preload: path.join(app.getAppPath(), "preload.js"),
    },
  });

  mainWindowState.manage(mainWindow);

  mainWindow.hide();

  session.defaultSession.setDisplayMediaRequestHandler(mediaHandler);

  ipcMain.on("set-Startup", (event, arg) => {
    app.setLoginItemSettings({
      openAtLogin: typeof arg === "boolean" ? arg : true,
    });
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("close", function (e) {
    e.preventDefault();
    mainWindow.destroy();
    if (process.platform !== "darwin") app.quit();
  });

  return mainWindow;
}
//* Loading Window BrowserWindow
function LoadingWindowCreate() {
  //* create Loading Window Settings
  const loadingWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    icon: path.join(app.getAppPath(), "topluyo.png"),
  });
  loadingWindow.loadFile("loading.html");
  loadingWindow.hide();
  loadingWindow.on("closed", (e) => {
    e.preventDefault();
    loadingWindow.destroy();
    if (process.platform !== "darwin") app.quit();
  });
  return loadingWindow;
}

const retryIntervals = [5000, 10000, 15000, 30000]; // first 4 retry intervals in ms
let currentRetry = 0;
//* Load Main Window
const loadMainWindow = (url, mainWindow, loadingWindow) => {
  mainWindow
    .loadURL("https://topluyo.com" + (url ? "/" + url : ""))
    .then(() => {
      loadingWindow.hide();
      mainWindow.show();
      if (url) {
        //* fix auto focus issue
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      currentRetry = 0;
    })
    .catch(() => {
      loadingWindow.show();
      mainWindow.hide();

      const retryDelay = retryIntervals[currentRetry] || 30000;
      currentRetry++;

      setTimeout(() => {
        loadMainWindow(url, mainWindow, loadingWindow);
      }, retryDelay);
    });
};

//* Update Window BrowserWindow
function createUpdateWindow() {
  const updateWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    icon: path.join(app.getAppPath(), "topluyo.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: false,
    },
  });
  updateWindow.loadFile("update.html");
  return updateWindow;
}

//* Check for Updates and Load Main Window with URL
function checkForUpdates(url, mainWindow, loadingWindow, mainWindowState) {
  const updateWindow = createUpdateWindow();
  if (process.env.NODE_ENV === "development" || process.env.STOREBUILD) {
    updateWindow.close();
    if (!mainWindow || !loadingWindow) {
      const mainWindow = createMainWindow(mainWindowState);
      const loadingWindow = LoadingWindowCreate();
      loadMainWindow(url, mainWindow, loadingWindow);
    } else {
      loadMainWindow(url, mainWindow, loadingWindow);
    }
    return;
  }
  autoUpdater.autoDownload = true; // Sessiz indir
  autoUpdater.autoInstallOnAppQuit = false; // Uygulama kapanmadan yükleme

  autoUpdater.on("checking-for-update", () => {
    updateWindow.webContents.send(
      "update-message",
      "🔍 Güncellemeler kontrol ediliyor..."
    );
  });

  autoUpdater.on("update-available", () => {
    updateWindow.webContents.send(
      "update-message",
      "✅ Güncelleme bulundu. İndirme başlatılıyor..."
    );
  });

  autoUpdater.on("error", (error) => {
    updateWindow.webContents.send(
      "update-message",
      "❌ Güncelleme hatası: " + error.message
    );

    if (error.message !== "net::ERR_INTERNET_DISCONNECTED" && error.message !== "net::ERR_NAME_NOT_RESERVED") {
      dialog.showMessageBox({
      type: "error",
      title: "Güncelleme Hatası",
      message: "Güncelleme sırasında bir hata oluştu. \n" + error.message,
      });
    }

    updateWindow.close();
    if (!mainWindow || !loadingWindow) {
      const mainWindow = createMainWindow(mainWindowState);
      const loadingWindow = LoadingWindowCreate();
      loadMainWindow(url, mainWindow, loadingWindow);
    } else {
      loadMainWindow(url, mainWindow, loadingWindow);
    }
  });

  autoUpdater.on("update-not-available", () => {
    updateWindow.webContents.send(
      "update-message",
      "🚀 Güncelleme bulunamadı."
    );
    updateWindow.close();
    if (!mainWindow || !loadingWindow) {
      const mainWindow = createMainWindow(mainWindowState);
      const loadingWindow = LoadingWindowCreate();
      loadMainWindow(url, mainWindow, loadingWindow);
    } else {
      loadMainWindow(url, mainWindow, loadingWindow);
    }
  });
  autoUpdater.on("download-progress", (progressObj) => {
    updateWindow.webContents.send("download-progress", {
      percent: progressObj.percent,
      speed: (progressObj.bytesPerSecond / 1024).toFixed(2) + " KB/s",
      totalSize: (progressObj.total / (1024 * 1024)).toFixed(2) + " MB",
    });
  });

  autoUpdater.on("update-downloaded", () => {
    updateWindow.webContents.send(
      "update-message",
      "🎉 Güncelleme indirildi. Uygulama yeniden başlatılıyor..."
    );

    setTimeout(() => {
      updateWindow.close();
      autoUpdater.quitAndInstall(true, true);
    }, 2000);
  });

  autoUpdater.checkForUpdates();
}

module.exports = {
  createMainWindow,
  LoadingWindowCreate,
  loadMainWindow,
  createUpdateWindow,
  checkForUpdates,
};
