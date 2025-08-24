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
function detectPackageFormat() {
  // Flatpak kontrolü
  if (process.env.FLATPAK_ID || process.env.FLATPAK_DEST) {
    return 'flatpak';
  }
  
  // Snap kontrolü
  if (process.env.SNAP || process.env.SNAP_NAME) {
    return 'snap';
  }
  
  // AppImage kontrolü
  if (process.env.APPIMAGE) {
    return 'appimage';
  }
  
  // Tar.gz veya diğer native paketler
  return 'native';
}

function getExecutablePath() {
  const format = detectPackageFormat();
  
  switch (format) {
    case 'flatpak':
      return 'flatpak run com.topluyo.app';
    case 'snap':
      return 'topluyo'; // Snap package name
    case 'appimage':
      return process.env.APPIMAGE;
    case 'native':
    default:
      return process.execPath;
  }
}

function createDesktopEntry() {
  const format = detectPackageFormat();
  const execPath = getExecutablePath();
  
  let desktopEntry = `[Desktop Entry]
Name=Topluyo
Comment=Topluyo
Exec=${execPath} %U
Type=Application
Terminal=false
Categories=Utility;Network;
StartupWMClass=Topluyo
MimeType=x-scheme-handler/topluyo;
StartupNotify=true
`;

  // Format-specific ayarlar
  switch (format) {
    case 'flatpak':
      desktopEntry += `Icon=com.topluyo.app
X-Flatpak-RenamedFrom=topluyo.desktop;
`;
      break;
    case 'snap':
      desktopEntry += `Icon=${process.env.SNAP}/meta/gui/topluyo.png
X-SnapInstanceName=topluyo
`;
      break;
    case 'appimage':
      desktopEntry += `Icon=topluyo
X-AppImage-Version=${process.env.VERSION || '1.0.0'}
`;
      break;
    case 'native':
    default:
      desktopEntry += `Icon=topluyo
`;
      break;
  }
  
  return desktopEntry;
}

function registerProtocol() {
  const format = detectPackageFormat();
  const desktopPath = path.join(os.homedir(), ".local/share/applications/topluyo.desktop");
  const desktopEntry = createDesktopEntry();

  console.log(`📦 Detected package format: ${format}`);

  try {
    // Desktop dosyasını oluştur
    fs.writeFileSync(desktopPath, desktopEntry, { mode: 0o755 });
    console.log(`✅ Desktop file created: ${desktopPath}`);

    // Format-specific registration
    switch (format) {
      case 'flatpak':
        registerFlatpakProtocol(desktopPath);
        break;
      case 'snap':
        registerSnapProtocol(desktopPath);
        break;
      case 'appimage':
        registerAppImageProtocol(desktopPath);
        break;
      case 'native':
      default:
        registerNativeProtocol(desktopPath);
        break;
    }

    console.log("✅ topluyo:// protokolü başarıyla kaydedildi.");
  } catch (err) {
    console.error("🚫 Protokol kaydı başarısız:", err.message);
  }
}

function registerFlatpakProtocol(desktopPath) {
  try {
    // Flatpak için özel protokol kaydı
    execSync(`flatpak override --user --filesystem=~/.local/share/applications com.topluyo.app`);
    execSync(`xdg-mime default topluyo.desktop x-scheme-handler/topluyo`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    execSync(`update-mime-database ~/.local/share/mime`);
  } catch (err) {
    console.warn("⚠️ Flatpak protocol registration warning:", err.message);
  }
}

function registerSnapProtocol(desktopPath) {
  try {
    // Snap için protokol kaydı
    execSync(`chmod +x "${desktopPath}"`);
    execSync(`xdg-mime default topluyo.desktop x-scheme-handler/topluyo`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    
    // Snap için ek izinler gerekebilir
    if (process.env.SNAP_NAME) {
      console.log("📋 Snap detected. Manual protocol association may be required.");
    }
  } catch (err) {
    console.warn("⚠️ Snap protocol registration warning:", err.message);
  }
}

function registerAppImageProtocol(desktopPath) {
  try {
    // AppImage için protokol kaydı
    execSync(`chmod +x "${desktopPath}"`);
    execSync(`xdg-mime default topluyo.desktop x-scheme-handler/topluyo`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    execSync(`update-mime-database ~/.local/share/mime`);
    
    // AppImage için icon kopyalama (isteğe bağlı)
    const iconDir = path.join(os.homedir(), ".local/share/icons/hicolor/256x256/apps");
    if (!fs.existsSync(iconDir)) {
      fs.mkdirSync(iconDir, { recursive: true });
    }
  } catch (err) {
    console.warn("⚠️ AppImage protocol registration warning:", err.message);
  }
}

function registerNativeProtocol(desktopPath) {
  try {
    // Native installation için protokol kaydı
    execSync(`chmod +x "${desktopPath}"`);
    execSync(`xdg-mime default topluyo.desktop x-scheme-handler/topluyo`);
    execSync(`update-desktop-database ~/.local/share/applications`);
    execSync(`update-mime-database ~/.local/share/mime`);
  } catch (err) {
    console.warn("⚠️ Native protocol registration warning:", err.message);
  }
}

function checkProtocolRegistration() {
  try {
    const result = execSync('xdg-mime query default x-scheme-handler/topluyo', { encoding: 'utf8' });
    const isRegistered = result.trim() === 'topluyo.desktop';
    console.log(`🔍 Protocol registration status: ${isRegistered ? '✅ Registered' : '❌ Not registered'}`);
    return isRegistered;
  } catch (err) {
    console.error("🚫 Protocol check failed:", err.message);
    return false;
  }
}

if (process.platform === "linux") {
  registerProtocol();
  ensureShmExists();
  checkProtocolRegistration();
}
