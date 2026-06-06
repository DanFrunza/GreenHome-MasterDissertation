import json
from database import get_connection
from handlers.automation_handler import handle_automation_discovery

def handle_system(client, home_id, command, payload):
    if command == "status":
        _handle_status(client, home_id, payload)
    elif command == "entity_discovery":
        _handle_entity_discovery(home_id, payload)
    elif command == "automation_discovery":
        handle_automation_discovery(home_id, payload)

def _handle_status(client, home_id, payload):
    is_online = payload.strip() == "online"

    conn = get_connection()
    cur = conn.cursor()

    if is_online:
        cur.execute("""
            UPDATE homes SET status = 'online', last_seen = NOW()
            WHERE id = %s
        """, (home_id,))
        client.publish(f"{home_id}/backend/system/entity_discovery", "{}", qos=1)
        client.publish(f"{home_id}/backend/system/automation_discovery", "{}", qos=1)
        print(f"[STATUS] {home_id} → online, discovery requested")
    else:
        cur.execute("""
            UPDATE homes SET status = 'offline'
            WHERE id = %s
        """, (home_id,))
        print(f"[STATUS] {home_id} → offline")

    conn.commit()
    cur.close()
    conn.close()

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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, true, NOW())
            ON CONFLICT (home_id, entity_id) DO UPDATE SET
                device_id     = EXCLUDED.device_id,
                domain        = EXCLUDED.domain,
                friendly_name = EXCLUDED.friendly_name,
                unit          = EXCLUDED.unit,
                device_class  = EXCLUDED.device_class,
                state         = EXCLUDED.state,
                available     = true,
                last_seen     = NOW()
        """, (
            entity["entity_id"],
            home_id,
            entity.get("device_id"),
            entity.get("domain"),
            entity.get("friendly_name"),
            entity.get("unit_of_measurement"),
            entity.get("device_class"),
            entity.get("state"),
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"[DISCOVERY] {home_id} → {len(entities)} entities saved")
