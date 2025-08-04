const {
  ipcMain,
  desktopCapturer,
  BrowserWindow,
  dialog,
  app,
  shell,
  systemPreferences,
} = require("electron");
const path = require("path");

function checkScreenRecordingPermission() {
  if (process.platform === "darwin") {
    const status = systemPreferences.getMediaAccessStatus("screen");
    console.log("macOS Screen Recording Permission Status:", status);
    return status === "granted";
  }
  return true;
}

const getAllSources = async () => {
  try {
    console.log("getAllSources: Ekran kaynakları alınıyor...");
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
    });
    console.log("getAllSources: Bulunan kaynak sayısı:", sources.length);
    return sources.map((source) => ({
      name: source.name,
      id: source.id,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  } catch (e) {
    console.error("getAllSources hatası:", e);
    throw e;
  }
};

async function createStreamWindow(_, callback) {
  let callbackcalled = false;
  const win = new BrowserWindow({
    width: 620,
    height: 400,
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "topluyo.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false, // Güvenlik için false
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // macOS için güvenlik ayarları
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(true, "screen-saver");
  }

  win.loadFile("ScreenShare.html");

  const allSources = await getAllSources();
  console.log("createStreamWindow: Kaynaklar hazırlandı:", allSources.length);

  ipcMain.handle("setSource", async (_, data) => {
    console.log("setSource çağrıldı:", data);
    if (callbackcalled) {
      return;
    }
    const selectedSource = allSources.find((s) => s.id === data.id);
    try {
      if (!selectedSource) {
        console.error("setSource: Kaynak bulunamadı:", data.id);
        throw new Error("Source not found");
      }
      callbackcalled = true;
      let stream = { video: selectedSource };
      if (data.isAudioEnabled) {
        stream.audio = "loopback";
      }
      callback(stream);
      ipcMain.removeHandler("getSources");
      ipcMain.removeHandler("setSource");
      win.close();
    } catch (e) {
      console.error("setSource hatası:", e);
      throw e;
    }
  });

  win.on("close", () => {
    console.log("Stream penceresi kapatılıyor");
    if (callbackcalled) return;
    callbackcalled = true;
    try {
      ipcMain.removeHandler("getSources");
      ipcMain.removeHandler("setSource");
      callback(null);
    } catch (e) {
      console.error("Pencere kapatma hatası:", e);
      throw e;
    }
  });
}

const mediaHandler = async (req, callback) => {
  try {
    console.log("mediaHandler çağrıldı, req:", req);

    if (!checkScreenRecordingPermission()) {
      console.log("Ekran kaydı izni yok!");
      dialog.showErrorBox(
        "Ekran Kaydı İzni Gerekli",
        "Ekran paylaşımı için Sistem Ayarları > Güvenlik ve Gizlilik > Ekran Kaydı bölümünden uygulamaya izin vermelisiniz."
      );
      callback(null);
      return;
    }

    console.log("Ekran kaydı izni var, kaynak seçim penceresi açılıyor...");
    ipcMain.removeHandler("setSource");
    ipcMain.removeHandler("getSources");

    const allSources = await getAllSources();
    console.log("Tüm kaynaklar alındı:", allSources.length);

    ipcMain.handle("getSources", async () => {
      console.log("getSources handler çağrıldı");
      return allSources;
    });

    await createStreamWindow(req, callback);
  } catch (e) {
    console.error("mediaHandler hatası:", e);
    dialog.showErrorBox("Error", "hata:" + e.message);
    callback(null);
  }
};

//* URL Safety Function
function isSafeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.origin === "https://topluyo.com" &&
      parsedUrl.protocol === "https:"
    ) {
      if (parsedUrl.search && parsedUrl.search.includes("!login")) {
        return false;
      }
      return true;
    }
  } catch (e) {
    return false;
  }
}

const openExternalLinks = (url) => {
  if (process.platform === "linux") {
    const newUrl = new URL(url);
    require("child_process").exec(`xdg-open "${newUrl}"`);
  } else {
    shell.openExternal(url);
  }
};


function ossWindow(){
  let ossWin = new BrowserWindow({
    width: 800,
    height: 600,
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), "topluyo.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  ossWin.loadFile("oss.html");
  ossWin.webContents.setWindowOpenHandler((_)=>{
    return { action: "deny" };
  })
  ossWin.on("closed", () => {
    ossWin = null;
  });
}

module.exports = { isSafeUrl, mediaHandler, openExternalLinks, ossWindow };
