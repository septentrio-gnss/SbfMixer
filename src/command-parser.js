module.exports = function(RED) {
    "use strict";
    function CommandParserNode(config) {
        RED.nodes.createNode(this,config);
        var node = this;

        // Create a set of short command names for efficient lookup
        const shortCommands = new Set(Object.values(require('./commands-list')));

        node.on('input', function(msg) {
            if (msg.payload) {
                try {
                    let payloadString = msg.payload.toString('utf-8').trim();

                    // Some tools send SSSSSSSSSS before theirs commands
                    // Split this into 2 commands.
                    if(payloadString.startsWith("SSSSSSSSSS")){
                        node.send({
                            type: "receiver_command",
                            payload: "SSSSSSSSSS\n",
                            command_info: "SSSSSSSSSS"
                        });

                        msg.payload = msg.payload.slice(10); // Remove 10 first chars
                        payloadString = msg.payload.toString('utf-8').trim();
                        if(payloadString === ""){
                            return;
                        }
                    }


                    const firstWord = payloadString.split(' ')[0].split(',')[0];
                    
                    // Short command
                    if (shortCommands.has(firstWord)) {
                        node.send({
                            type: "receiver_command",
                            payload: msg.payload,
                            command_info: firstWord
                        });
                        return;
                    }
 
 
                    // Long command name
                    const longCommand = Object.entries(require('./commands-list')).find(([long, short]) => long === firstWord);
                    if (longCommand) {
                        node.send({
                            type: "receiver_command",
                            payload: msg.payload,
                            command_info: longCommand[1]
                        });
                        return;
                    }
                    
                    node.warn(`No valid command found in payload. First word: ${firstWord} payload: ${msg.payload} str: ${payloadString}`);
                    node.send(msg);

                } catch (err) {
                    node.warn("Error parsing payload: " + err);
                    node.send(msg);
                }
            
            } else {
                node.warn("Input payload have no payload.");
                node.send({
                    type: "unknown",
                    payload: msg.payload,
                });
            }
        });
    }
    RED.nodes.registerType("command-parser", CommandParserNode);
}
