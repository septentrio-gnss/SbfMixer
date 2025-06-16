"use strict";
const { performance } = require('perf_hooks');
const { msgToMs } = require('./time_utils');


module.exports = function(RED) {
    function PlayerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Configuration
        const skipAfterMs = config.skipAfterMs || 2000; // Default 2 second skip threshold
        const skipDurationMs = parseInt(config.skipDurationMs) || 10; // Default 10ms
        let memoryParserName = config.memoryParserName || null; // Get from config or null
        const startAtTOW = config.startAtTOW || 0; // Default 0 (disabled)
        const endAtTOW = config.endAtTOW || null; // Default 0 (disabled)

        // Saving message for spoofing
        let memory = [];
        let relativeTimes = [];
        let timeLastMessage = null;

        // Saving spoofing status
        let i = 0;
        let passedMessages = {};
        let spoofingStartTime = null;

        function init_memory() {
            memory = [];
            relativeTimes = [];
            timeLastMessage  = null;
            init_playback();
            node.status({ fill: "grey", shape: "ring", text: "Spoofer init_memory" });
        }

        function init_playback(){
            i = 0;
            passedMessages = {};
            spoofingStartTime = null;
        }

        function updateStatus(){
            let message = "";
            if(spoofingStartTime && memory.length != 0){
                // Update status with progress and estimated time remaining
                const elapsedSec = Math.round((performance.now() - spoofingStartTime) / 1000);
                const elapsedMin = Math.floor(elapsedSec / 60);
                const remainingSecPart = elapsedSec % 60;

                message += `Playing ${elapsedMin}m ${remainingSecPart}s`;
            }else{
                message += `${relativeTimes.length} blocks` ;
            }

            if (relativeTimes.length > 0) {
                // node.warn(`Time : ${relativeTimes[relativeTimes.length - 1]} and type : ${typeof relativeTimes[relativeTimes.length - 1]}`);
                message += ` / ~${Math.round(relativeTimes[relativeTimes.length - 1] / (60 * 1000))}min`;
            }else{
                message += '/ 0s of recording.'
            }

            node.status({
                fill: spoofingStartTime ? "green" : "blue",
                shape: "ring",
                text: message 
            });
        }

        function isInTimeRange(msg) {
            if (!msg.block || !msg.block.TOW)
                return true; // If no TOW, don't filter
            const tow = msg.block.TOW * 1000;
            if (tow < startAtTOW)
                return false;
            if (endAtTOW && tow > endAtTOW)
                return false;
            return true;
        }

        node.on('input', function(msg) {
            // Commands
            if(msg.command){
                switch (msg.command) {
                    case 'reset':
                        init_memory();
                        break;
                    case 'restart':
                        init_playback();
                        break;
                    case 'setSpoofingParser':
                        init_memory();
                        memoryParserName = msg._parsed_by;
                        node.status({
                            fill: "blue", shape: "ring",
                            text: `Parser set to: ${memoryParserName}`
                        });
                        break;
                    case 'fastForward':
                        if (!spoofingStartTime) {
                            node.warn("Cannot fast forward: playback not started");
                            return;
                        }
                        const forwardTime = msg.time || 0;
                        spoofingStartTime -= forwardTime;
                        node.status({
                            fill: "blue", shape: "ring",
                            text: `Fast forwarded ${forwardTime}ms`
                        });
                        break;
                    case 'setTime':
                        if (!spoofingStartTime) {
                            node.warn("Cannot set time: playback not started");
                            return;
                        }
                        const targetTime = msg.time || 0;
                        spoofingStartTime = performance.now() - targetTime;
                        node.status({
                            fill: "blue", shape: "ring",
                            text: `Time set to ${targetTime}ms`
                        });
                        break;
                    default:
                        node.warn(`Received unknown command: ${msg.command}`);
                        break;
                }
                node.status({
                    fill: "gray", shape: "ring",
                    text: `Command : ${msg.command}`
                });
                return;
            }

            // Parsed block
            if (msg._parsed_by == null){
                node.warn(`Received a message missing _parsed_by argument : ${msg}`);
                node.send(msg);
                return;
            }

            // memoryParserName
            if(memoryParserName == null){
                node.status({
                    fill: "red", shape: "ring",
                    text: `memoryParserName not configured.`
                });
                node.send(msg);
                return;
            }

            // Adding message
            if (msg._parsed_by == memoryParserName){
                if(msg.type != "SBF"){
                    return;
                }

                // Check time range
                if (!isInTimeRange(msg)) {
                    return;
                }

                if(memory.length == 0){
                    memory = [msg.block];
                    relativeTimes = [0];
                    timeLastMessage = msgToMs(msg, /*defaultTime*/ 0);
                }else{
                    const timeMessage = msgToMs(msg, /*defaultTime*/ timeLastMessage);
                    let delta = timeMessage - timeLastMessage;

                    if(delta < 0 || delta > skipAfterMs){
                        delta = skipDurationMs;
                    }
                    
                    if (msg.block) {
                        memory.push(msg.block);
                        relativeTimes.push(relativeTimes[relativeTimes.length - 1] + delta);
                    } else {
                        node.warn("Received message without block data");
                    }

                    timeLastMessage = timeMessage;
                }

                updateStatus();
                return;
            }

            // Only spoof sbf
            if(msg.type != "SBF"){
                node.send(msg);
                return;
            }

            // First message
            if(!spoofingStartTime){
                init_playback();
                spoofingStartTime = performance.now();
            }

            // Not enough messages
            if(relativeTimes.length == 0 || (relativeTimes[relativeTimes.length - 1] < 5000)){ // At least 5s
                node.send(msg);
                updateStatus();
                return
            }

            // Reading spoofed messages
            let relativeTime = performance.now() - spoofingStartTime;
            while(relativeTimes[i] < relativeTime && i < memory.length){
                const replayedBlock = memory[i];
                if (replayedBlock.blockName) {
                    passedMessages[replayedBlock.blockName] = replayedBlock;
                }
                i++;
            }

            // Spoof message
            if(msg.blockName && (msg.blockName in passedMessages)){
                msg.block = passedMessages[msg.blockName];
                if(msg.payload){
                    delete msg.payload;
                }
            }

            // End of memory reach
            if(i == memory.length){
                init_playback();
            }

            updateStatus();
            node.send(msg);
        });
    
    }

    RED.nodes.registerType("spoofer", PlayerNode);
};
