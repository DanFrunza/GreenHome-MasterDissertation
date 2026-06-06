from datetime import datetime, timedelta, timezone

BASELINE_DAYS     = 30
WARNING_THRESHOLD = 2.5
CRITICAL_THRESHOLD = 3.5
MIN_READINGS      = 50
CV_MAX            = 0.8   # skip sensors where σ/μ > 0.8 (bimodal/cyclical appliances)
COOLDOWN_HOURS    = 2     # min hours between anomaly records for the same entity


def run_anomaly_detection(conn):
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    window_from   = now - timedelta(hours=1)
    baseline_from = now - timedelta(days=BASELINE_DAYS)
    cooldown_from = now - timedelta(hours=COOLDOWN_HOURS)

    # Entities that produced readings in the last hour, excluding switches and kWh cumulative
    cur.execute("""
        SELECT DISTINCT m.home_id, m.entity_id
        FROM measurements m
        JOIN entities e ON e.home_id = m.home_id AND e.entity_id = m.entity_id
        WHERE m.recorded_at >= %s
          AND m.value_numeric IS NOT NULL
          AND e.domain NOT IN ('switch', 'binary_sensor')
          AND COALESCE(e.unit, '') != 'kWh'
    """, (window_from,))
    active_entities = cur.fetchall()

    inserted         = 0
    skipped_cv       = 0
    skipped_cooldown = 0

    for home_id, entity_id in active_entities:
        # Baseline: 30 days of data before the current window
        cur.execute("""
            SELECT AVG(value_numeric), STDDEV_POP(value_numeric), COUNT(*)
            FROM measurements
            WHERE home_id = %s AND entity_id = %s
              AND value_numeric IS NOT NULL
              AND recorded_at >= %s AND recorded_at < %s
        """, (home_id, entity_id, baseline_from, window_from))
        row = cur.fetchone()
        if not row or row[2] is None or int(row[2]) < MIN_READINGS:
            continue
        mean_val, std_val, _ = row
        if mean_val is None or std_val is None or float(std_val) < 1e-10:
            continue

        mean = float(mean_val)
        std  = float(std_val)

        # Skip bimodal/cyclical sensors: high coefficient of variation means
        # the distribution has no single "normal" value to deviate from
        if mean > 1e-10 and std / mean > CV_MAX:
            skipped_cv += 1
            continue

        # Cooldown: if an anomaly was already recorded for this entity recently, skip
        cur.execute("""
            SELECT 1 FROM anomalies
            WHERE home_id = %s AND entity_id = %s
              AND detected_at >= %s
            LIMIT 1
        """, (home_id, entity_id, cooldown_from))
        if cur.fetchone():
            skipped_cooldown += 1
            continue

        # New readings in the last hour
        cur.execute("""
            SELECT value_numeric, recorded_at
            FROM measurements
            WHERE home_id = %s AND entity_id = %s
              AND value_numeric IS NOT NULL
              AND recorded_at >= %s
        """, (home_id, entity_id, window_from))
        readings = cur.fetchall()

        for value_raw, recorded_at in readings:
            value = float(value_raw)
            z = abs((value - mean) / std)
            if z < WARNING_THRESHOLD:
                continue
            severity = 'critical' if z >= CRITICAL_THRESHOLD else 'warning'
            cur.execute("""
                INSERT INTO anomalies
                    (home_id, entity_id, detected_at, value, mean, std_dev, z_score, severity)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (home_id, entity_id, detected_at) DO NOTHING
            """, (home_id, entity_id, recorded_at, value, mean, std, z, severity))
            inserted += cur.rowcount

    conn.commit()
    cur.close()
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] Anomaly detection done — "
        f"{inserted} new, {skipped_cv} skipped (high CV), {skipped_cooldown} skipped (cooldown)"
    )
