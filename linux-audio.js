const { execSync } = require('child_process');

let virtualSinkId = null;

function setupLinuxAudio(sourceId) {
  try {
    cleanupLinuxAudio();

    console.log("[PulseAudio] Creating Null Sink TopluyoCaptureSink");
    const sinkOut = execSync('pactl load-module module-null-sink sink_name=TopluyoCaptureSink sink_properties=device.description="TopluyoCapture"').toString().trim();
    virtualSinkId = sinkOut;

    // Get all sink inputs
    let inputsOut = "";
    try {
      inputsOut = execSync('pactl list short sink-inputs').toString();
    } catch(e) {}

    const lines = inputsOut.split('\n').filter(l => l.trim().length > 0);
    const topluyoPid = process.pid;
    
    // We can't perfectly map X11/Wayland window IDs to PulseAudio sink-inputs easily in a few lines.
    // However, we can at least route all audio to the new sink, EXCEPT Topluyo itself, to prevent echo during screen share.
    // If it's a specific window, ideally we only route that window's PID.
    // For now, we will move all NON-Topluyo streams to the Null Sink so they can be captured.

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length > 0) {
        const inputId = parts[0];
        try {
          // Check if this input belongs to Topluyo
          const info = execSync(`pactl list sink-inputs | grep -A 20 "Sink Input #${inputId}"`).toString();
          if (!info.includes(`application.process.id = "${topluyoPid}"`) && !info.includes('Topluyo')) {
            // Move it to our capture sink
            execSync(`pactl move-sink-input ${inputId} TopluyoCaptureSink`);
          }
        } catch(e) {}
      }
    }

    return { platform: 'linux', sinkName: 'TopluyoCaptureSink.monitor' };
  } catch (e) {
    console.error("[PulseAudio] Failed to setup:", e.message);
    return false;
  }
}

function cleanupLinuxAudio() {
  if (virtualSinkId) {
    try {
      execSync(`pactl unload-module ${virtualSinkId}`);
    } catch (e) {}
    virtualSinkId = null;
  }
}

module.exports = { setupLinuxAudio, cleanupLinuxAudio };
