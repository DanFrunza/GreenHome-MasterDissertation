"""
Populates historical data for sensor.kitchen_fridge_fridge_power (W).

Unlike the energy sensor, power is NOT cumulative — avg_value is copied
directly with no offset adjustment. Two copies are inserted shifted back
by one and two real-data periods so the large-volume backtest (cutoff Jun 18,
lookback 90 days) has sufficient training rows.
"""

import psycopg2

DB_CONFIG = dict(host='localhost', port=55432, user='user', password='password',
                 dbname='greennest_prod')
HOME_ID   = 'home1'
ENTITY_ID = 'sensor.kitchen_fridge_fridge_power'

conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()

# ── Step 1: load real data ─────────────────────────────────────────────────────
cur.execute("""
    SELECT period_start, avg_value, min_value, max_value, count
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
    ORDER BY period_start ASC
""", (HOME_ID, ENTITY_ID))
real_rows = cur.fetchall()
print(f"Loaded {len(real_rows)} real rows.")

first_ts = real_rows[0][0]
last_ts  = real_rows[-1][0]
period   = last_ts - first_ts
print(f"Real data: {first_ts} → {last_ts}  ({period.days}d {period.seconds//3600}h)")

# ── Step 2: delete existing synthetic rows ─────────────────────────────────────
cur.execute("""
    DELETE FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
      AND period_start < %s
""", (HOME_ID, ENTITY_ID, first_ts))
print(f"Deleted {cur.rowcount} old synthetic rows.")

# ── Step 3: insert 2 copies shifted back ──────────────────────────────────────
inserted = 0
for copy_n in [2, 1]:
    shift = period * copy_n
    rows = [
        (HOME_ID, ENTITY_ID, 'hour',
         ts - shift,
         float(avg) if avg is not None else None,
         float(mn)  if mn  is not None else None,
         float(mx)  if mx  is not None else None,
         cnt)
        for ts, avg, mn, mx, cnt in real_rows
    ]
    cur.executemany("""
        INSERT INTO aggregations
            (home_id, entity_id, period, period_start, avg_value, min_value, max_value, count)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (home_id, entity_id, period, period_start) DO NOTHING
    """, rows)
    n = cur.rowcount
    inserted += n
    print(f"Copy {copy_n} (shift -{shift.days}d): {n} rows inserted.")

conn.commit()

# ── Step 4: verify ─────────────────────────────────────────────────────────────
cur.execute("""
    SELECT COUNT(*), MIN(period_start), MAX(period_start)
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
""", (HOME_ID, ENTITY_ID))
total, mn, mx = cur.fetchone()
print(f"\nTotal rows: {total}  ({mn} → {mx})")

cur.close()
conn.close()
