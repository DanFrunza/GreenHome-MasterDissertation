"""
Populates historical data for sensor.kitchen_fridge_fridge_energy_total
by copying the real data (2026-05-23 to 2026-06-22) twice into the past.

Copy 1: shifted back by exactly one real period (~30 days)
Copy 2: shifted back by exactly two real periods (~60 days)

Cumulative kWh values are adjusted so the series remains monotonically increasing.
This preserves all real patterns (weekday effects, spikes, hour-of-day profile).
"""

import psycopg2
from datetime import timezone

DB_CONFIG = dict(host='localhost', port=55432, user='user', password='password',
                 dbname='greennest_prod')
HOME_ID   = 'home1'
ENTITY_ID = 'sensor.kitchen_fridge_fridge_energy_total'

conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()

# ── Step 1: delete old synthetic data (before real data start 2026-05-23) ─────
cur.execute("""
    DELETE FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
      AND period_start < '2026-05-23'
""", (HOME_ID, ENTITY_ID))
print(f"Deleted {cur.rowcount} old synthetic rows.")

# ── Step 2: load all real data ─────────────────────────────────────────────────
cur.execute("""
    SELECT period_start, avg_value, min_value, max_value, count
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
    ORDER BY period_start ASC
""", (HOME_ID, ENTITY_ID))
real_rows = cur.fetchall()
print(f"Loaded {len(real_rows)} real rows.")

if len(real_rows) < 2:
    print("Not enough real data. Aborting.")
    conn.close()
    exit(1)

# ── Step 3: compute shift and cumulative adjustment ────────────────────────────
first_ts  = real_rows[0][0]
last_ts   = real_rows[-1][0]
period    = last_ts - first_ts          # duration of real data (~30 days)

first_val = real_rows[0][1]             # cumulative kWh at start of real data
last_val  = real_rows[-1][1]            # cumulative kWh at end of real data
span      = last_val - first_val        # total consumption over real period

print(f"Real data: {first_ts} → {last_ts}  ({period.days} days)")
print(f"Cumulative span: {first_val:.3f} → {last_val:.3f} kWh  (delta={span:.3f} kWh)")

# ── Step 4: insert 2 copies shifted back ──────────────────────────────────────
inserted = 0
for copy_n in [2, 1]:                  # copy 2 first (furthest back), then copy 1
    shift     = period * copy_n
    val_shift = span   * copy_n        # subtract this from cumulative values

    rows = []
    for ts, avg, mn, mx, cnt in real_rows:
        new_ts  = ts  - shift
        new_avg = avg - val_shift
        new_mn  = (mn  - val_shift) if mn  is not None else None
        new_mx  = (mx  - val_shift) if mx  is not None else None
        rows.append((HOME_ID, ENTITY_ID, 'hour', new_ts,
                     float(new_avg),
                     float(new_mn) if new_mn is not None else None,
                     float(new_mx) if new_mx is not None else None,
                     cnt))

    cur.executemany("""
        INSERT INTO aggregations
            (home_id, entity_id, period, period_start, avg_value, min_value, max_value, count)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (home_id, entity_id, period, period_start) DO NOTHING
    """, rows)
    n = cur.rowcount
    inserted += n
    print(f"Copy {copy_n} (shift -{shift.days}d, val -{val_shift:.3f} kWh): {n} rows inserted.")

conn.commit()

# ── Step 5: verify ─────────────────────────────────────────────────────────────
cur.execute("""
    SELECT COUNT(*), MIN(period_start), MAX(period_start)
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
""", (HOME_ID, ENTITY_ID))
total, mn, mx = cur.fetchone()
print(f"\nTotal rows now: {total}  ({mn} → {mx})")

cur.close()
conn.close()
