from datetime import datetime, timedelta, timezone

PERIODS = [
    {"name": "hour",  "trunc": "hour",  "lookback_hours": 48},
    {"name": "day",   "trunc": "day",   "lookback_hours": 24 * 35},
    {"name": "week",  "trunc": "week",  "lookback_hours": 24 * 7 * 14},
    {"name": "month", "trunc": "month", "lookback_hours": 24 * 30 * 14},
]

def run_aggregation(conn):
    cur = conn.cursor()
    now = datetime.now(timezone.utc)

    for p in PERIODS:
        since = now - timedelta(hours=p["lookback_hours"])

        cur.execute("""
            INSERT INTO aggregations (home_id, entity_id, period, period_start, avg_value, min_value, max_value, count, computed_at)
            SELECT
                home_id,
                entity_id,
                %s AS period,
                DATE_TRUNC(%s, recorded_at) AS period_start,
                AVG(value_numeric)           AS avg_value,
                MIN(value_numeric)           AS min_value,
                MAX(value_numeric)           AS max_value,
                COUNT(*)                     AS count,
                NOW()                        AS computed_at
            FROM measurements
            WHERE value_numeric IS NOT NULL
              AND recorded_at >= %s
            GROUP BY home_id, entity_id, DATE_TRUNC(%s, recorded_at)
            ON CONFLICT (home_id, entity_id, period, period_start)
            DO UPDATE SET
                avg_value   = EXCLUDED.avg_value,
                min_value   = EXCLUDED.min_value,
                max_value   = EXCLUDED.max_value,
                count       = EXCLUDED.count,
                computed_at = EXCLUDED.computed_at
        """, (p["name"], p["trunc"], since, p["trunc"]))

    conn.commit()
    cur.close()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Aggregation done")
