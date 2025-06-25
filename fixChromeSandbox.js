const fs = require("fs");
const path = require("path");

module.exports = async function (context) {
  const sandboxPath = path.join(context.appOutDir, "chrome-sandbox");

  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath); // tamamen sil
    console.log("❌ chrome-sandbox kaldırıldı.");
  } else {
    console.warn("⚠️ afterPack: chrome-sandbox bulunamadı.");
  }
};
