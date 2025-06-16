import os
import sys
import fcntl
import base64
import json
import sbf_parser
from time import sleep
import traceback


fd = sys.stdin.fileno()
flags = fcntl.fcntl(fd, fcntl.F_GETFL)
fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)


buffer = ""
i = 0
while True:
    # Read up to 4096 bytes from stdin
    try:
        data = os.read(fd, 4096)
        if len(data) == 0:
            sleep(0.01) # 10ms

        else:
            buffer += data.decode('utf-8')

            while i + 10 < len(buffer):
                if buffer[i: i+10] == "##########":
                    try:
                        block = json.loads(buffer[0:i])
                        buffer = buffer[i+10:]
                        i = 0

                        status, binary = sbf_parser.encode(block, payload_priority=-4) # No payload

                        encoded_block = "".join([chr(byte) for byte in binary]) + "##########"
                        print(encoded_block, end="", flush=True)

                    except json.JSONDecodeError as e:
                        print(f"JSON decode error: {e}", file=sys.stderr)
                    except Exception as e:
                        print(f"Error : {traceback.format_exc()}", file=sys.stderr)

                else:
                    i += 1
    except BlockingIOError:
        pass

    
