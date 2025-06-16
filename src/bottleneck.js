module.exports = function(RED) {
    "use strict";

    function BottleneckNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Retrieve configuration
        node.priorities = config.priorities || {};
        node.name = config.name;
        node.allowMultiple = config.allowMultiple === true;

        // Initialize runtime state
        node.runtimePriorities = {};
        node.currentHighestPriority = -Infinity;
        node.activeInputs = [];

        // Function to recalculate highest priority and active inputs
        function recalculateActiveInputs() {
            node.log(`Recalculating active inputs. Current priorities: ${JSON.stringify(node.runtimePriorities)}`);
            node.currentHighestPriority = -Infinity;
            node.activeInputs = [];

            const sourceIds = Object.keys(node.runtimePriorities);

            for (const sourceId of sourceIds) {
                const priority = node.runtimePriorities[sourceId];
                 if (priority === undefined || priority === null) {
                    node.runtimePriorities[sourceId] = 0;
                 }

                if (priority > node.currentHighestPriority) {
                    node.currentHighestPriority = priority;
                    node.activeInputs = [sourceId]; // New highest, reset active list
                
                } else if (priority === node.currentHighestPriority && node.allowMultiple) {
                    node.activeInputs.push(sourceId);
                }
            }
            node.log(`Recalculation complete. Highest Prio: ${node.currentHighestPriority}, Active Inputs: ${JSON.stringify(node.activeInputs)}`);
             const activeInputCount = node.activeInputs.length;
             const knownInputCount = sourceIds.length;

            // Update node status
            if (activeInputCount > 0) {
                const activeInputLabels = node.activeInputs.join(', '); // Join the source IDs
                const statusText = node.allowMultiple ? `Active: ${activeInputLabels} (Prio: ${node.currentHighestPriority})` : `Active: ${node.activeInputs[0]} (Prio: ${node.currentHighestPriority})`;
                 node.status({ fill: "green", shape: "dot", text: statusText });
            } else {
                 const statusText = knownInputCount > 0 ? `No active inputs (Known sources: ${knownInputCount})` : "No sources yet";
                node.status({ fill: "grey", shape: "ring", text: statusText });
            }
        }

        // Initial calculation (based on initially loaded priorities)
        recalculateActiveInputs();

        // Input message handler
        node.on('input', function(msg) {
            // Check if message has the _parsed_by field
            if (typeof msg._parsed_by !== 'string' || msg._parsed_by.trim() === '') {
                node.log("Message received without valid _parsed_by string field. Forwarding anyway.");
                node.log(`Forwarding message without _parsed_by: ${JSON.stringify(msg)}`);
                node.send(msg);
                return;
             }

            const sourceId = msg._parsed_by;
            // Dynamically add the source if not seen before, default priority 0
            if (!(sourceId in node.runtimePriorities)) {
                node.runtimePriorities[sourceId] = 0; // Default priority
                node.log(`New source detected: ${sourceId}. Initial priority set to 0.`);
                recalculateActiveInputs();
            }

            // Check for command message
            if (msg.command == "set") {
                const newPriority = msg.priority;

                if(typeof newPriority != 'number'){
                    node.warn(`Invalid priority value received for Source '${sourceId}': ${msg.priority}`);
                    return;
                }

                node.log(`Processing 'set' command for source '${sourceId}'. New priority: ${newPriority}`);
                
                if (node.runtimePriorities[sourceId] != newPriority) {
                    node.log(`Processing 'set' command for source '${sourceId}'. New priority: ${newPriority}`);
                    node.runtimePriorities[sourceId] = newPriority;
                    node.log(`Set priority for Source '${sourceId}' to ${newPriority}`);
                    recalculateActiveInputs();
                }
                return;

            } else if (msg.command === "setAllowMultiple") {
                // Handle command to change allowMultiple setting
                if (typeof msg.allowMultiple === 'boolean') {
                     if (node.allowMultiple !== msg.allowMultiple) {
                        node.log(`Processing 'setAllowMultiple' command. New value: ${msg.allowMultiple}`);
                        node.allowMultiple = msg.allowMultiple;
                        node.log(`Set allowMultiple to ${node.allowMultiple}`);
                        recalculateActiveInputs();
                    }
                } else {
                    node.warn(`Invalid allowMultiple value received: ${msg.allowMultiple}`);
                }
                return;

            } else {
                // Regular message
                if (node.activeInputs.includes(sourceId)) { // Check if the source ID is in the active list
                    node.send(msg);
                }
                return;
            }
        });

        node.on('close', function() {
            node.status({});
        });
    }

    RED.nodes.registerType("bottleneck", BottleneckNode);
};
