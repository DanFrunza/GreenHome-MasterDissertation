from database import get_connection

def handle_measurement(home_id, entity_id, payload):
    is_unavailable = payload.strip() == "unavailable"

    try:
        numeric = float(payload) if not is_unavailable else None
    except ValueError:
        numeric = None

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM homes WHERE id = %s", (home_id,))
    if cur.fetchone() is None:
        print(f"[WARN] Unknown home_id: {home_id}, skipping")
        cur.close()
        conn.close()
        return

    cur.execute("""
        UPDATE entities
        SET state = %s, available = %s, last_seen = NOW()
        WHERE home_id = %s AND entity_id = %s
    """, (payload, not is_unavailable, home_id, entity_id))

    if not is_unavailable:
        cur.execute("""
            INSERT INTO measurements (home_id, entity_id, value, value_numeric)
            VALUES (%s, %s, %s, %s)
        """, (home_id, entity_id, payload, numeric))

    conn.commit()
    cur.close()
    conn.close()
