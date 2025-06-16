module.exports = function(RED) {
    function SbfencoderNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        // Import child_process module to execute Python scripts
        const { spawn } = require('child_process');
        const path = require('path');
        

        // Status tracking variables
        const statusUpdateIntervalMs = 1000;
        let statusIntervalId = setInterval(updateStatus, statusUpdateIntervalMs);
        let totalSize = 0;
        let encodedSize = 0;
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

        function start_encoder(){
            // Cleanup any existing process before starting a new one
            cleanupProcess();
            
            // Spawn Python process once
            pythonProcess = spawn('python', [path.join(__dirname, 'python_encoder.py')]);
            
            // Handle Python process stdout
            let buffer = Buffer.alloc(0);
            pythonProcess.stdout.on('data', (data) => {
                received = Buffer.from(data.toString(), 'ascii');

                buffer = Buffer.concat([buffer, received]);

                // Process Binary
                let newlineIndex = buffer.indexOf('##########');

                while (newlineIndex !== -1) {
                    const payload = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 10);

                    node.send({payload: payload});

                    totalSize += payload.length;
                    encodedSize += payload.length;

                    newlineIndex = buffer.indexOf('##########');
                }
            });

            // Handle Python process errors
            pythonProcess.on('error', (error) => {
                node.error(`Failed to start Python process: ${error.message}`);
            });
            
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    node.warn(`Python process exited with code ${code}, restarting it.`);
                    pythonProcess = start_encoder();
                }else{
                    node.warn(`Python process exited with code ${code}.`);
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                node.warn(`Python encoder error: ${data.toString()}`);
            });
        }
        start_encoder();

        node.on('input', function(msg) {
            if(!msg) {
                return;
            }

            // Handle buffer input
            if (Buffer.isBuffer(msg.payload)) {
                node.send({payload: msg.payload});
                totalSize += msg.payload.length;

            } else if (msg.block){
                // Convert msg.block to string if it's not already
                pythonProcess.stdin.write(JSON.stringify(msg.block, space=0));
                pythonProcess.stdin.write("##########");

            } else {
                node.send(msg);
            }
        });

        
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

            RED.log.info("SbfencoderNode closed and resources cleaned up");
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
                bytesPerSecond = size / deltaTSeconds; // B/s
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
                shape: "dot",
                text: `Total: ${formatBw(totalSize)} Re-encoded: ${formatBw(encodedSize)} `
            });

            // Reset for next interval
            encodedSize = 0;
            totalSize = 0;
            lastUpdateTime = now;
        }

        node.status({ text: "Initialized" });
    }
    
    RED.nodes.registerType("sbf-encoder", SbfencoderNode);
} 