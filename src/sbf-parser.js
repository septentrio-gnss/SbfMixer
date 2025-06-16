module.exports = function(RED) {
    "use strict";
    
    function SbfParserNode(config) {
        RED.nodes.createNode(this, config);
        let sbfSize = 0;
        var node = this;
        
        // Import child_process module to execute Python scripts
        const { spawn } = require('child_process');
        const path = require('path');
        
        // Get parser name from config or generate a default one
        let parserName = config.parser_name;
        if (!parserName || parserName.trim() === "") {
            const randomSuffix = Math.random().toString(36).substring(2, 7);
            parserName = `parser_${randomSuffix}`;
        }

        // Status tracking variables
        node.log(`Initializing sbf-parser with name: ${parserName}`);
        const statusUpdateIntervalMs = 1000;
        let statusIntervalId = setInterval(updateStatus, statusUpdateIntervalMs);
        let otherSize = 0;
        let inputSize = 0;
        let lastUpdateTime = Date.now();
        let pythonProcess = null;

        function cleanupProcess() {
            if (pythonProcess) {
                try {
                    // End stdin to signal the Python process to exit gracefully
                    pythonProcess.stdin.end();
                    // Give it a moment to exit gracefully
                    setTimeout(() => {
                        if (pythonProcess) {
                            pythonProcess.kill('SIGTERM');
                            pythonProcess = null;
                        }
                    }, 100);
                } catch (error) {
                    node.warn(`Error during process cleanup: ${error.message}`);
                }
            }
        }

        function start_parser(){
            // Cleanup any existing process before starting a new one
            cleanupProcess();
            
            // Spawn Python process once
            pythonProcess = spawn('python', [path.join(__dirname, 'python_parser.py')]);
            
            // Handle Python process stdout
            let buffer = '';
            pythonProcess.stdout.on('data', (data) => {
                buffer += data.toString();
                // Process complete JSON objects
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('##########')) !== -1) {

                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 10);
                    
                    try {
                        const block = JSON.parse(line);
                        send_block(block);
                    } catch (error) {
                        node.warn(`Failed to parse JSON from Python output: ${error.message}\nLine: ${line}`);
                    }
                }
            });

            // Handle Python process errors
            pythonProcess.stderr.on('data', (data) => {
                node.warn(`Python parser error: ${data.toString()}`);
            });

            pythonProcess.on('error', (error) => {
                node.error(`Failed to start Python process: ${error.message}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    node.warn(`Python process exited with code ${code}, restarting it.`);
                    pythonProcess = start_parser();
                }else{
                    node.warn(`Python process exited with code ${code}.`);
                }
            });
        }
        start_parser();

        node.on('input', function(msg) {
            if(!msg) {
                return;
            }

            // Handle buffer input
            if (msg.payload && Buffer.isBuffer(msg.payload)) {
                inputSize += msg.payload.length;
                pythonProcess.stdin.write(msg.payload);
            
            } else {
                // Pass through messages without payload
                msg._parsed_by = parserName;
                node.send(msg);
            }
        });

        // -------------------------- Send block --------------------------
        function send_block(block) {
            // Create message
            const result = {
                type: block.blockType,
                block: block,
                payload: Buffer.from(block.payload, 'base64'),
                _parsed_by: parserName
            };

            if (block.blockName) {
                result.blockName = block.blockName;
            }

            // Send message
            delete result.block.payload;

            // Monitor
            if(result.type == "SBF"){
                sbfSize += result.payload.length;
            }else{
                otherSize += result.payload.length;
            }

            // node.warn(`Send ! ${JSON.stringify(result)}`);
            node.send(result);
        }
        
        // -------------------------- Closing --------------------------
        node.on('close', function() {
            // Clear status interval and reset status
            if (statusIntervalId) {
                clearInterval(statusIntervalId);
                statusIntervalId = null;
            }
            node.status({});

            // Cleanup Python process
            cleanupProcess();

            RED.log.info("SbfParserNode closed and resources cleaned up");
        });

        // -------------------------- Status Update Logic --------------------------
        function updateStatus() {
            const now = Date.now();
            const deltaTSeconds = (now - lastUpdateTime) / 1000;

            if (deltaTSeconds < 0.1) {
                 return;
            }

            // Function to format bandwidth
            function formatBw(size) {
                let bytesPerSecond = size / deltaTSeconds; // B/s
                if (bytesPerSecond >= 1024 * 1024) {
                    return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s';
                } else if (bytesPerSecond >= 1024) {
                    return (bytesPerSecond / 1024).toFixed(1) + ' kB/s';
                } else {
                    return bytesPerSecond.toFixed(0) + ' B/s';
                }
            }

            node.status({
                fill: "green",
                shape: "dot", // 
                text: `Input : ${formatBw(inputSize)} SBF output : ${formatBw(sbfSize)}`
                //  Other: ${formatBw(inputSize)}
            });

            // Reset for next interval
            inputSize = 0;
            sbfSize = 0;
            otherSize = 0;
            lastUpdateTime = now;
        }

        node.status({ text: "Initialized" });
    }
    
    RED.nodes.registerType("sbf-parser", SbfParserNode);
} 