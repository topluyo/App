// preload.js
const { ipcRenderer, contextBridge } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  window.closeWindow = () => {
    ipcRenderer.send("close");
  };

  window.minimizeWindow = () => {
    ipcRenderer.send("minimize");
  };
  window.maximizeWindow = () => {
    ipcRenderer.send("maximize");
  };

  window.ossOpen = () => {
    ipcRenderer.send("open-oss");
  };

  document.body.classList.add("electron-app");

  documenter.on("input", "#run-on-startup", function () {
    ipcRenderer.send("set-Startup", this.checked);
  });

  documenter.on("input", "#run-on-startup", function () {
    ipcRenderer.send("set-Startup", this.checked);
  });
});

// Override MediaDevices.prototype to ensure we catch ALL calls in this frame
if (typeof MediaDevices !== 'undefined' && MediaDevices.prototype.getDisplayMedia) {
  const originalGetDisplayMedia = MediaDevices.prototype.getDisplayMedia;
  MediaDevices.prototype.getDisplayMedia = async function(constraints) {
    console.log("[NativeCapture] getDisplayMedia intercepted! Constraints:", constraints);
    
    // Call the original Electron implementation
    const stream = await originalGetDisplayMedia.call(this, constraints);
    
    const audioTracks = stream.getAudioTracks();
    console.log("[NativeCapture] Original stream audio tracks:", audioTracks.length);
    
    if (audioTracks.length > 0) {
      console.log("[NativeCapture] Requesting WASAPI start from main process...");
      try {
        const started = await ipcRenderer.invoke('start-native-audio');
        console.log("[NativeCapture] WASAPI start response:", started);
        
        if (started && started.platform === 'linux') {
          console.log("[NativeCapture] PulseAudio Linux routing started:", started.sinkName);
          audioTracks[0].stop();
          stream.removeTrack(audioTracks[0]);

          try {
            const paStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: started.sinkName
              }
            });
            const paAudioTrack = paStream.getAudioTracks()[0];
            
            const stopNativeCapture = () => {
              console.log("[NativeCapture] Stopping Linux capture...");
              ipcRenderer.invoke('stop-native-audio');
              paAudioTrack.stop();
            };

            const originalTrackStop = paAudioTrack.stop.bind(paAudioTrack);
            paAudioTrack.stop = () => {
              stopNativeCapture();
              originalTrackStop();
            };

            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length > 0) {
              videoTracks[0].addEventListener('ended', () => {
                stopNativeCapture();
              });
            }

            stream.addTrack(paAudioTrack);
            console.log("[NativeCapture] Added PulseAudio virtual track to stream!");
          } catch (e) {
            console.error("[NativeCapture] Failed to capture PulseAudio sink via getUserMedia:", e);
          }
        } else if (started) {
          console.log("[NativeCapture] Native WASAPI started successfully. Stopping default loopback track to prevent echo.");
          audioTracks[0].stop();
          stream.removeTrack(audioTracks[0]);

          console.log("[NativeCapture] Creating WebCodecs MediaStreamTrackGenerator.");
          const generator = new MediaStreamTrackGenerator({ kind: 'audio' });
          const writer = generator.writable.getWriter();
          
          let timestamp = 0; // Microseconds
          let packetCount = 0;
          
          ipcRenderer.removeAllListeners('native-audio-data');
          ipcRenderer.on('native-audio-data', (event, buffer, meta) => {
            try {
              packetCount++;
              if (packetCount % 100 === 0) {
                console.log(`[NativeCapture] Received 100 audio packets. Latest meta:`, meta, `Buffer size: ${buffer.byteLength}`);
              }

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
          
          // Hook stopping mechanism
          const stopNativeCapture = () => {
            console.log("[NativeCapture] Stopping WASAPI capture...");
            ipcRenderer.invoke('stop-native-audio');
            ipcRenderer.removeAllListeners('native-audio-data');
          };

          const originalGeneratorStop = generator.stop.bind(generator);
          generator.stop = () => {
            stopNativeCapture();
            originalGeneratorStop();
          };

          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            videoTracks[0].addEventListener('ended', () => {
              console.log("[NativeCapture] Video track ended, stopping audio.");
              stopNativeCapture();
            });
          }

          stream.addTrack(generator);
          console.log("[NativeCapture] Added native audio track to stream!");
        } else {
          console.log("[NativeCapture] Native capture returned false. Falling back to default Electron loopback.");
        }
      } catch (err) {
        console.error("[NativeCapture] IPC error during native capture start:", err);
        console.log("[NativeCapture] Falling back to default Electron loopback.");
      }
    }
    
    return stream;
  };
}

try {
  contextBridge.exposeInMainWorld("stream", {
    getSources: () => ipcRenderer.invoke("getSources"),
    setSource: (data) =>
      ipcRenderer.invoke("setSource", { id:data.id, isAudioEnabled:data.audio }),
  });

  contextBridge.exposeInMainWorld("electronAPI", {
    onUpdateMessage: (callback) => ipcRenderer.on("update-message", callback),
    onProgress: (callback) => ipcRenderer.on("download-progress", callback),
    getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
  });
} catch (e) {
  // If contextIsolation is false, expose directly to window
  window.stream = {
    getSources: () => ipcRenderer.invoke("getSources"),
    setSource: (data) =>
      ipcRenderer.invoke("setSource", { id:data.id, isAudioEnabled:data.audio }),
  };
  window.electronAPI = {
    onUpdateMessage: (callback) => ipcRenderer.on("update-message", callback),
    onProgress: (callback) => ipcRenderer.on("download-progress", callback),
    getOSSLibraries: () => ipcRenderer.invoke("get-oss-libraries"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
  };
}