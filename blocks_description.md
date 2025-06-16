# Blocks description
## Setup receiver
Your first goal is to read information from receiver or play SBF.

### Serial Block
You can read SBF directly from mosaic by :
- Plugging your Mosaic card using USB to your computer
1) Go to https://192.168.3.1/ to enable the output of some SBF messages
2) Go to NMEA/SBF Out
3) Click New SBF Stream
4) Select USB Port
5) Select USB1
6) Choose your messages to output, for example, Status, PVTGeod and GAL
7) Confirm with Ok

![Setup Septentrio receiver](examples/receiver_output_sbf.png)

You should now have SBF stream to your computer, you can check by using cat `/dev/ttyACM1` (could possibly be `/dev/ttyACM1`)
You can now configure your Serial block by giving it a name, the stream (`/dev/ttyACM1`) and the baudrate (`115200`).

![Setup Serial block](examples/configure_serial.png)

### Sbf Parser
The incoming stream from the serial connection use buffer of bytes. To group and decode them, you should pass it to `sbf-parser`.
This block will group buffer according to their header and call a python script to convert them to readable messages.

To do so, you need to install [sbfParser](https://github.com/MJeanneRose/sbfParser), here is an example of a parsed Sbf block :
```json
{
    "type":"SBF",
    "blockName":"ReceiverStatus",
    "block":{
        "blockName":"ReceiverStatus",
        "blockType":"SBF",
        "TOW":4294967295,
        "WNc":65535,
        "Temperature":141,
        "CPULoad":17,
        "RxError":8,
        ...
        "N":4,
        "AGCState":[
            {"FrontendID":0,"Gain":49,"SampleVar":102,"BlankingStat":0},
            {"FrontendID":1,"Gain":56,"SampleVar":102,"BlankingStat":0},
            {"FrontendID":11,"Gain":59,"SampleVar":102,"BlankingStat":0},
            {"FrontendID":3,"Gain":56,"SampleVar":96,"BlankingStat":0}
        ],
    },
    "payload":[36,64, ...],
    "_parsed_by":"name_of_the_parser_used",
}
```

### Playing files

Rather than using serial connection, you can also use .sbf file as an input.
You will need to select output: a single Buffer object and connect it to an sbf-parser.
The file will be converted instantly, if you want to play it in normal speed, you should use the next block Player.


### Player
The player block will remember the message it received and play them on demand.
You can use message with a `command` field with value :
- `Clear` : Delete all registered messages
- `Play` : Start the play of registered messages
- `Stop` : Stop the play of registered messages

When you registered a file, the receiver may not have a precise time estimation. To keep a correct replay speed, two consecutive messages separated by more than 3s (Max wait threshold on block configuration menu) will be considered as unreliable since most information is sent at a pace of 1hz.
Thus, these blocks will be played with a 0.5s gap between them.

## Get information on stream
### receiver-state
This block is used to check if sbf blocks are currently being output in your flows.
By connecting it, you will get the status of the receiver:
- `IDLE` : No messages received
- `No message` : The block receives message but no sbf blocks are received.
- `Connected` : The block is receiving sbf data.
- `Secure` : The block have received an SBFStatus block with a secure flag.
- `Spoofing` / `Jamming` / `Spoofing + Jamming` : The block have received a SBFStatus with a flag mentioning Spoofing and/or Jamming.

### on-change
You may have lots of messages but only want to check on change of value.
The block on-change can be configured to watch as many fields of any block, it will register message history and send sbf block when their value changed from the last block of this category.
The message will be output to the corresponding output.

## Editing blocks

### Packet Replacer
You may want to edit a specific value of sbf blocks for your simulations, for example signal quality or spoofing status.
To do so, you can use the packet replacer and configure it by using these examples :
command:"set", msg.blockId:"RFStatus", msg.fieldName:"Flags", msg.value:"3" : Will replace each flags value of RFStatus block by 3.
command:"delete", msg.blockId:"RFStatus", msg.fieldName:"Flags" : Delete rules made for flags of RFStatus blocks
command:"clear" : Delete all editing rules
command:"get" : Send a messages with all rules

### Spoofing
Next-release.

## Sending commands
### Send-command
You can configure this node to be activated on click or on each message received. This command will send a message to configure septentrio receiver, list of messages available can be found in your receiver reference manual available on Septentrio website.

### ack-command
This block allows you to replace some command messages by an ack message. This block can be used to catch reset or setting edition before it reach the receiver and send a fake ack message to your base station.
