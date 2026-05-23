import os

LOCAL_BROKER = os.getenv("MQTT_LOCAL_HOST", "mqtt-local")
LOCAL_PORT   = int(os.getenv("MQTT_LOCAL_PORT", 1883))

HA_URL   = os.getenv("HA_URL", "http://homeassistant:8123")
HA_TOKEN = os.getenv("HA_TOKEN", "")

ALLOWED_DOMAINS = {
    "sensor", "switch", "binary_sensor",
    "light", "climate", "cover", "fan", "lock",
    "media_player", "number", "select",
}

EXCLUDED_PREFIXES = (
    "sensor.backup_",
    "sensor.sun_",
    "binary_sensor.sun_",
)
