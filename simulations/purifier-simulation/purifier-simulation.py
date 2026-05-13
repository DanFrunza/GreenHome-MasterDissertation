import time
import random
import json
import paho.mqtt.client as mqtt

MQTT_BROKER = "mqtt-local"
MQTT_PORT = 1883
HOME_PREFIX = "home"

DEVICE_ID = "sim-purifier"

PM25_TOPIC     = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/pm25"
STATE_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/state"
POWER_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/power"
AVAIL_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/available"
CONTROL_TOPIC  = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/control"
REGISTER_TOPIC = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/register"

pm25 = 30.0
purifier_on = False
POWER_W = 40
PM25_MIN = 2.0
PM25_MAX = 120.0
INTERVAL = 5

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[{DEVICE_ID}] Connected")
        client.publish(AVAIL_TOPIC, "online", retain=True)
        client.subscribe(CONTROL_TOPIC)
        client.publish(REGISTER_TOPIC, json.dumps({
            "attributes": {
                "pm25":  { "unit": "µg/m³", "ha_entity_id": "sensor.pm2_5" },
                "state": { "unit": None,    "ha_entity_id": "switch.purifier" },
                "power": { "unit": "W",     "ha_entity_id": "sensor.purifier_power" }
            }
        }), retain=True)
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    global purifier_on
    payload = msg.payload.decode()
    if payload == "on":
        purifier_on = True
        print(f"[{DEVICE_ID}] Turned ON")
    elif payload == "off":
        purifier_on = False
        print(f"[{DEVICE_ID}] Turned OFF")

def on_disconnect(client, userdata, rc):
    print(f"[{DEVICE_ID}] Disconnected: {rc}")

client = mqtt.Client(client_id=DEVICE_ID)
client.will_set(AVAIL_TOPIC, "offline", qos=1, retain=True)
client.on_connect = on_connect
client.on_message = on_message
client.on_disconnect = on_disconnect
client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
client.loop_start()

try:
    while True:
        if purifier_on:
            pm25 -= random.uniform(0.7, 1.2)
        else:
            if random.random() < 0.2:
                pm25 += 1.0
        pm25 = max(PM25_MIN, min(PM25_MAX, pm25))

        client.publish(PM25_TOPIC, round(pm25, 1))
        client.publish(STATE_TOPIC, "on" if purifier_on else "off")
        client.publish(POWER_TOPIC, POWER_W if purifier_on else 0)

        time.sleep(INTERVAL)

except KeyboardInterrupt:
    print("Shutting down...")
finally:
    client.publish(AVAIL_TOPIC, "offline", retain=True)
    time.sleep(0.5)
    client.loop_stop()
    client.disconnect()