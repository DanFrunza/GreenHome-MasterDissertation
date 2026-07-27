from datetime import datetime, timedelta, timezone

BASELINE_DAYS      = 30
WARNING_THRESHOLD  = 2.5
CRITICAL_THRESHOLD = 3.5
MIN_READINGS       = 50
CV_MAX             = 0.8    # skip bimodal / cyclic sensors (σ/μ > 0.8)
COOLDOWN_HOURS     = 4      # minimum hours between anomalies for the same entity
WINDOW_HOURS       = 1      # detection window — how far back the job looks


def run_anomaly_detection(conn):
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    window_from   = now - timedelta(hours=WINDOW_HOURS)
    baseline_from = now - timedelta(days=BASELINE_DAYS)

    # Cooldown: +WINDOW_HOURS compensates for detected_at = recorded_at,
    # which can be up to WINDOW_HOURS behind the actual job run time.
    # Without this offset, the cooldown would effectively skip only every other run.
    cooldown_from = now - timedelta(hours=COOLDOWN_HOURS + WINDOW_HOURS)

    # Entities active in the last hour, excluding switches, binary sensors, kWh meters, and user-muted entities
    cur.execute("""
        SELECT DISTINCT m.home_id, m.entity_id
        FROM measurements m
        JOIN entities e ON e.home_id = m.home_id AND e.entity_id = m.entity_id
        WHERE m.recorded_at >= %s
          AND m.value_numeric IS NOT NULL
          AND e.domain NOT IN ('switch', 'binary_sensor')
          AND COALESCE(e.unit, '') != 'kWh'
          AND NOT COALESCE(e.anomaly_muted, false)
    """, (window_from,))
    active_entities = cur.fetchall()

    inserted         = 0
    skipped_cv       = 0
    skipped_cooldown = 0

    for home_id, entity_id in active_entities:
        # Baseline: 30 days of data before the current detection window
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

        # Skip bimodal/cyclic sensors: distribution too wide relative to the mean.
        # abs(mean) handles sensors with a negative mean correctly (e.g. sub-zero temperatures).
        if abs(mean) > 1e-10 and std / abs(mean) > CV_MAX:
            skipped_cv += 1
            continue

        # Cooldown: skip entity if an anomaly was already detected recently
        cur.execute("""
            SELECT 1 FROM anomalies
            WHERE home_id = %s AND entity_id = %s
              AND detected_at >= %s
            LIMIT 1
        """, (home_id, entity_id, cooldown_from))
        if cur.fetchone():
            skipped_cooldown += 1
            continue

        # New readings from the current detection window
        cur.execute("""
            SELECT value_numeric, recorded_at
            FROM measurements
            WHERE home_id = %s AND entity_id = %s
              AND value_numeric IS NOT NULL
              AND recorded_at >= %s
        """, (home_id, entity_id, window_from))
        readings = cur.fetchall()

        # Insert ONLY the most anomalous reading (highest z-score) from the current window.
        # A sensor sending 120 readings/hour produces at most 1 anomaly per run, not 120.
        # The cooldown prevents re-detection in subsequent runs.
        worst = None
        for value_raw, recorded_at in readings:
            value = float(value_raw)
            z = abs((value - mean) / std)
            if z < WARNING_THRESHOLD:
                continue
            if worst is None or z > worst[0]:
                worst = (z, value, recorded_at)

        if worst is None:
            continue

        z, value, recorded_at = worst
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
        f"{inserted} new, {skipped_cv} skipped (high CV), "
        f"{skipped_cooldown} skipped (cooldown)"
    )
