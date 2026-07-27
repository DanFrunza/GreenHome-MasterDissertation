# Local agent: bridges Home Assistant with the cloud MQTT broker.
# Subscribes to backend/system/# (discovery) and backend/command/# (device control).
import time
import paho.mqtt.client as mqtt
from config import LOCAL_BROKER, LOCAL_PORT
from handlers.entity_discovery_handler import handle_entity_discovery
from handlers.automation_discovery_handler import handle_automation_discovery
from handlers.command_handler import handle_command

# Maps system topic commands to their handler functions
SYSTEM_HANDLERS = {
    "entity_discovery": handle_entity_discovery,
    "automation_discovery": handle_automation_discovery,
}

AGENT_STATUS_TOPIC = "home/system/agent_status"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to local broker")
        client.publish(AGENT_STATUS_TOPIC, "online", qos=1, retain=True)
        client.subscribe("backend/system/#")
        client.subscribe("backend/command/#")
        # Run discovery immediately on startup
        handle_entity_discovery(client, "{}", retry_forever=True)
        handle_automation_discovery(client, "{}", retry_forever=True)
    else:
        print(f"Connection failed: {rc}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    print(f"[RECEIVED] {topic} → {payload}")

    # Route by topic segment: backend/system/<cmd> or backend/command/<entity_id>
    parts = topic.split("/")
    if len(parts) < 3 or parts[0] != "backend":
        return

    if parts[1] == "system" and len(parts) >= 3:
        command = parts[2]
        handler = SYSTEM_HANDLERS.get(command)
        if handler:
            handler(client, payload)
        else:
            print(f"[WARN] No handler for system command: {command}")

    elif parts[1] == "command" and len(parts) >= 3:
        entity_id = parts[2]
        handle_command(entity_id, payload)

def on_disconnect(client, userdata, rc):
    print(f"Disconnected: {rc}")

client = mqtt.Client(client_id="local-agent")
client.on_connect = on_connect
client.on_message = on_message
client.on_disconnect = on_disconnect

print(f"Connecting to {LOCAL_BROKER}:{LOCAL_PORT}...")
client.will_set(AGENT_STATUS_TOPIC, "offline", qos=1, retain=True)
client.reconnect_delay_set(min_delay=1, max_delay=32)

# Retry connection until the broker is available (e.g. during container startup)
while True:
    try:
        client.connect(LOCAL_BROKER, LOCAL_PORT, keepalive=60)
        break
    except Exception as e:
        print(f"Connection failed: {e}. Retrying in 5s...")
        time.sleep(5)

client.loop_start()

HEARTBEAT_INTERVAL = 60  # seconds

try:
    elapsed = 0
    while True:
        time.sleep(1)
        elapsed += 1
        # Periodically re-publish online status in case the broker restarts
        if elapsed >= HEARTBEAT_INTERVAL:
            elapsed = 0
            if client.is_connected():
                client.publish(AGENT_STATUS_TOPIC, "online", qos=1, retain=True)
except KeyboardInterrupt:
    print("Shutting down...")
    client.loop_stop()
    client.disconnect()
