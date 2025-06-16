module.exports = function(RED) {
    "use strict";
    function PacketReplacerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.rules = {}; // Runtime rules map: { blockName: { fieldName: value } }
        node.initialRules = config.initialRules || [];

        function addRule(blockName, fieldName, value) {
            if (blockName == undefined || fieldName == undefined || value == undefined) {
                node.warn("Set command requires 'blockName', 'fieldName', and 'value' in msg.");
                return false;
            }

            if (!node.rules[blockName]) {
                node.rules[blockName] = {};
            }

            node.rules[blockName][fieldName] = value;
            return true;
        }


        // Initialize runtime rules from editor config
        node.initialRules.forEach(rule => {
            addRule(rule.blockName, rule.fieldName, rule.value);
        });


        node.on('input', function(msg) {
            const blockName = msg.blockName;
            const fieldName = msg.fieldName;

            // ---------------- Command Processing ----------------
            if (msg.command && typeof msg.command === 'string') {
                const command = msg.command.toLowerCase();
                try {
                    switch (command) {
                        case 'set':
                            // Requires blockName, fieldName, msg.value
                            if(addRule(blockName, fieldName, msg.value)){
                                node.status({ fill: "blue", shape: "dot", text: `Rule set for ${blockName}/${fieldName}` });
                            }else{
                                node.status({ fill: "red", shape: "dot", text: `Failed to set rule for ${blockName}/${fieldName}` });
                            }
                            break;

                        case 'get':
                            // Send a clone to prevent accidental modification of internal state
                            send([null, { payload: RED.util.cloneMessage(node.rules) }]);
                            node.status({ fill: "blue", shape: "dot", text: "Rules sent to output 2" });
                            break;

                        case 'clear':
                            node.rules = {};
                            node.status({ fill: "blue", shape: "dot", text: "Rules cleared" });
                            break;

                        case 'delete':
                            // Requires blockName, fieldName
                             if (blockName !== undefined && fieldName !== undefined) {
                                if (node.rules[blockName] && node.rules[blockName][fieldName] !== undefined) {
                                    delete node.rules[blockName][fieldName];
                                    if (Object.keys(node.rules[blockName]).length === 0) {
                                        delete node.rules[blockName];
                                    }
                                    node.status({ fill: "blue", shape: "dot", text: `Rule deleted for ${blockName}/${fieldName}` });
                                }else{
                                     node.warn(`Rule not found for delete: ${blockName}/${fieldName}`);
                                     node.status({ fill: "red", shape: "dot", text: `Can't delete rule ${blockName}/${fieldName}` });
                                }
                            } else {
                                node.warn("Delete command requires 'blockName' and 'fieldName' in msg.");
                            }
                            break;

                        default:
                            node.warn(`Unknown command: ${msg.command}`);
                    }
                } catch (err) {
                     node.error("Error processing command: " + err.message, msg);
                }

            // ---------------- Packet Processing ----------------
            } else if (msg.type === 'SBF' && msg.block && blockName) {
                try { 
                    for (const fieldName in node.rules[blockName]) {
                        if (msg.block.hasOwnProperty(fieldName)) {
                            msg.block[fieldName] = node.rules[blockName][fieldName];

                            if(msg.payload != null){
                                delete msg.payload;
                            } // Payload is outdated
                        }
                    }

                    node.send([msg, null]);

                } catch (err) {
                     node.error("Error processing packet: " + err.message, msg);
                }
            }else{
                node.send([msg, null]);
            }
        });

    
        node.on('close', function() {
            node.rules = {};
            node.status({});
        });
    }

    RED.nodes.registerType("packet-replacer", PacketReplacerNode);
}
