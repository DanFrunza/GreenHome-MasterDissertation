from database import get_connection

def handle_measurement(home_id, device_id, source, attribute, payload):
    try:
        numeric = float(payload)
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
        UPDATE homes SET status = 'online', last_seen = NOW()
        WHERE id = %s
    """, (home_id,))

    cur.execute("""
        INSERT INTO devices (home_id, device_id, source, available, last_seen)
        VALUES (%s, %s, %s, true, NOW())
        ON CONFLICT (home_id, device_id) DO UPDATE
        SET available = true, last_seen = NOW()
    """, (home_id, device_id, source))

    cur.execute("""
        INSERT INTO measurements (home_id, device_id, attribute, value, value_numeric)
        VALUES (%s, %s, %s, %s, %s)
    """, (home_id, device_id, attribute, payload, numeric))

    conn.commit()
    cur.close()
    conn.close()