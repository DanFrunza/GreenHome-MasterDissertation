import time
import threading
import paho.mqtt.client as mqtt
from flask import Flask, request, jsonify
from config import CLOUD_BROKER, CLOUD_PORT
from handlers.measurement_handler import handle_measurement
from handlers.system_handler import handle_system

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to cloud broker")
        client.subscribe("+/home/#")
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    print(f"[RECEIVED] {topic} → {payload[:80]}")

    parts = topic.split("/")
    # home1 / home / ha     / sensor.co2_level
    # home1 / home / system / status
    #  [0]    [1]    [2]      [3]

    if len(parts) < 4 or parts[1] != "home":
        return

    home_id  = parts[0]
    category = parts[2]
    command  = parts[3]

    if category == "ha":
        entity_id = command  # sensor.co2_level, switch.ventilation ...
        handle_measurement(home_id, entity_id, payload)
    elif category == "system":
        handle_system(client, home_id, command, payload)

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

app = Flask(__name__)

@app.route('/publish', methods=['POST'])
def publish():
    data = request.json
    topic = data.get('topic')
    payload = data.get('payload')
    if not topic or payload is None:
        return jsonify({'error': 'topic and payload required'}), 400
    client.publish(topic, str(payload), qos=1)
    print(f"[PUBLISH] {topic} → {payload}")
    return jsonify({'ok': True})

threading.Thread(
    target=lambda: app.run(host='0.0.0.0', port=5000, use_reloader=False),
    daemon=True
).start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("Shutting down...")
    client.loop_stop()
    client.disconnect()
