import time
import json
from database import get_connection
from handlers.automation_handler import handle_automation_discovery

def handle_system(client, home_id, command, payload):
    if command == "agent_status":
        _handle_agent_status(client, home_id, payload)
    elif command == "entity_discovery":
        _handle_entity_discovery(home_id, payload)
    elif command == "automation_discovery":
        handle_automation_discovery(home_id, payload)

def _handle_agent_status(client, home_id, payload):
    is_online = payload.strip() == "online"
    status = 'online' if is_online else 'offline'

    for attempt in range(3):
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()
            cur.execute(
                "UPDATE homes SET agent_status = %s WHERE id = %s",
                (status, home_id)
            )
            conn.commit()
            cur.close()
            conn.close()
            print(f"[AGENT_STATUS] {home_id} → {status}")
            break
        except Exception as e:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            if attempt < 2:
                time.sleep(0.1 * (2 ** attempt))  # 0.1s → 0.2s
            else:
                print(f"[ERROR] Could not update agent_status for {home_id} after 3 attempts: {e}")
                return

    if is_online:
        client.publish(f"{home_id}/backend/system/entity_discovery", "{}", qos=1)
        client.publish(f"{home_id}/backend/system/automation_discovery", "{}", qos=1)

def _handle_entity_discovery(home_id, payload):
    try:
        data = json.loads(payload)
        entities = data.get("entities", [])
    except json.JSONDecodeError:
        print(f"[WARN] Invalid entity_discovery payload for {home_id}")
        return

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM homes WHERE id = %s", (home_id,))
    if cur.fetchone() is None:
        print(f"[WARN] Unknown home_id: {home_id}, skipping")
        cur.close()
        conn.close()
        return

    for entity in entities:
        cur.execute("""
            INSERT INTO entities
                (entity_id, home_id, device_id, domain, friendly_name, unit, device_class, state, available, last_seen)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (home_id, entity_id) DO UPDATE SET
                device_id     = EXCLUDED.device_id,
                domain        = EXCLUDED.domain,
                friendly_name = EXCLUDED.friendly_name,
                unit          = EXCLUDED.unit,
                device_class  = EXCLUDED.device_class,
                state         = EXCLUDED.state,
                available     = EXCLUDED.available,
                last_seen     = NOW()
                -- anomaly_muted și anomaly_suppressed sunt setate de utilizator,
                -- nu se resetează la discovery
        """, (
            entity["entity_id"],
            home_id,
            entity.get("device_id"),
            entity.get("domain"),
            entity.get("friendly_name"),
            entity.get("unit_of_measurement"),
            entity.get("device_class"),
            entity.get("state"),
            entity.get("available", True),
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"[DISCOVERY] {home_id} → {len(entities)} entities saved")
