import time
import threading
from datetime import datetime, timezone, timedelta
import paho.mqtt.client as mqtt
from flask import Flask, request, jsonify
import psycopg2
from config import CLOUD_BROKER, CLOUD_PORT, MQTT_SERVICE_USER, MQTT_SERVICE_PASSWORD
from config import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
from handlers.measurement_handler import handle_measurement
from handlers.system_handler import handle_system

# In-memory tracking for home online/offline transitions
home_last_seen: dict = {}   # {home_id: datetime} — updated on every message
offline_homes:  set  = set() # homes currently marked offline in DB
HOME_OFFLINE_AFTER = timedelta(minutes=10)

def load_valid_homes():
    try:
        conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)
        cur = conn.cursor()
        cur.execute("SELECT id FROM homes")
        homes = {row[0] for row in cur.fetchall()}
        cur.close()
        conn.close()
        return homes
    except Exception as e:
        print(f"[WARN] Could not load homes from DB: {e}")
        return set()

valid_homes = load_valid_homes()

def _db_connect():
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)

def _init_home_last_seen():
    """Seed in-memory dicts from DB on startup."""
    try:
        conn = _db_connect()
        cur = conn.cursor()
        cur.execute("""
            SELECT h.id, MAX(e.last_seen)
            FROM homes h
            LEFT JOIN entities e ON e.home_id = h.id
            WHERE h.status = 'online'
            GROUP BY h.id
        """)
        for home_id, last in cur.fetchall():
            if last:
                home_last_seen[home_id] = last.replace(tzinfo=timezone.utc)
        cur.execute("SELECT id FROM homes WHERE status = 'offline'")
        for (home_id,) in cur.fetchall():
            offline_homes.add(home_id)
        cur.close()
        conn.close()
        print(f"[WATCHDOG] Seeded {len(home_last_seen)} online, {len(offline_homes)} offline homes")
    except Exception as e:
        print(f"[WATCHDOG] Could not seed home_last_seen: {e}")

def _mark_home_online(home_id):
    try:
        conn = _db_connect()
        cur = conn.cursor()
        cur.execute("UPDATE homes SET status = 'online' WHERE id = %s", (home_id,))
        conn.commit()
        cur.close()
        conn.close()
        print(f"[WATCHDOG] {home_id} → online (data received)")
    except Exception as e:
        print(f"[WATCHDOG] Could not mark {home_id} online: {e}")

def _watchdog_loop():
    while True:
        time.sleep(300)  # check every 5 minutes
        now = datetime.now(timezone.utc)
        try:
            conn = _db_connect()
            cur = conn.cursor()
            for home_id, last in list(home_last_seen.items()):
                if now - last > HOME_OFFLINE_AFTER:
                    cur.execute(
                        "UPDATE homes SET status = 'offline' WHERE id = %s AND status != 'offline'",
                        (home_id,)
                    )
                    if cur.rowcount > 0:
                        offline_homes.add(home_id)
                        cur.execute(
                            "UPDATE entities SET available = false WHERE home_id = %s",
                            (home_id,)
                        )
                        print(f"[WATCHDOG] {home_id} → offline (last seen {last.strftime('%H:%M:%S')} UTC, {cur.rowcount} entities marked unavailable)")
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"[WATCHDOG] Error: {e}")

def _reload_homes_loop():
    global valid_homes
    while True:
        time.sleep(60)
        refreshed = load_valid_homes()
        if refreshed:
            valid_homes = refreshed
            print(f"[INFO] valid_homes refreshed: {len(valid_homes)} homes")

_init_home_last_seen()
threading.Thread(target=_reload_homes_loop, daemon=True).start()
threading.Thread(target=_watchdog_loop, daemon=True).start()

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

    if home_id not in valid_homes:
        print(f"[WARN] Unknown home_id '{home_id}' — ignoring")
        return

    home_last_seen[home_id] = datetime.now(timezone.utc)
    if home_id in offline_homes:
        offline_homes.discard(home_id)
        _mark_home_online(home_id)

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
client.username_pw_set(MQTT_SERVICE_USER, MQTT_SERVICE_PASSWORD)
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
