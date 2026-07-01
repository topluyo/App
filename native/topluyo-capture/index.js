const capture = require('./build/Release/topluyo_capture.node');

/**
 * Starts audio capture excluding the specified process.
 * @param {number} [excludePid] - Process ID to exclude. Defaults to current process ID.
 * @param {function(Buffer, Object)} [onData] - Callback for raw PCM audio data and metadata.
 * @returns {boolean} True if started successfully
 */
function startCapture(processId, isIncludeMode, onData) {
    if (processId === undefined || processId === null) {
        processId = process.pid;
    }
    if (typeof isIncludeMode !== 'boolean') {
        isIncludeMode = false;
    }
    if (typeof onData !== 'function') {
        onData = () => {};
    }
    return capture.startCapture(processId, isIncludeMode, (data, meta) => onData(data, meta));
}

function stopCapture() {
    return capture.stopCapture();
}

function getPidFromHwnd(hwndNumber) {
    return capture.getPidFromHwnd(hwndNumber);
}

module.exports = {
    startCapture,
    stopCapture,
    getPidFromHwnd
};
