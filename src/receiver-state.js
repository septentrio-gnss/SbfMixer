module.exports = function(RED) {
    function ReceiverStateNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        const ReceiverState = {
            NO_MESSAGE: "noMessage",
            IDLE: "idle",
            CONNECTED: "connected", 
            JAMMED: "jammed",
            SPOOFING: "spoofing",
            JAMMED_AND_SPOOFING: "jammedAndSpoofing",
            SECURED: "secured",
            UNKNOW: "unknow"
        };
        Object.freeze(ReceiverState);

        let currentStatus = ReceiverState.IDLE; 
        const IDLE_TIMEOUT = 4000; // 4 seconds
        let lastStatusTime = 0;
        let intervalId = null;

        function setStatus(status){
            lastStatusTime = Date.now();

            if(status === currentStatus){
                return;
            }
            currentStatus = status;

            switch(currentStatus){
                case ReceiverState.IDLE:
                    node.status({ fill: "black", shape: "dot", text: "no sbf messages" });
                    break;
                case ReceiverState.CONNECTED:
                    node.status({ fill: "blue", shape: "dot", text: "connected (no status block received)" });
                    break;
                case ReceiverState.JAMMED:
                    node.status({ fill: "red", shape: "dot", text: "jammed" });
                    break;
                case ReceiverState.SPOOFING:
                    node.status({ fill: "red", shape: "dot", text: "spoofing" });
                    break;
                case ReceiverState.JAMMED_AND_SPOOFING:
                    node.status({ fill: "red", shape: "dot", text: "jammed and spoofing" });
                    break;
                case ReceiverState.SECURED:
                    node.status({ fill: "green", shape: "dot", text: "secured" });
                    break;
                case ReceiverState.NO_MESSAGE:
                    node.status({ fill: "gray", text: "no message received" });
                    break;
                default:
                    node.status({ fill: "gray", text: "unknown" });
                    break;
            }
        }

        // Start the interval timer
        intervalId = setInterval(() => {
            if (lastStatusTime + IDLE_TIMEOUT < Date.now()) {
                setStatus(ReceiverState.NO_MESSAGE);
            }
        }, 2300);

        node.on('input', function(msg) {
            let new_status = ReceiverState.IDLE;

            if(msg.type && msg.type === "SBF"){
                new_status = ReceiverState.CONNECTED;

                if (msg.blockName == 'RFStatus' && msg.block && 'Flags' in msg.block) {
                    switch(msg.block.Flags & 0b11){
                        case 0:
                            new_status = ReceiverState.SECURED;
                            break;
                        case 1:
                            new_status = ReceiverState.JAMMED;
                            break;
                        case 2:
                            new_status = ReceiverState.SPOOFING;
                            break;
                        case 3:
                            new_status = ReceiverState.JAMMED_AND_SPOOFING;
                            break;
                    }
                }
            }


            switch(new_status){
                case ReceiverState.IDLE:
                    if(lastStatusTime + IDLE_TIMEOUT < Date.now()){
                        setStatus(new_status);
                    }
                    break;

                case ReceiverState.CONNECTED:
                    if(
                        lastStatusTime + IDLE_TIMEOUT < Date.now()
                        || currentStatus === ReceiverState.IDLE
                    ){
                        setStatus(new_status);
                    }
                    break;

                // Always update status immediately if it's not IDLE or CONNECTED
                default:
                    setStatus(new_status);
                    break;
            }
        });
    

        node.on('close', function() {
            if (intervalId) {
                clearInterval(intervalId);
            }
            node.status({});
        });
    }

    RED.nodes.registerType("receiver-state", ReceiverStateNode);
}
