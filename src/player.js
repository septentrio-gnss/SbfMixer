"use strict";
const { performance } = require('perf_hooks'); // For more precise timing if needed

// GPS Time Constants
const GPS_EPOCH_MS = new Date('1980-01-06T00:00:00Z').getTime();
const MS_IN_WEEK = 604800 * 1000; // 7 * 24 * 60 * 60 * 1000
const MS_IN_YEAR = 31536000 * 1000; // 365 * 24 * 60 * 60 * 1000

/**
 * Converts GPS Week Number (WNc) and Time Of Week (TOW) in milliseconds to
 * milliseconds since the GPS epoch (1980-01-06).
 * @param {number} WNc - GPS Week Number.
 * @param {number} TOW - GPS Time Of Week in milliseconds.
 * @returns {number} Milliseconds since GPS epoch.
 */
function TOW_to_ms(WNc, TOW) {
    return WNc * MS_IN_WEEK + TOW;
}

/**
 * Converts milliseconds since the GPS epoch (1980-01-06) to
 * GPS Week Number (WNc) and Time Of Week (TOW) in milliseconds.
 * @param {number} timestamp_ms - Milliseconds since GPS epoch.
 * @returns {{WNc: number, TOW: number}} An object containing WNc and TOW.
 */
function ms_to_TOW(timestamp_ms) {
    const msSinceGpsEpoch = timestamp_ms - GPS_EPOCH_MS;
    const WNc = Math.floor(msSinceGpsEpoch / MS_IN_WEEK);
    const TOW = msSinceGpsEpoch % MS_IN_WEEK;
    return { WNc, TOW };
}

module.exports = function(RED) {
    function PlayerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.changeTimeToActual = config.changeTimeToActual; // Will be used when differents modes
        node.maxWaitThreshold = parseInt(config.maxWaitThreshold, 10) || 5000; // 5000ms
        node.fallbackWaitTime = parseInt(config.fallbackWaitTime, 10) || 500;   // 500ms

        let messageBuffer = []; // Stores { timestamp: number, payload: Buffer }
        let isPlaying = false;
        let playbackStartTime = 0;
        let firstMessageOriginalTime = 0;

        function clearPlayback() {
            messageBuffer = [];
            isPlaying = false;
            node.status({ fill: "grey", shape: "ring", text: "Buffer cleared" });
        }

        function stopPlayback() {
            if (isPlaying) {
                isPlaying = false;
                node.emit('playbackStopped');
                node.log("Playback stopped.");
                node.status({ fill: "red", shape: "ring", text: "Stopped" });
            }
        }

        // Make the function async to use await for delays
        async function startPlayback() {
            try {
                if (isPlaying) {
                    node.warn("Playback already in progress.");
                    return;
                }
                if (messageBuffer.length === 0) {
                    node.warn("Message buffer is empty, nothing to play.");
                    node.status({ fill: "grey", shape: "ring", text: "Buffer empty" });
                    return;
                }

                // Ensure buffer is sorted by timestamp (ascending)
                messageBuffer.sort((a, b) => a.timestamp - b.timestamp);

                isPlaying = true;
                playbackStartTime = performance.now();
                firstMessageOriginalTime = messageBuffer[0].timestamp;
                const totalMessages = messageBuffer.length;
                const totalDurationMs = messageBuffer[totalMessages - 1].timestamp - firstMessageOriginalTime;

                try {
                    for (let i = 0; i < totalMessages; i++) {
                        if (!isPlaying) {
                            node.log("Playback stopped during loop.");
                            break;
                        }

                        const msgData = messageBuffer[i];

                        // Time calculation
                        const relativeDelay = msgData.timestamp - firstMessageOriginalTime;
                        const elapsedTime = performance.now() - playbackStartTime;
                        let waitTime = relativeDelay - elapsedTime;

                        let fastForward = false;
                        if(waitTime > node.maxWaitThreshold){
                            playbackStartTime -= (waitTime - node.fallbackWaitTime);
                            waitTime = node.fallbackWaitTime;
                            fastForward = true;
                            node.log(`waitTime > ${node.maxWaitThreshold}ms, fast forward to elapsedTime: ${Math.round(elapsedTime/1000)}s`);
                        }

                        if (waitTime > 5) { 
                            // Avoid tiny sleeps and busy-waiting for negative waits (already late)
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                        }

                        // Check if playback was stopped during the wait/processing delay
                        if (!isPlaying) {
                            node.log("Playback stopped during wait/processing.");
                            break;
                        }

                        let messageToSend = msgData.message;

                        // Update GPS WNc and TOW
                        if (node.changeTimeToActual){
                            const now_ms = Date.now();
                            const { WNc: currentWNc, TOW: currentTOW } = ms_to_TOW(now_ms);

                            messageToSend = RED.util.cloneMessage(msgData.message);
                            messageToSend.block.WNc = currentWNc;
                            messageToSend.block.TOW = currentTOW;

                            if(messageToSend.payload){
                                delete messageToSend.payload;
                            }
                        }

                        node.send(messageToSend);

                        // Update status with progress and estimated time remaining
                        const elapsedMs = performance.now() - playbackStartTime;
                        const remainingMs = Math.max(0, totalDurationMs - elapsedMs);
                        const remainingSec = Math.round(remainingMs / 1000);
                        const remainingMin = Math.floor(remainingSec / 60);
                        const remainingSecPart = remainingSec % 60;

                        node.status({
                            fill: fastForward ? "yellow" : "blue",
                            shape: "dot",
                            text: `${fastForward ? "Fast-forward" : "Playing     "} ${i + 1}/${totalMessages} (~${remainingMin}m ${remainingSecPart}s left)`
                        });
                    }

                    // Final status update after loop finishes or breaks
                    if (isPlaying) { // Check if stopped naturally
                        node.log("Playback finished naturally.");
                         // Set isPlaying false after finishing
                        node.status({ fill: "green", shape: "dot", text: `Finished ${totalMessages} msgs` });
                        isPlaying = false;
                    } else {
                        node.log("Playback stopped before completion.");
                    }
                } catch (error) {
                    node.error("Error during playback loop: " + error);
                    node.status({ fill: "red", shape: "ring", text: "Error during playback" });
                    isPlaying = false;
                }
            } catch (error) {
                node.error("Error during playback: " + error);
                node.status({ fill: "red", shape: "ring", text: "Error during playback" });
            }
        }

        node.on('input', function(msg) {
            if (msg.command) {
                switch (msg.command) {
                    case 'clear':
                        clearPlayback();
                        break;
                    case 'start':
                        startPlayback();
                        break;
                    case 'stop':
                        stopPlayback();
                        break;
                    default:
                        node.warn(`Received unknown command: ${msg.command}`);
                }

            } else if (msg.type === 'SBF' && msg.block && typeof msg.block.TOW === 'number' && typeof msg.block.WNc === 'number') {
                if (isPlaying) {
                    node.warn("Cannot add messages while playback is active. Stop playback first.");
                }

                const timestamp_ms = TOW_to_ms(msg.block.WNc, msg.block.TOW);

                if (timestamp_ms < Date.now() - MS_IN_YEAR * 30){
                    node.warn("Message timestamp is too old - skipping");
                    return;
                }
                
                messageBuffer.push({ timestamp: timestamp_ms, message: msg });
                node.status({ fill: "grey", shape: "ring", text: `${messageBuffer.length} msgs buffered` });
            }
        });

        node.on('close', function() {
            stopPlayback();
            clearPlayback();
        });
    }

    RED.nodes.registerType("player", PlayerNode);
};
