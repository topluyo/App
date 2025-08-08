const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  // Windows Store versiyonunda chrome-sandbox'a dokunma
  const isWindowsStore = process.env.WINDOWS_STORE === 'true' || process.env.STOREBUILD === 'true';
  
  if (isWindowsStore) {
    console.log("🏪 Windows Store build - chrome-sandbox işlemi atlanıyor");
    return;
  }

  const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");

  if (fs.existsSync(sandboxPath)) {
    try {
      fs.unlinkSync(sandboxPath); // tamamen sil
      console.log("❌ chrome-sandbox kaldırıldı.");
    } catch (error) {
      console.warn("⚠️ chrome-sandbox silinemedi:", error.message);
    }
  } else {
    console.warn("⚠️ afterPack: chrome-sandbox bulunamadı.");
  }
};
