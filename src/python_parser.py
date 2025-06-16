from sbf_parser import SbfParser
import os
import sys
import json
import fcntl
from time import sleep

# You can read directly from a serial connexion using :
# cat /dev/ttyACM0 | python3 read_stdin.py

# Set stdin to non-blocking
fd = sys.stdin.fileno()
flags = fcntl.fcntl(fd, fcntl.F_GETFL)
fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

def convert_bytes(data):
    if type(data) in (list, tuple):
        return [convert_bytes(elem) for elem in data]
    if type(data) == dict:
        return {
            key: convert_bytes(value)
            for key, value in data.items()
        }
    if type(data) in (bytes, bytearray):
        return [bytes for bytes in data]
    
    return data

parser = SbfParser()

while True:
    # Read up to 1024 bytes from stdin
    try:
        data = os.read(fd, 1024)  # returns immediately
        if len(data) == 0:
            sleep(0.01) # 10ms
        else:
            for block_desc, infos in parser.parse(data):
                print(json.dumps(convert_bytes(infos)), "##########", flush=True) # Use a block delimiter
    
    except BlockingIOError:
        pass
