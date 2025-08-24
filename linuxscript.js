const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

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
  registerProtocol();
    ensureShmExists();
}
