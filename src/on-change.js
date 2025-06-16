module.exports = function(RED) {
    "use strict";
    function OnChangeNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.rules = config.rules || []; // Rules from editor { blockId, fieldName, outputIndex }
        node.lastValues = {}; // Store last values { outputIndex: value }

        // Initialize lastValues store based on rules
        node.rules.forEach((rule) => {
            node.lastValues[rule.outputIndex] = undefined; // Initialize last value
        });

        node.on('input', function(msg) {
            if (msg.type === 'SBF' && msg.blockName && msg.block) {
                const blockId = String(msg.blockName);
                let outputs = new Array(node.rules.length).fill(null); // Initialize output array
                let statusText = "";
                let changed = false;

                try {
                    node.rules.forEach(rule => {
                        if (String(rule.blockId) === blockId && msg.block.hasOwnProperty(rule.fieldName)) {
                            const currentValue = msg.block[rule.fieldName];
                            const lastValue = node.lastValues[rule.outputIndex];

                            // Compare current value with last known value
                            if (currentValue !== lastValue) {
                                node.lastValues[rule.outputIndex] = currentValue; // Update last value

                                // Always send a clone of the incoming message
                                let outputMsg = RED.util.cloneMessage(msg);
                                outputs[rule.outputIndex] = outputMsg;

                                statusText = `Change detected: ${blockId}/${rule.fieldName}`;
                                changed = true;
                            }
                        }
                    });

                    if (changed) {
                         node.status({ fill: "green", shape: "dot", text: statusText });
                         node.send(outputs);
                    }

                } catch (err) {
                    node.error("Error processing SBF block: " + err.message, msg);
                    node.status({ fill: "red", shape: "dot", text: "Error processing" });
                }
            }
        });

        node.on('close', function() {
            node.lastValues = {}; // Clear state on close/redeploy
            node.status({});
        });
    }

    RED.nodes.registerType("onChange", OnChangeNode);
}
