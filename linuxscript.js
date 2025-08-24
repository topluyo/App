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
    // Farklı olası konumları kontrol et
    const possiblePaths = [
      path.join(__dirname, "node_modules/electron/dist/chrome-sandbox"),
      path.join(process.resourcesPath, "chrome-sandbox"),
      path.join(__dirname, "chrome-sandbox")
    ];
    
    let chromeSandboxPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        chromeSandboxPath = p;
        break;
      }
    }
    
    if (chromeSandboxPath) {
      console.log("🔧 chrome-sandbox bulundu, kaldırılıyor...");
      fs.unlinkSync(chromeSandboxPath);
      console.log("✅ chrome-sandbox kaldırıldı.");
    } else {
      console.log("ℹ️ chrome-sandbox bulunamadı (bu normal olabilir).");
    }
  } catch (error) {
    console.error("🚫 chrome-sandbox işleminde hata:", error.message);
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

  const desktopEntry = `[Desktop Entry]
Name=Topluyo
Exec=sh -c '"${appPath}" --no-sandbox %u'
Type=Application
Terminal=false
MimeType=x-scheme-handler/topluyo;
Categories=Network;Chat;
NoDisplay=false
StartupWMClass=Topluyo
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
  fixChromeSandbox();
  registerProtocol();
    ensureShmExists();
}
