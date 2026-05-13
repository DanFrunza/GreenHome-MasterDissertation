import time
import paho.mqtt.client as mqtt
from config import CLOUD_BROKER, CLOUD_PORT
from handlers.measurement_handler import handle_measurement
from handlers.availability_handler import handle_availability
from handlers.registration_handler import handle_registration

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to cloud broker")
        client.subscribe("+/home/#")
        client.subscribe("+/system/#")
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    print(f"[RECEIVED] {topic} → {payload}")

    parts = topic.split("/")
    # home1 / home / mqtt / device / sim-ventilation / co2
    #  [0]   [1]   [2]    [3]       [4]               [5]

    if len(parts) < 6:
        return

    home_id   = parts[0]  # home1
    source    = parts[2]  # mqtt / native
    dtype     = parts[3]  # device
    device_id = parts[4]  # sim-ventilation, bedroom-heater
    attribute = parts[5]  # co2, state, power, energy, available

    if dtype != "device":
        return
    
    if attribute in ("control", "command"):
        return

    if attribute == "available":
        handle_availability(home_id, device_id, source, payload)
    elif attribute == "register":
        handle_registration(home_id, device_id, payload)
    else:
        handle_measurement(home_id, device_id, source, attribute, payload)

def on_disconnect(client, userdata, rc):
    print(f"Disconnected: {rc}")

client = mqtt.Client(client_id="mqtt-service")
client.on_connect = on_connect
client.on_message = on_message
client.on_disconnect = on_disconnect

print(f"Connecting to {CLOUD_BROKER}:{CLOUD_PORT}...")
client.reconnect_delay_set(min_delay=1, max_delay=32)
client.connect(CLOUD_BROKER, CLOUD_PORT, keepalive=60)
client.loop_start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("Shutting down...")
    client.loop_stop()
    client.disconnect()