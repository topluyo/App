const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const windowStateKeeper = require("electron-window-state");
const { createMainWindow } = require("./Windows");
const { isSafeUrl, openExternalLinks } = require("./utils");
const { URL } = require("url");

let mainWindow = null;
let deeplinkingUrl = null;

const gotLock = app.requestSingleInstanceLock();
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("no-sandbox");
}

if (process.platform === "win32") {
  const exePath = process.execPath;
  const args = [process.argv[1]];
  if (!app.isDefaultProtocolClient("topluyo", exePath, args)) {
    app.setAsDefaultProtocolClient("topluyo", exePath, args);
  }
} else if (process.platform === "linux") {
  require("./linuxscript");
}

if (!gotLock) {
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", (event, commandLine) => {
    // Windows ve Linux için URL'yi al
    const url = commandLine.find((arg) => arg.startsWith("topluyo://"));
    if (url) {
      deeplinkingUrl = url;
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.loadURL(
          "https://topluyo.com" + url.replace("topluyo://", "/")
        );
      }
    }
  });
}

app.whenReady().then(() => {
  //* Load the previous state with fallback to defaults
  const mainWindowState = windowStateKeeper({
    defaultWidth: 800,
    defaultHeight: 600,
  });
  const initialUrlArg = process.argv.find((arg) =>
    arg.startsWith("topluyo://")
  );
  if (initialUrlArg) {
    deeplinkingUrl = initialUrlArg;
  }
  mainWindow = createMainWindow(
    mainWindowState,
    deeplinkingUrl ? deeplinkingUrl.replace("topluyo://", "/") : null
  );

  //* url handler

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log(url);
    const parsedUrl = new URL(url);
    if (
      (parsedUrl.hostname === "topluyo.com" ||
        parsedUrl.hostname === "www.topluyo.com") &&
      parsedUrl.pathname.startsWith("/!ads")
    ) {
      openExternalLinks(url);
      return { action: "deny" };
    } else if (
      (parsedUrl.hostname === "topluyo.com" ||
        parsedUrl.hostname === "www.topluyo.com") &&
      parsedUrl.search &&
      parsedUrl.search.includes("!login")
    ) {
      openExternalLinks(url);
      return { action: "deny" };
    } else if (url.startsWith("topluyo://")) {
      mainWindow.loadURL(url.replace("topluyo://", "https://topluyo.com/"));
      return { action: "deny" };
    } else {
      mainWindow.loadURL(url);
      return { action: "deny" };
    }
    // if (isSafeUrl(url)) {
    //   mainWindow.loadURL(url.replace("https://topluyo.com/", "/"));
    //   return { action: "deny" };
    // } else if (url.startsWith("topluyo://")) {
    //   mainWindow.loadURL(url.replace("https://topluyo.com/", "/"));
    //   return { action: "deny" };
    // } else if (url.startsWith("javascript:")) {
    //   return { action: "deny" };
    // } else {
    //   const parsedUrl = new URL(url);
    //   if (parsedUrl.search && parsedUrl.search.includes("!login")) {
    //     shell.openExternal(url);
    //   } else {
    //     dialog
    //       .showMessageBox({
    //         type: "warning",
    //         buttons: ["Evet", "Hayır"],
    //         defaultId: 1,
    //         cancelId: 1,
    //         title: "Dış Bağlantı Açılıyor",
    //         message: "Bu bağlantıyı açmak istiyor musunuz?\n" + url,
    //       })
    //       .then((response) => {
    //         if (response.response === 0) {
    //           openExternalLinks(url);
    //         }
    //       });
    //   }
    //   return { action: "deny" };
    //}
  });
});

if(process.platform === "darwin"){
  app.on("open-url",(event, url) => {
    event.preventDefault();
    deeplinkingUrl = url;
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.loadURL(
        "https://topluyo.com" + url.replace("topluyo://", "/")
      );
    }
  });
}

app.on("window-all-closed", function () {
  if (process.platform === "win32") {
    app.quit();
  } else {
    app.exit();
  }
});

ipcMain.on("minimize", () => {
  BrowserWindow.getFocusedWindow().minimize();
});
ipcMain.on("maximize", () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow.isMaximized()) {
    focusedWindow.unmaximize();
  } else {
    focusedWindow.maximize();
  }
});
ipcMain.on("close", () => {
  BrowserWindow.getFocusedWindow().close();
});
