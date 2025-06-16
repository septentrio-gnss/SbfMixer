module.exports = function(RED) {
    "use strict";
    const PREDEFINED_COMMANDS = ["sso", "sdio", "sno", "spm", "erst"];

    function AckCommandNode(config) {
        RED.nodes.createNode(this, config);
        this.custom_commands = (config.custom_commands || "").split(',').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
        this.ack_all = config.ack_all || false;
        PREDEFINED_COMMANDS.forEach(cmd => {
            this[`ack_${cmd}`] = config[`ack_${cmd}`] || false;
        });

        var node = this;

        node.on('input', function(msg) {
            if (msg.type === "septentrio_command") {
                const incomingCommand = msg.command_info;
                let shouldAck = false;

                if (node.ack_all) {
                    shouldAck = true;
                } else {
                    // Predefined commands
                    if (PREDEFINED_COMMANDS.includes(incomingCommand) && node[`ack_${incomingCommand}`]) {
                        shouldAck = true;
                    }
                    // Custom commands if not already acknowledged
                    if (!shouldAck && node.custom_commands.includes(incomingCommand)) {
                        shouldAck = true;
                    }
                }

                if (shouldAck) {
                    const replyMessage = `$R: ${incomingCommand}`;
                    const payloadBuffer = Buffer.from(replyMessage, 'ascii');

                    const newMsg = {
                        type: "septentrio_replie",
                        payload: payloadBuffer,
                        message: replyMessage,
                    };
                    node.send([null, newMsg]);
                } else {
                    node.send([msg, null]);
                }
            } else {
                node.send([msg, null]);
            }

        });
    }
    RED.nodes.registerType("ack-command", AckCommandNode);
}

