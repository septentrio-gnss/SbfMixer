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
        let hasImportError = false; // Track if we have an import error to prevent restarting

        // Function to reset import error state and retry
        function resetImportError() {
            if (hasImportError) {
                hasImportError = false;
                node.log("Resetting import error state, attempting to restart Python process");
                node.status({ text: "Retrying..." });
                start_parser();
            }
        }

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
            // Don't start if we have an import error
            if (hasImportError) {
                node.warn("Skipping Python process start due to previous import error");
                return null;
            }
            
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
                const errorData = data.toString();
                node.warn(`Python parser error: ${errorData}`);
                
                // Check if this is an import error for SbfParser
                if (errorData.includes("ImportError: cannot import name 'SbfParser' from 'sbf_parser'")) {
                    hasImportError = true;
                    node.error("SbfParser import error detected. Please install sbfparser package: pip install sbfparser");
                    // Update status to show error
                    node.status({
                        fill: "red",
                        shape: "ring",
                        text: "Error: Install pip sbfparser package"
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                node.error(`Failed to start Python process: ${error.message}`);
            });

            pythonProcess.on('close', (code) => {
                if (code !== 0 && !hasImportError) {
                    node.warn(`Python process exited with code ${code}, restarting it.`);
                    pythonProcess = start_parser();
                } else if (hasImportError) {
                    node.warn(`Python process exited with code ${code} due to import error. Not restarting.`);
                } else {
                    node.warn(`Python process exited with code ${code}.`);
                }
            });
            
            return pythonProcess;
        }
        start_parser();

        node.on('input', function(msg) {
            if(!msg) {
                return;
            }

            // Check if user wants to reset import error
            if (msg.reset_import_error === true) {
                resetImportError();
                return;
            }

            // Don't process if we have an import error
            if (hasImportError) {
                node.warn("Cannot process input due to SbfParser import error. Please install sbfparser package or send message with reset_import_error: true to retry.");
                return;
            }

            // Handle buffer input
            if (msg.payload && Buffer.isBuffer(msg.payload)) {
                inputSize += msg.payload.length;
                if (pythonProcess && pythonProcess.stdin) {
                    pythonProcess.stdin.write(msg.payload);
                } else {
                    node.warn("Python process not available, cannot process buffer input");
                }
            
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
            // Don't update status if we have an import error (status is already set)
            if (hasImportError) {
                return;
            }
            
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