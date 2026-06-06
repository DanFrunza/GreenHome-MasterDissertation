import time
import random
import paho.mqtt.client as mqtt

MQTT_BROKER = "mqtt-local"
MQTT_PORT = 1883
HOME_PREFIX = "home"

DEVICE_ID = "sim-humidifier"

HUMIDITY_TOPIC = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/humidity"
STATE_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/state"
POWER_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/power"
AVAIL_TOPIC    = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/available"
CONTROL_TOPIC  = f"{HOME_PREFIX}/mqtt/device/{DEVICE_ID}/control"

humidity = 50.0
humidifier_on = False
POWER_W = 30
HUMIDITY_MIN = 20.0
HUMIDITY_MAX = 80.0
INTERVAL = 5

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[{DEVICE_ID}] Connected")
        client.publish(AVAIL_TOPIC, "online", retain=True)
        client.subscribe(CONTROL_TOPIC)
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    global humidifier_on
    payload = msg.payload.decode()
    if payload == "on":
        humidifier_on = True
        print(f"[{DEVICE_ID}] Turned ON")
    elif payload == "off":
        humidifier_on = False
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
        if humidifier_on:
            humidity += random.uniform(0.5, 1.5)
        else:
            if random.random() < 0.2:
                humidity -= random.uniform(0.3, 0.8)
        humidity = max(HUMIDITY_MIN, min(HUMIDITY_MAX, humidity))

        client.publish(HUMIDITY_TOPIC, round(humidity, 1))
        client.publish(STATE_TOPIC, "on" if humidifier_on else "off")
        client.publish(POWER_TOPIC, POWER_W if humidifier_on else 0)

        time.sleep(INTERVAL)

except KeyboardInterrupt:
    print("Shutting down...")
finally:
    client.publish(AVAIL_TOPIC, "offline", retain=True)
    time.sleep(0.5)
    client.loop_stop()
    client.disconnect()