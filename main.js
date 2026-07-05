const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const windowStateKeeper = require("electron-window-state");
const { createMainWindow } = require("./Windows");
const { openExternalLinks, ossWindow } = require("./utils");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { uIOhook, UiohookKey } = require('uiohook-napi');

let currentPttKey = 'G'; // default

function sendErrorToFrontend(error, type = 'uncaughtException') {
  try {
    const errorData = {
      message: error.message || String(error),
      stack: error.stack,
      type: type,
      os: os.platform(),
      osRelease: os.release(),
      arch: os.arch(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron
    };

    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send('electron-error', errorData);
      }
    });
  } catch (e) {
    console.error('Error sending error to frontend:', e);
  }
}

let captureModule = null;
try {
  captureModule = require("electron-native-screenshare");
} catch (e) {
  console.log("Native capture module not available yet:", e.message);
}

// Windows Store detection
const isWindowsStore = process.env.WINDOWS_STORE === 'true' || process.windowsStore || false;

// Store versiyonu için error handling (artık hepsi için genel)
process.on('uncaughtException', (error) => {
  console.log('Uncaught Exception:', error);
  sendErrorToFrontend(error, 'uncaughtException');
  if (isWindowsStore) return; // Store versiyonunda crash etme
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection:', reason);
  sendErrorToFrontend(reason instanceof Error ? reason : new Error(String(reason)), 'unhandledRejection');
  if (isWindowsStore) return; // Store versiyonunda crash etme
});


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
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("topluyo", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("topluyo");
  }
} else if (process.platform === "linux" && !isWindowsStore) {
  // Store versiyonunda Linux script'i çalıştırma
  try {
    require("./linuxscript");
  } catch (error) {
    console.log('Linux script not available:', error.message);
  }
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
    openExternalLinks(url);
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

  // Push-to-talk initialization
  uIOhook.on('keydown', (e) => {
    try {
      if (e.keycode === UiohookKey[currentPttKey]) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          if (win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('ptt-status-change', true);
          }
        });
      }
    } catch (err) {
      console.error("uIOhook keydown error:", err);
      sendErrorToFrontend(err, 'uIOhookError');
    }
  });

  uIOhook.on('keyup', (e) => {
    try {
      if (e.keycode === UiohookKey[currentPttKey]) {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          if (win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('ptt-status-change', false);
          }
        });
      }
    } catch (err) {
      console.error("uIOhook keyup error:", err);
      sendErrorToFrontend(err, 'uIOhookError');
    }
  });

  try {
    uIOhook.start();
  } catch (err) {
    console.error("uIOhook failed to start:", err);
    sendErrorToFrontend(err, 'uIOhookError');
  }
});

if (process.platform === "darwin") {
  app.on("open-url", (event, url) => {
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
  try { uIOhook.stop(); } catch(e) {}
  if (process.platform === "win32") {
    app.quit();
  } else {
    app.exit();
  }
});

app.on("will-quit", () => {
  try { uIOhook.stop(); } catch(e) {}
});

ipcMain.handle('set-ptt-key', (event, newKey) => {
  if (typeof newKey !== 'string') return false;
  const upperKey = newKey.toUpperCase();
  if(UiohookKey[upperKey] !== undefined) {
    currentPttKey = upperKey;
    return currentPttKey;
  }
  return false;
});

ipcMain.on("open-oss", () => {
  ossWindow();
});

// OSS kütüphanelerini al
ipcMain.handle("get-oss-libraries", async () => {
  try {
    const packageJsonPath = path.join(__dirname, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const libraries = [];

    // Lisans dosyasını okuma fonksiyonu
    const readLicenseFile = (packagePath) => {
      const possibleLicenseFiles = [
        'LICENSE',
        'LICENSE.txt',
        'LICENSE.md',
        'LICENCE',
        'LICENCE.txt',
        'LICENCE.md',
        'license',
        'license.txt',
        'license.md'
      ];

      for (const fileName of possibleLicenseFiles) {
        const licensePath = path.join(packagePath, fileName);
        if (fs.existsSync(licensePath)) {
          try {
            return fs.readFileSync(licensePath, 'utf8').trim();
          } catch (error) {
            console.error(`Error reading license file ${licensePath}:`, error);
          }
        }
      }
      return null;
    };

    // Ana uygulama bilgisi
    const mainLicenseText = readLicenseFile(__dirname);
    libraries.push({
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description || "Topluyo Desktop Uygulaması",
      license: packageJson.license || "MIT",
      licenseText: mainLicenseText,
      homepage: "https://topluyo.com",
      repository: null
    });

    // Dependencies
    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        try {
          const depPackagePath = path.join(__dirname, "node_modules", name);
          const depPackageJsonPath = path.join(depPackagePath, "package.json");

          if (fs.existsSync(depPackageJsonPath)) {
            const depPackage = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
            const licenseText = readLicenseFile(depPackagePath);

            libraries.push({
              name: depPackage.name,
              version: depPackage.version,
              description: depPackage.description || `${name} kütüphanesi`,
              license: depPackage.license || "Belirtilmemiş",
              licenseText: licenseText,
              homepage: depPackage.homepage || null,
              repository: depPackage.repository?.url || depPackage.repository || null
            });
          } else {
            // Paket dosyası yoksa temel bilgilerle ekle
            libraries.push({
              name: name,
              version: version.replace(/[\^~>=<]/, ''),
              description: `${name} kütüphanesi`,
              license: "Belirtilmemiş",
              licenseText: null,
              homepage: null,
              repository: null
            });
          }
        } catch (error) {
          console.error(`Error reading package info for ${name}:`, error);
        }
      }
    }

    // DevDependencies (sadece production'da değilse)
    if (packageJson.devDependencies && process.env.NODE_ENV === 'development') {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        try {
          const depPackagePath = path.join(__dirname, "node_modules", name);
          const depPackageJsonPath = path.join(depPackagePath, "package.json");

          if (fs.existsSync(depPackageJsonPath)) {
            const depPackage = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
            const licenseText = readLicenseFile(depPackagePath);

            libraries.push({
              name: depPackage.name + " (dev)",
              version: depPackage.version,
              description: depPackage.description || `${name} geliştirme kütüphanesi`,
              license: depPackage.license || "Belirtilmemiş",
              licenseText: licenseText,
              homepage: depPackage.homepage || null,
              repository: depPackage.repository?.url || depPackage.repository || null
            });
          }
        } catch (error) {
          console.error(`Error reading dev package info for ${name}:`, error);
        }
      }
    }

    // Electron ve Node.js gibi sistem bileşenleri
    libraries.push({
      name: "Electron",
      version: process.versions.electron,
      description: "Cross-platform desktop uygulamaları geliştirmek için kullanılan framework. Chromium ve Node.js teknolojilerini bir araya getirir.",
      license: "MIT",
      licenseText: `MIT License

Copyright (c) Electron contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
      homepage: "https://electronjs.org",
      repository: "https://github.com/electron/electron"
    });

    libraries.push({
      name: "Node.js",
      version: process.versions.node,
      description: "JavaScript runtime ortamı. Electron uygulamalarının backend işlemlerini yürütür.",
      license: "MIT",
      licenseText: `MIT License

Copyright Node.js contributors. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
      homepage: "https://nodejs.org",
      repository: "https://github.com/nodejs/node"
    });

    libraries.push({
      name: "Chromium",
      version: process.versions.chrome,
      description: "Electron'un temelini oluşturan açık kaynak web tarayıcı projesi. Web içeriklerinin render edilmesi için kullanılır.",
      license: "BSD-3-Clause",
      licenseText: `BSD 3-Clause License

Copyright (c) The Chromium Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`,
      homepage: "https://www.chromium.org",
      repository: "https://chromium.googlesource.com/chromium/src/"
    });

    return libraries;
  } catch (error) {
    console.error("Error reading OSS libraries:", error);
    throw error;
  }
});

// Harici link açma
ipcMain.handle("open-external", async (_, url) => {
  shell.openExternal(url);
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

ipcMain.handle("start-native-audio", (event) => {
  const sourceId = global.lastSelectedSource || "";
  console.log("start-native-audio invoked. Selected source:", sourceId);

  if (!captureModule || (captureModule.isAvailable && !captureModule.isAvailable())) {
    const errorMsg = captureModule && captureModule.getLoadError ? captureModule.getLoadError() : "Not loaded";
    console.warn("Native capture module not available:", errorMsg);
    
    // Minimum requirement: Win 10 or higher
    if (os.platform() === 'win32') {
      const releaseParts = os.release().split('.');
      if (parseInt(releaseParts[0]) >= 10) {
        sendErrorToFrontend(new Error(`Native screenshare failed to load but system meets minimum requirements (Win 10+). Error: ${errorMsg}`), 'screenshareError');
      }
    }
    return false;
  }

  // Find the actual Audio Service PID to exclude Topluyo's audio perfectly
  const { app } = require('electron');
  const metrics = app.getAppMetrics();
  const audioService = metrics.find(m => m.type === 'Utility' && m.name === 'Audio Service');
  let targetPid = audioService ? audioService.pid : process.pid; 
  let isIncludeMode = false;   // Default: Exclude Topluyo (Screen Share)

  if (sourceId.startsWith("window:")) {
    // e.g., "window:1575868:0"
    const parts = sourceId.split(":");
    if (parts.length >= 2) {
      const hwnd = parseInt(parts[1], 10);
      const pid = captureModule.getPidFromWindowHandle ? captureModule.getPidFromWindowHandle(hwnd) : 0;
      if (pid > 0) {
        targetPid = pid;
        isIncludeMode = true; // Only capture this application
        console.log(`Window Capture Mode: HWND=${hwnd}, PID=${pid}. We will ONLY capture this app's audio.`);
      }
    }
  } else {
    console.log(`Screen Capture Mode: Excluding Topluyo PID=${targetPid} to prevent echo.`);
  }

  if (captureModule.stopCapture) captureModule.stopCapture();

  try {
    return captureModule.startCapture(targetPid, isIncludeMode, (buffer, meta) => {
      try {
        if (event.senderFrame && !event.senderFrame.isDestroyed()) {
          event.senderFrame.send("native-audio-data", buffer, meta);
        } else if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("native-audio-data", buffer, meta);
        }
      } catch (e) {
        // Ignore if sender is destroyed
      }
    });
  } catch (err) {
    console.error("Native Audio Capture failed to start:", err);
    sendErrorToFrontend(err, 'screenshareError');
    return false; // Tells preload.js to fallback to Electron loopback
  }
});

ipcMain.handle("stop-native-audio", () => {
  if (captureModule && captureModule.stopCapture) {
    captureModule.stopCapture();
  }
  return true;
});
