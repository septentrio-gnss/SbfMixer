module.exports = function(RED) {
    "use strict";

    function SendSbfCommandNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.sbf_command = config.sbf_command || "";
        this.useButton = config.useButton || false;

        node.on('input', function() {
            if (node.sbf_command) { 
                if (!node.sbf_command.endsWith('\n')) {
                    node.sbf_command += '\n';
                }

                const payloadBuffer = Buffer.from(node.sbf_command, 'ascii');

                node.send({
                    type: "receiver_command",
                    payload: payloadBuffer,
                    command_info: node.sbf_command
                });
                node.status({});
            } else {
                node.warn("Cannot send command: sbf_command not configured.");
                node.status({fill:"red", shape:"ring", text:"Not configured"});
            }
        });
    }

    RED.nodes.registerType("send-sbf-command", SendSbfCommandNode);
}
