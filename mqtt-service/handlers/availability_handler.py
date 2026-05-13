from database import get_connection

def handle_availability(home_id, device_id, source, payload):
    is_online = payload == "online"

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM homes WHERE id = %s", (home_id,))
    if cur.fetchone() is None:
        print(f"[WARN] Unknown home_id: {home_id}, skipping")
        cur.close()
        conn.close()
        return

    if is_online:
        cur.execute("""
            UPDATE homes SET status = 'online', last_seen = NOW()
            WHERE id = %s
        """, (home_id,))

    cur.execute("""
        INSERT INTO devices (home_id, device_id, source, available, last_seen)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (home_id, device_id) DO UPDATE
        SET available = %s, last_seen = NOW()
    """, (home_id, device_id, source, is_online, is_online))

    print(f"[AVAILABILITY] {home_id}/{device_id} → {payload}")

    conn.commit()
    cur.close()
    conn.close()