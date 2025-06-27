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

        function addMultipleRules(blockName, msg) {
            if (blockName == undefined) {
                node.warn("Set command requires 'blockName' in msg.");
                return { success: false, count: 0 };
            }

            // List of system/control fields to ignore
            const systemFields = ['command', 'blockName', 'type', 'block', 'payload', 'topic', '_msgid', '_event'];
            
            let rulesAdded = 0;
            let hasErrors = false;

            // Add all message attributes as rules (except system fields)
            for (const fieldName in msg) {
                if (!systemFields.includes(fieldName) && msg.hasOwnProperty(fieldName)) {
                    if (addRule(blockName, fieldName, msg[fieldName])) {
                        rulesAdded++;
                    } else {
                        hasErrors = true;
                    }
                }
            }

            return { success: !hasErrors && rulesAdded > 0, count: rulesAdded };
        }

        // Initialize runtime rules from editor config
        node.initialRules.forEach(rule => {
            addRule(rule.blockName, rule.fieldName, rule.value);
        });


        node.on('input', function(msg) {
            const blockName = msg.blockName;

            // ---------------- Command Processing ----------------
            if (msg.command && typeof msg.command === 'string') {
                const command = msg.command.toLowerCase();
                try {
                    switch (command) {
                        case 'set':
                            // Add all message attributes as rules (except system fields)
                            const result = addMultipleRules(blockName, msg);
                            if (result.success) {
                                node.status({ fill: "green", shape: "dot", text: `${result.count} rules set for ${blockName}` });
                            } else {
                                node.status({ fill: "red", shape: "dot", text: `Failed to set rules for ${blockName}` });
                            }
                            break;

                        case 'get':
                            // Send a clone to prevent accidental modification of internal state
                            node.send([null, { payload: RED.util.cloneMessage(node.rules) }]);
                            node.status({ fill: "blue", shape: "dot", text: "Rules sent to output 2" });
                            break;

                        case 'clear':
                            node.rules = {};
                            node.status({ fill: "blue", shape: "dot", text: "Rules cleared" });
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
                    if(node.rules[blockName]){
                        for (const fieldName in node.rules[blockName]) {
                            msg.block[fieldName] = node.rules[blockName][fieldName];
                        }
                        
                        // Payload is outdated
                        if(msg.payload != null){
                            delete msg.payload;
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
