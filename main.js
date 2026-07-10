if (process.platform === "linux") { process.env.ELECTRON_DISABLE_SANDBOX = "1"; }
const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu } = require("electron");
const windowStateKeeper = require("electron-window-state");
const { createMainWindow } = require("./Windows");
const { openExternalLinks, ossWindow } = require("./utils");
const fs = require("fs");
const path = require("path");
const os = require("os");
let uIOhook = null, UiohookKey = null;
try {
  const uiohookNapi = require('uiohook-napi');
  uIOhook = uiohookNapi.uIOhook;
  UiohookKey = uiohookNapi.UiohookKey;
} catch (e) {
  console.log("uiohook-napi not available (Store build etc.):", e.message);
}

let currentPttKey = 'G'; // default
const notificationManager = require("./NotificationManager");

function sendErrorToFrontend(error, type = 'uncaughtException') {
  try {
    const extraDetails = {};
    if (error && typeof error === 'object') {
      ['name', 'code', 'errno', 'syscall', 'path'].forEach(key => {
        if (error[key] !== undefined) {
          let val = String(error[key]);
          if (key === 'path' && val.includes('\\Users\\')) {
            val = val.replace(/\\Users\\[^\\]+\\/i, '\\Users\\***\\');
          }
          extraDetails[key] = val;
        }
      });
    }

    const errorData = {
      message: error.message || String(error),
      stack: error.stack,
      type: type,
      os: os.platform(),
      osRelease: os.release(),
      arch: os.arch(),
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      isWindowsStore: process.env.WINDOWS_STORE === 'true' || process.windowsStore || false,
      extra: Object.keys(extraDetails).length > 0 ? JSON.stringify(extraDetails) : null
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
let tray = null;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

const gotLock = app.requestSingleInstanceLock();
if (process.platform === "linux") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Ana ekran traya gizlendiğinde açık olan tüm alt pencereleri (ScreenShare, OSS vb.) kapat
      BrowserWindow.getAllWindows().forEach(win => {
        if (win !== mainWindow && !win.isDestroyed()) {
          win.close();
        }
      });
    }
  });

  mainWindow.on('focus', () => {
    mainWindow.flashFrame(false);
  });

  const iconPath = path.join(app.getAppPath(), "topluyo.png");
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Uygulamayı Göster', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Topluyo');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  //* url handler

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLinks(url);
  });

  // Push-to-talk initialization
  let isPttPressed = false;

  if (uIOhook) {
    uIOhook.on('keydown', (e) => {
      try {
        if (e.keycode === UiohookKey[currentPttKey]) {
          if (!isPttPressed) {
            isPttPressed = true;
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(win => {
              if (win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('ptt-status-change', true);
              }
            });
          }
        }
      } catch (err) {
        console.error("uIOhook keydown error:", err);
        sendErrorToFrontend(err, 'uIOhookError');
      }
    });

    uIOhook.on('keyup', (e) => {
      try {
        if (e.keycode === UiohookKey[currentPttKey]) {
          if (isPttPressed) {
            isPttPressed = false;
            const windows = BrowserWindow.getAllWindows();
            windows.forEach(win => {
              if (win.webContents && !win.webContents.isDestroyed()) {
                win.webContents.send('ptt-status-change', false);
              }
            });
          }
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
  try { if (uIOhook) uIOhook.stop(); } catch (e) { }
  if (process.platform === "win32") {
    app.quit();
  } else {
    app.exit();
  }
});

app.on("will-quit", () => {
  try { if (uIOhook) uIOhook.stop(); } catch (e) { }
});

ipcMain.handle('set-ptt-key', (event, newKey) => {
  if (!uIOhook || !UiohookKey) return false;
  console.log('PTT new key received:', newKey);

  // Try to parse the input as a keycode (number)
  let keyCode = typeof newKey === 'number' ? newKey : parseInt(newKey, 10);

  if (!isNaN(keyCode)) {
    // Map JS standard KeyboardEvent keyCode to UiohookKey key names
    const jsKeyCodeToUiohookKeyName = {
      8: 'Backspace',
      9: 'Tab',
      13: 'Enter',
      16: 'Shift',
      17: 'Ctrl',
      18: 'Alt',
      20: 'CapsLock',
      27: 'Escape',
      32: 'Space',
      33: 'PageUp',
      34: 'PageDown',
      35: 'End',
      36: 'Home',
      37: 'ArrowLeft',
      38: 'ArrowUp',
      39: 'ArrowRight',
      40: 'ArrowDown',
      45: 'Insert',
      46: 'Delete',
      48: '0', 49: '1', 50: '2', 51: '3', 52: '4',
      53: '5', 54: '6', 55: '7', 56: '8', 57: '9',
      65: 'A', 66: 'B', 67: 'C', 68: 'D', 69: 'E', 70: 'F', 71: 'G', 72: 'H',
      73: 'I', 74: 'J', 75: 'K', 76: 'L', 77: 'M', 78: 'N', 79: 'O', 80: 'P',
      81: 'Q', 82: 'R', 83: 'S', 84: 'T', 85: 'U', 86: 'V', 87: 'W', 88: 'X',
      89: 'Y', 90: 'Z',
      96: 'Numpad0', 97: 'Numpad1', 98: 'Numpad2', 99: 'Numpad3', 100: 'Numpad4',
      101: 'Numpad5', 102: 'Numpad6', 103: 'Numpad7', 104: 'Numpad8', 105: 'Numpad9',
      106: 'NumpadMultiply', 107: 'NumpadAdd', 109: 'NumpadSubtract',
      110: 'NumpadDecimal', 111: 'NumpadDivide',
      112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4', 116: 'F5', 117: 'F6',
      118: 'F7', 119: 'F8', 120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12',
      186: 'Semicolon', 187: 'Equal', 188: 'Comma', 189: 'Minus', 190: 'Period',
      191: 'Slash', 192: 'Backquote', 219: 'BracketLeft', 220: 'Backslash',
      221: 'BracketRight', 222: 'Quote'
    };

    const matchedKeyName = jsKeyCodeToUiohookKeyName[keyCode];
    if (matchedKeyName && UiohookKey[matchedKeyName] !== undefined) {
      currentPttKey = matchedKeyName;
      console.log('PTT key set from JS keyCode:', keyCode, '-> UiohookKey:', currentPttKey, '(Code:', UiohookKey[currentPttKey], ')');
      return currentPttKey;
    }

    // Fallback: Check if the keycode is already a native uiohook keycode
    const matchedNativeKey = Object.keys(UiohookKey).find(k => UiohookKey[k] === keyCode);
    if (matchedNativeKey) {
      currentPttKey = matchedNativeKey;
      console.log('PTT key set from native keycode:', keyCode, '-> UiohookKey:', currentPttKey);
      return currentPttKey;
    }
  } else if (typeof newKey === 'string') {
    // Fallback: Normalize string inputs (e.g. "KeyG" -> "G", "Digit1" -> "1")
    let upperKey = newKey.toUpperCase();
    if (upperKey.startsWith("KEY") && upperKey.length === 4) {
      upperKey = upperKey.slice(3);
    } else if (upperKey.startsWith("DIGIT") && upperKey.length === 6) {
      upperKey = upperKey.slice(5);
    }

    const matchedKeyName = Object.keys(UiohookKey).find(k => k.toUpperCase() === upperKey);
    if (matchedKeyName) {
      currentPttKey = matchedKeyName;
      console.log('PTT key set from string:', newKey, '-> UiohookKey:', currentPttKey, '(Code:', UiohookKey[currentPttKey], ')');
      return currentPttKey;
    }
  }

  console.log('PTT key change failed for:', newKey);
  return false;
});

ipcMain.on("open-oss", () => {
  ossWindow();
});

ipcMain.on("notification:iframe", (event, data) => {
  const { iframeUrl, force } = data;
  const isFocused = mainWindow && mainWindow.isFocused();

  if (!force && isFocused) {
    return; // Don't show if not forced and window is focused
  }

  if (mainWindow && !mainWindow.isDestroyed() && !isFocused) {
    mainWindow.flashFrame(true);
  }

  notificationManager.enqueue(iframeUrl);
});

ipcMain.on("notification:os", (event, obj) => {
  notificationManager.enqueueOS(obj);
});

ipcMain.on("notification:click", () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
    mainWindow.flashFrame(false);
  }
});

ipcMain.on("notification:close", (event) => {
  notificationManager.close(event.sender.id);
});

ipcMain.on("notification:event", (event, obj) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send("notification:response", obj);
  }
});

ipcMain.on("get-app-version-sync", (event) => {
  event.returnValue = app.getVersion();
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
  shell.openExternal(url).catch(err => {
    let safeUrl = url;
    try {
      const parsed = new URL(url);
      safeUrl = parsed.hostname || url.substring(0, 30) + '...';
    } catch (e) { }

    const customErr = new Error(`[open-external-ipc] Dış bağlantı açılamadı (Hedef: ${safeUrl}). Hata: ${err.message}`);
    customErr.code = err.code;
    throw customErr;
  });
});

ipcMain.on("minimize", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.minimize();
});
ipcMain.on("maximize", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});
ipcMain.on("close", () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (win && !win.isDestroyed()) win.close();
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

  if (global.audioCaptureCleanup) {
    global.audioCaptureCleanup();
  } else if (captureModule && captureModule.stopCapture) {
    captureModule.stopCapture();
  }

  const sender = event.sender;
  const senderFrame = event.senderFrame;

  const cleanup = () => {
    if (captureModule && captureModule.stopCapture) {
      captureModule.stopCapture();
    }
    if (sender && !sender.isDestroyed()) {
      sender.removeListener("destroyed", cleanup);
      sender.removeListener("did-navigate", cleanup);
    }
    if (global.audioCaptureCleanup === cleanup) {
      global.audioCaptureCleanup = null;
    }
  };
  global.audioCaptureCleanup = cleanup;

  sender.once("destroyed", cleanup);
  sender.once("did-navigate", cleanup);

  try {
    return captureModule.startCapture(targetPid, isIncludeMode, (buffer, meta) => {
      try {
        if (global.audioCaptureCleanup !== cleanup) return;

        const frameAlive = senderFrame && !senderFrame.isDestroyed();
        const senderAlive = sender && !sender.isDestroyed();

        if (frameAlive) {
          senderFrame.send("native-audio-data", buffer, meta);
        } else if (senderAlive) {
          sender.send("native-audio-data", buffer, meta);
        } else {
          // Both are destroyed or navigated, stop capture to prevent leak
          if (global.audioCaptureCleanup === cleanup) {
            global.audioCaptureCleanup();
          }
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
  if (global.audioCaptureCleanup) {
    global.audioCaptureCleanup();
  } else if (captureModule && captureModule.stopCapture) {
    captureModule.stopCapture();
  }
  return true;
});
