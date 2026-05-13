import time
import random
import json
import paho.mqtt.client as mqtt

MQTT_BROKER = "mqtt-local"
MQTT_PORT = 1883
HOME_PREFIX = "home"

DEVICE_ID = "sim-ventilation"

CO2_TOPIC      = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/co2"
STATE_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/state"
POWER_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/power"
AVAIL_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/available"
CONTROL_TOPIC  = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/control"
REGISTER_TOPIC = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/register"

co2 = 600.0
ventilation_on = False
POWER_W = 50
CO2_MIN = 300.0
CO2_MAX = 2000.0
INTERVAL = 5

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[{DEVICE_ID}] Connected")
        client.publish(AVAIL_TOPIC, "online", retain=True)
        client.subscribe(CONTROL_TOPIC)
        client.publish(REGISTER_TOPIC, json.dumps({
            "attributes": {
                "co2":   { "unit": "ppm", "ha_entity_id": "sensor.co2_level" },
                "state": { "unit": None,  "ha_entity_id": "switch.ventilation" },
                "power": { "unit": "W",   "ha_entity_id": "sensor.ventilation_power" }
            }
        }), retain=True)
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    global ventilation_on
    payload = msg.payload.decode()
    if payload == "on":
        ventilation_on = True
        print(f"[{DEVICE_ID}] Turned ON")
    elif payload == "off":
        ventilation_on = False
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
        if ventilation_on:
            co2 -= random.uniform(2.0, 5.0)
        else:
            if random.random() < 0.3:
                co2 += random.uniform(1.0, 3.0)
        co2 = max(CO2_MIN, min(CO2_MAX, co2))

        client.publish(CO2_TOPIC, round(co2, 1))
        client.publish(STATE_TOPIC, "on" if ventilation_on else "off")
        client.publish(POWER_TOPIC, POWER_W if ventilation_on else 0)

        time.sleep(INTERVAL)

except KeyboardInterrupt:
    print("Shutting down...")
finally:
    client.publish(AVAIL_TOPIC, "offline", retain=True)
    time.sleep(0.5)
    client.loop_stop()
    client.disconnect()