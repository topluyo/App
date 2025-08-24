const config = {
  appId: "com.topluyo.app",
  productName: "Topluyo",
  directories: {
    output: "dist",
  },
  files: [
    "build/**/*",
    "node_modules/**/*",
    "!node_modules/uiohook-napi/**/*",
    "*.html",
    "icons/*",
    "*.rtf",
    "*.js",
  ],
  protocols: [
    {
      name: "Topluyo",
      schemes: ["topluyo"],
    },
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "appx",
        arch: ["x64", "ia32", "arm64"],
      },
    ],
    icon: "build/icon.ico",
    artifactName: "Topluyo-Setup-${version}.${ext}",
    requestedExecutionLevel: "asInvoker",
  },
  appx: {
    identityName: "TopluyoApp.Topluyo",
    publisher: "CN=569715F9-C64D-44BC-9F1E-31B71AC68EEC",
    publisherDisplayName: "TopluyoApp",
    languages: "tr-TR",
    backgroundColor: "#191819",
    artifactName: "TopluyoApp-${version}.${ext}",
    showNameOnTiles: true,
    electronUpdaterAware: false,
    setBuildNumber: false,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Topluyo",
    license: "kullanici_sozlesmesi.rtf",
    deleteAppDataOnUninstall: true,
  },
  linux: {
    target: ["flatpak", "snap", "tar.gz"],
    icon: "icons/png/256x256.png",
    category: "Utility",
    description: "Topluyo",
    executableName: "Topluyo",
    artifactName: "Topluyo-${version}.${ext}",
    maintainer: "Hasan Delibaş <info@topluyo.com>",
  },
  snap: {
    confinement: "classic",
    publish: false,
  },
  flatpak: {
    runtime: "org.freedesktop.Platform",
    runtimeVersion: "23.08",
    sdk: "org.freedesktop.Sdk",
    finishArgs: [
      "--share=network",
      "--socket=fallback-x11",
      "--socket=wayland",
      "--device=dri",
      "--filesystem=home",
      "--device=all",
      "--socket=pulseaudio",
      "--share=ipc",
      "--env=PULSE_RUNTIME_PATH=/run/user/1000/pulse",
      "--talk-name=org.freedesktop.portal.Camera",
      "--talk-name=org.freedesktop.portal.Device",
      "--talk-name=org.freedesktop.portal.ScreenCast",
      "--talk-name=org.freedesktop.portal.Desktop",
      "--talk-name=org.freedesktop.Notifications",
      "--own-name=com.topluyo.app",
    ],
  },
  mac: {
    target: ["dmg", "pkg", "zip"],
    icon: "icons/mac/icon.icns",
    category: "public.app-category.utilities",
    artifactName: "Topluyo-${version}.${ext}",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    extendInfo: {
      NSMicrophoneUsageDescription:
        "Topluyo uygulaması mikrofon erişimi gerektirir.",
      NSCameraUsageDescription: "Topluyo uygulaması kamera erişimi gerektirir.",
      NSScreenRecordingUsageDescription:
        "Topluyo uygulaması ekran paylaşımı ve ekran kaydı için ekran erişimi gerektirir.",
      NSScreenCaptureDescription:
        "Topluyo uygulaması ekran paylaşımı için ekran erişimi gerektirir.",
    },
  },
  publish: [
    {
      provider: "github",
      owner: "topluyo",
      repo: "App",
    },
  ],
};

// Store versiyonu için electron-updater'ı exclude et
if (process.env.WINDOWS_STORE === "true" || process.env.STOREBUILD === "true") {
  config.files.push("!node_modules/electron-updater/**/*");
}

module.exports = config;
