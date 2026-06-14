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

        # NULL out min/max for periods that contain a meter reset — delta (max-min) would be
        # corrupted since the meter restarts from 0 mid-period
        cur.execute("""
            UPDATE aggregations a
            SET min_value = NULL, max_value = NULL
            WHERE a.period = %s
              AND a.period_start >= %s
              AND EXISTS (
                  SELECT 1 FROM meter_resets mr
                  WHERE mr.home_id  = a.home_id
                    AND mr.entity_id = a.entity_id
                    AND mr.reset_at >= a.period_start
                    AND mr.reset_at < a.period_start + (
                        CASE a.period
                          WHEN 'hour'  THEN INTERVAL '1 hour'
                          WHEN 'day'   THEN INTERVAL '1 day'
                          WHEN 'week'  THEN INTERVAL '1 week'
                          WHEN 'month' THEN INTERVAL '1 month'
                        END
                    )
              )
        """, (p["name"], since))

    conn.commit()
    cur.close()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Aggregation done")
