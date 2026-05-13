import json
from database import get_connection

def handle_registration(home_id, device_id, payload):
    try:
        data = json.loads(payload)
        attributes = data.get("attributes", {})
    except (json.JSONDecodeError, KeyError):
        print(f"[WARN] Invalid registration payload for {device_id}")
        return

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM homes WHERE id = %s", (home_id,))
    if cur.fetchone() is None:
        print(f"[WARN] Unknown home_id: {home_id}, skipping")
        cur.close()
        conn.close()
        return

    for attr_name, meta in attributes.items():
        cur.execute("""
            INSERT INTO device_attributes (home_id, device_id, attribute, unit, ha_entity_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (home_id, device_id, attribute) DO UPDATE
            SET unit = EXCLUDED.unit,
                ha_entity_id = EXCLUDED.ha_entity_id
        """, (home_id, device_id, attr_name, meta.get("unit"), meta.get("ha_entity_id")))

    conn.commit()
    cur.close()
    conn.close()
    print(f"[REGISTER] {home_id}/{device_id} → {len(attributes)} attributes")