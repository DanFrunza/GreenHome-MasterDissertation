import os

# MQTT
CLOUD_BROKER = os.getenv("MQTT_CLOUD_HOST", "mqtt-cloud")
CLOUD_PORT = int(os.getenv("MQTT_CLOUD_PORT", 1883))
MQTT_SERVICE_USER = os.getenv("MQTT_SERVICE_USER", "mqtt-service")
MQTT_SERVICE_PASSWORD = os.getenv("MQTT_SERVICE_PASSWORD", "")

# PostgreSQL
DB_HOST = os.getenv("DB_HOST", "postgres-db")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_NAME = os.getenv("DB_NAME", "mydb")
DB_USER = os.getenv("DB_USER", "user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "password")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"