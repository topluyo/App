const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function fixChromeSandbox() {
  if (process.env.APPIMAGE) {
    console.log("ℹ️ AppImage ortamı: chrome-sandbox ayarı gereksiz, atlanıyor.");
    return;
  }

  try {
    const chromeSandboxPath = path.join(__dirname, "node_modules/electron/dist/chrome-sandbox");
    if (fs.existsSync(chromeSandboxPath)) {
      console.log("🔧 chrome-sandbox izni ayarlanıyor...");
      execSync(`sudo chown root "${chromeSandboxPath}"`);
      execSync(`sudo chmod 4755 "${chromeSandboxPath}"`);
      console.log("✅ chrome-sandbox hazır.");
    } else {
      console.warn("⚠️ chrome-sandbox bulunamadı.");
    }
  } catch (error) {
    console.error("🚫 chrome-sandbox ayarlanırken hata:", error.message);
  }
}
function ensureShmExists() {
  try {
    const shmStat = fs.statSync("/dev/shm");
    if (!shmStat.isDirectory()) {
      throw new Error("/dev/shm is not a directory");
    }
  } catch (err) {
    try {
      console.log("⚠️ /dev/shm yok, oluşturuluyor...");
      execSync("sudo mkdir -p /dev/shm && sudo chmod 1777 /dev/shm");
      console.log("✅ /dev/shm başarıyla oluşturuldu.");
    } catch (e) {
      console.error("🚫 /dev/shm oluşturulamadı:", e.message);
    }
  }
}
function registerProtocol() {
  const desktopPath = path.join(os.homedir(), ".local/share/applications/topluyo.desktop");
  const appPath = process.env.APPIMAGE || process.execPath;

  const iconPath = process.env.APPIMAGE
    ? path.join(process.env.APPDIR, ".DirIcon")
    : path.join(__dirname, "topluyo.png");

  const desktopEntry = `[Desktop Entry]
Name=Topluyo
Exec=env ELECTRON_DISABLE_SANDBOX=1 sh -c '"${appPath}" --no-sandbox --disable-dev-shm-usage %u'
Type=Application
Terminal=false
MimeType=x-scheme-handler/topluyo;
Categories=Network;Chat;
NoDisplay=false
StartupWMClass=Topluyo
Icon=${iconPath}
`;

  try {
    fs.writeFileSync(desktopPath, desktopEntry, { mode: 0o755 });
    execSync(`chmod +x "${desktopPath}"`);
    execSync(`xdg-mime default topluyo.desktop x-scheme-handler/topluyo`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    console.log("✅ topluyo:// protokolü başarıyla kaydedildi.");
  } catch (err) {
    console.error("🚫 Protokol kaydı başarısız:", err.message);
  }
}

if (process.platform === "linux") {
  // fixChromeSandbox(); // Not needed when using --no-sandbox
  registerProtocol();
  // ensureShmExists(); // Not needed when using --disable-dev-shm-usage
}
