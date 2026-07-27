"""
Populates historical data for sensor.kitchen_fridge_fridge_energy_total
using shuffled thirds of real data to avoid identical monthly repetition.

Strategy:
  1. Compute hourly deltas from consecutive real avg_values.
  2. Split deltas into 3 thirds: D1, D2, D3.
  3. Arrange 6 historical blocks chronologically as: [D3][D1][D2][D1][D3][D2]
  4. Reconstruct cumulative avg_values by going backwards from the first real
     avg_value and subtracting deltas one by one.

Result: monotonically increasing cumulative series with real spike patterns
but shuffled so each historical month looks different.
"""

import psycopg2
from datetime import timedelta

DB_CONFIG = dict(host='localhost', port=55432, user='user', password='password',
                 dbname='greennest_prod')
HOME_ID   = 'home1'
ENTITY_ID = 'sensor.kitchen_fridge_fridge_energy_total'

conn = psycopg2.connect(**DB_CONFIG)
cur  = conn.cursor()

# ── Step 1: load real data ─────────────────────────────────────────────────────
cur.execute("""
    SELECT period_start, avg_value
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
    ORDER BY period_start ASC
""", (HOME_ID, ENTITY_ID))
real_rows = cur.fetchall()
print(f"Loaded {len(real_rows)} real rows.")
print(f"Real data: {real_rows[0][0]} → {real_rows[-1][0]}")

if len(real_rows) < 6:
    print("Not enough real data. Aborting.")
    conn.close()
    exit(1)

real_ts  = [r[0] for r in real_rows]
real_avg = [float(r[1]) for r in real_rows]

# ── Step 2: compute hourly deltas ──────────────────────────────────────────────
deltas = [max(0.0, real_avg[i] - real_avg[i - 1]) for i in range(1, len(real_avg))]
print(f"Computed {len(deltas)} deltas  (total span: {sum(deltas):.3f} kWh)")

# ── Step 3: split into 3 equal thirds ─────────────────────────────────────────
n  = len(deltas)
n1 = n // 3
n2 = n // 3
# n3 = remainder (D3 may be 1-2 deltas longer)
D1 = deltas[:n1]
D2 = deltas[n1:n1 + n2]
D3 = deltas[n1 + n2:]
print(f"Thirds — D1: {len(D1)}  D2: {len(D2)}  D3: {len(D3)} deltas")

# ── Step 4: historical arrangement [D3, D1, D2, D1, D3, D2] ──────────────────
hist_deltas = D3 + D1 + D2 + D1 + D3 + D2
print(f"Historical blocks: {len(hist_deltas)} deltas → {len(hist_deltas)} synthetic rows")

# ── Step 5: reconstruct cumulative values going backwards from anchor ──────────
# anchor = first real point; synthetic rows are placed 1-hour before it
anchor_val = real_avg[0]
anchor_ts  = real_ts[0]

hist_rows_rev = []
current_val   = anchor_val
for i, delta in enumerate(reversed(hist_deltas)):
    current_val -= delta
    ts = anchor_ts - timedelta(hours=(i + 1))
    hist_rows_rev.append((ts, current_val))

hist_rows_rev.reverse()  # oldest first
print(f"Synthetic range: {hist_rows_rev[0][0]} → {hist_rows_rev[-1][0]}")
print(f"Cumulative range: {hist_rows_rev[0][1]:.4f} → {hist_rows_rev[-1][1]:.4f} kWh")

# ── Step 6: delete existing synthetic rows ─────────────────────────────────────
cur.execute("""
    DELETE FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
      AND period_start < %s
""", (HOME_ID, ENTITY_ID, anchor_ts))
print(f"\nDeleted {cur.rowcount} old rows before {anchor_ts}.")

# ── Step 7: insert synthetic rows ─────────────────────────────────────────────
rows_to_insert = [
    (HOME_ID, ENTITY_ID, 'hour', ts, float(avg), None, None, 1)
    for ts, avg in hist_rows_rev
]
cur.executemany("""
    INSERT INTO aggregations
        (home_id, entity_id, period, period_start, avg_value, min_value, max_value, count)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (home_id, entity_id, period, period_start) DO NOTHING
""", rows_to_insert)
print(f"Inserted {cur.rowcount} synthetic rows.")

conn.commit()

# ── Step 8: verify ─────────────────────────────────────────────────────────────
cur.execute("""
    SELECT COUNT(*), MIN(period_start), MAX(period_start)
    FROM aggregations
    WHERE home_id = %s AND entity_id = %s AND period = 'hour'
""", (HOME_ID, ENTITY_ID))
total, mn, mx = cur.fetchone()
print(f"\nTotal rows: {total}  ({mn} → {mx})")
print(f"Approx training hours available: {(mx - mn).days * 24 + (mx - mn).seconds // 3600}")

cur.close()
conn.close()
