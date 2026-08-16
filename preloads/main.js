// preloads/main.js
const { ipcRenderer, contextBridge, webFrame } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("electron-app");
  document.body.classList.add("Electron");
});

// Expose standard window controls
contextBridge.exposeInMainWorld("closeWindow", () => ipcRenderer.send("close"));
contextBridge.exposeInMainWorld("minimizeWindow", () => ipcRenderer.send("minimize"));
contextBridge.exposeInMainWorld("maximizeWindow", () => ipcRenderer.send("maximize"));
contextBridge.exposeInMainWorld("ossOpen", () => ipcRenderer.send("open-oss"));

contextBridge.exposeInMainWorld("stream", {
  getSources: () => ipcRenderer.invoke("getSources"),
  setSource: (data) =>
    ipcRenderer.invoke("setSource", { id: data.id, isAudioEnabled: data.audio }),
});

contextBridge.exposeInMainWorld("Electron", {
  onUpdateMessage: (callback) => ipcRenderer.on("update-message", (e, msg) => callback({}, msg)),
  onProgress: (callback) => ipcRenderer.on("download-progress", (e, obj) => callback({}, obj)),
  getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  SetPTTKey: (key) => ipcRenderer.invoke("set-ptt-key", key),
  NotificationIFRAME: (iframeUrl, force = false) => ipcRenderer.send('notification:iframe', { iframeUrl, force }),
  NotificationOS: (obj) => ipcRenderer.send('notification:os', obj),
  version: ipcRenderer.sendSync('get-app-version-sync'),
  setStartup: (checked) => ipcRenderer.send("set-Startup", checked)
});

// IPC for Native Audio Capture
contextBridge.exposeInMainWorld("nativeAudioIPC", {
  start: () => ipcRenderer.invoke('start-native-audio'),
  stop: () => ipcRenderer.invoke('stop-native-audio'),
  onData: (callback) => {
    ipcRenderer.removeAllListeners('native-audio-data');
    ipcRenderer.on('native-audio-data', (event, buffer, meta) => callback(buffer, meta));
  },
  offData: () => ipcRenderer.removeAllListeners('native-audio-data')
});

// Setup webFrame injections for callbacks that require global variables
ipcRenderer.on("electron-error", (event, errorData) => {
  let osInfo = `${errorData.os} ${errorData.osRelease} (${errorData.arch})`;
  if (errorData.os === 'win32') {
    osInfo += errorData.isWindowsStore ? ' [Microsoft Store]' : ' [Stand-alone]';
  }
  const extraInfo = errorData.extra ? `\nExtra: ${errorData.extra}` : '';

  const errorText = `**Desktop App Error**\nType: ${errorData.type}\nMessage: ${errorData.message}\nOS: ${osInfo}\nApp Version: ${errorData.appVersion}\nElectron: ${errorData.electronVersion}${extraInfo}\nStack:\n\`\`\`\n${errorData.stack || 'No stack trace'}\n\`\`\``.substring(0, 3000);

  webFrame.executeJavaScript(`
    if (typeof Route !== 'undefined' && Route.api) {
      Route.api({ api: "/!api/post/add", data: { channel_id: 33591, code: "", text: ${JSON.stringify(errorText)} } });
    } else if (window.Route && window.Route.api) {
      window.Route.api({ api: "/!api/post/add", data: { channel_id: 33591, code: "", text: ${JSON.stringify(errorText)} } });
    }
  `).catch(console.error);
});

ipcRenderer.on("ptt-status-change", (event, status) => {
  webFrame.executeJavaScript(`
    if (typeof Topluyo !== 'undefined' && typeof Topluyo.Microphone === 'function') {
      Topluyo.Microphone(${status});
    } else if (window.Topluyo && typeof window.Topluyo.Microphone === 'function') {
      window.Topluyo.Microphone(${status});
    }
  `).catch(console.error);
});

ipcRenderer.on('notification:response', (event, obj) => {
  webFrame.executeJavaScript(`
    if (typeof Topluyo !== 'undefined' && typeof Topluyo.NotificationResponse === 'function') {
      Topluyo.NotificationResponse(${JSON.stringify(obj)});
    } else if (window.Topluyo && typeof window.Topluyo.NotificationResponse === 'function') {
      window.Topluyo.NotificationResponse(${JSON.stringify(obj)});
    }
  `).catch(console.error);
});

// Documenter logic injection
webFrame.executeJavaScript(`
  if (typeof documenter !== 'undefined') {
    documenter.on("input", "#run-on-startup", function () {
      if (window.Electron && window.Electron.setStartup) {
        window.Electron.setStartup(this.checked);
      }
    });
  }
`).catch(e => { });

// Inject MediaDevices override synchronously into the main world using a script tag
const injectScript = document.createElement('script');
injectScript.textContent = `
  try {
    const patchMediaDevices = () => {
      const mediaDevicesProto = Object.getPrototypeOf(navigator.mediaDevices) || MediaDevices.prototype;
      if (mediaDevicesProto && mediaDevicesProto.getDisplayMedia && !navigator.mediaDevices.__isNativeCapturePatched) {
        navigator.mediaDevices.__isNativeCapturePatched = true;
        
        const originalGetDisplayMedia = mediaDevicesProto.getDisplayMedia;
        mediaDevicesProto.getDisplayMedia = async function (constraints) {

          const stream = await originalGetDisplayMedia.call(this, constraints);
          const audioTracks = stream.getAudioTracks();

          if (audioTracks.length > 0) {
            try {
              const started = await window.nativeAudioIPC.start();

              if (started && started.platform === 'linux') {
                audioTracks[0].stop();
                stream.removeTrack(audioTracks[0]);

                try {
                  const paStream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: started.sinkName }
                  });
                  const paAudioTrack = paStream.getAudioTracks()[0];

                  const stopNativeCapture = () => {
                    window.nativeAudioIPC.stop();
                    paAudioTrack.stop();
                  };

                  const originalTrackStop = paAudioTrack.stop.bind(paAudioTrack);
                  paAudioTrack.stop = () => {
                    stopNativeCapture();
                    originalTrackStop();
                  };

                  const videoTracks = stream.getVideoTracks();
                  if (videoTracks.length > 0) {
                    videoTracks[0].addEventListener('ended', stopNativeCapture);
                  }

                  stream.addTrack(paAudioTrack);
                } catch (e) {
                  console.error("[NativeCapture] Failed to capture PulseAudio sink via getUserMedia:", e);
                }
              } else if (started) {
                audioTracks[0].stop();
                stream.removeTrack(audioTracks[0]);

                const generator = new MediaStreamTrackGenerator({ kind: 'audio' });
                const writer = generator.writable.getWriter();

                let timestamp = 0; // Microseconds
                let packetCount = 0;

                window.nativeAudioIPC.onData((buffer, meta) => {
                  try {
                    packetCount++;

                    const arrayBuffer = buffer.buffer || buffer;
                    const byteOffset = buffer.byteOffset || 0;
                    const byteLength = buffer.byteLength || buffer.length;

                    const isFloat = meta.isFloat;
                    let typedData;

                    if (isFloat) {
                      typedData = new Float32Array(arrayBuffer, byteOffset, byteLength / 4);
                    } else {
                      typedData = new Int16Array(arrayBuffer, byteOffset, byteLength / 2);
                    }

                    const frames = typedData.length / meta.channels;

                    const audioData = new AudioData({
                      format: isFloat ? 'f32' : 's16',
                      sampleRate: meta.sampleRate,
                      numberOfFrames: frames,
                      numberOfChannels: meta.channels,
                      timestamp: timestamp,
                      data: typedData
                    });

                    timestamp += (frames / meta.sampleRate) * 1000000;
                    writer.write(audioData);
                  } catch (e) {
                    console.error("[NativeCapture] Audio insertion error:", e);
                  }
                });

                const stopNativeCapture = () => {
                  window.nativeAudioIPC.stop();
                  window.nativeAudioIPC.offData();
                };

                const originalGeneratorStop = generator.stop.bind(generator);
                generator.stop = () => {
                  stopNativeCapture();
                  originalGeneratorStop();
                };

                const videoTracks = stream.getVideoTracks();
                if (videoTracks.length > 0) {
                  videoTracks[0].addEventListener('ended', () => {
                    stopNativeCapture();
                  });
                }

                stream.addTrack(generator);
              }
            } catch (err) {
              console.error("[NativeCapture] IPC error during native capture start:", err);
            }
          }
          return stream;
        };
      }
    };
    
    if (navigator.mediaDevices) {
      patchMediaDevices();
    } else {
      let attempts = 0;
      const patchInterval = setInterval(() => {
        attempts++;
        if (navigator.mediaDevices) {
          patchMediaDevices();
          clearInterval(patchInterval);
        } else if (attempts > 100) {
          clearInterval(patchInterval);
        }
      }, 50);
    }
  } catch (err) {
    console.error("[NativeCapture] Error during synchronous injection:", err);
  }
`;

// Inject into the DOM synchronously before other scripts load
if (document.documentElement) {
  document.documentElement.appendChild(injectScript);
  injectScript.remove();
} else {
  // Use MutationObserver to inject as soon as documentElement is available, before page scripts
  const observer = new MutationObserver(() => {
    if (document.documentElement) {
      document.documentElement.appendChild(injectScript);
      injectScript.remove();
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true });
}
