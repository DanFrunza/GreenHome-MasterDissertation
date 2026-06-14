import time
from database import get_connection

def handle_measurement(home_id, entity_id, payload):
    is_unavailable = payload.strip() == "unavailable"

    try:
        numeric = float(payload) if not is_unavailable else None
    except ValueError:
        numeric = None

    for attempt in range(3):
        conn = None
        try:
            conn = get_connection()
            cur = conn.cursor()

            cur.execute("""
                UPDATE entities
                SET state = %s, available = %s, last_seen = NOW()
                WHERE home_id = %s AND entity_id = %s
            """, (payload, not is_unavailable, home_id, entity_id))

            if numeric is not None:
                # Check for meter reset before inserting the new reading
                cur.execute("""
                    SELECT e.device_class,
                           (SELECT value_numeric FROM measurements
                            WHERE home_id = %s AND entity_id = %s AND value_numeric IS NOT NULL
                            ORDER BY recorded_at DESC LIMIT 1) AS last_value
                    FROM entities e
                    WHERE e.home_id = %s AND e.entity_id = %s
                """, (home_id, entity_id, home_id, entity_id))
                row = cur.fetchone()
                if row and row[0] == 'energy' and row[1] is not None:
                    prev_val = float(row[1])
                    # Any drop > 1 kWh on a cumulative meter = reset
                    if prev_val > 1.0 and numeric < prev_val - 1.0:
                        cur.execute("""
                            INSERT INTO meter_resets (home_id, entity_id, reset_at, value_before, value_after)
                            VALUES (%s, %s, NOW(), %s, %s)
                        """, (home_id, entity_id, prev_val, numeric))

                cur.execute("""
                    INSERT INTO measurements (home_id, entity_id, value, value_numeric)
                    VALUES (%s, %s, %s, %s)
                """, (home_id, entity_id, payload, numeric))

            conn.commit()
            cur.close()
            conn.close()
            return
        except Exception as e:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            if attempt < 2:
                time.sleep(0.1 * (2 ** attempt))  # 0.1s → 0.2s
            else:
                print(f"[ERROR] DB write failed for {entity_id} after 3 attempts: {e}")
