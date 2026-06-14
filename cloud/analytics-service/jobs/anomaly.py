from datetime import datetime, timedelta, timezone

BASELINE_DAYS      = 30
WARNING_THRESHOLD  = 2.5
CRITICAL_THRESHOLD = 3.5
MIN_READINGS       = 50
CV_MAX             = 0.8    # skip senzori bimodali / ciclici (σ/μ > 0.8)
COOLDOWN_HOURS     = 4      # ore între anomalii pentru aceeași entitate
WINDOW_HOURS       = 1      # fereastra de detecție (cât de în urmă se uită jobul)


def run_anomaly_detection(conn):
    cur = conn.cursor()
    now = datetime.now(timezone.utc)
    window_from   = now - timedelta(hours=WINDOW_HOURS)
    baseline_from = now - timedelta(days=BASELINE_DAYS)

    # Cooldown: +WINDOW_HOURS compensează faptul că detected_at = recorded_at,
    # care e cu până la WINDOW_HOURS în urmă față de momentul rulării jobului.
    # Fără această compensare, cooldown-ul sare efectiv doar un run din două.
    cooldown_from = now - timedelta(hours=COOLDOWN_HOURS + WINDOW_HOURS)

    # Entități active în ultima oră, excluse switch-uri, binary_sensor-uri, kWh și cele muted de utilizator
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
        # Baseline: 30 de zile de date înainte de fereastra curentă
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

        # Skip senzori bimodali/ciclici: distribuție prea largă față de medie.
        # abs(mean) gestionează corect senzori cu medie negativă (ex. temperaturi sub 0°C).
        if abs(mean) > 1e-10 and std / abs(mean) > CV_MAX:
            skipped_cv += 1
            continue

        # Cooldown: dacă a fost deja detectată o anomalie recent, sare entitatea
        cur.execute("""
            SELECT 1 FROM anomalies
            WHERE home_id = %s AND entity_id = %s
              AND detected_at >= %s
            LIMIT 1
        """, (home_id, entity_id, cooldown_from))
        if cur.fetchone():
            skipped_cooldown += 1
            continue

        # Citirile noi din ultima oră
        cur.execute("""
            SELECT value_numeric, recorded_at
            FROM measurements
            WHERE home_id = %s AND entity_id = %s
              AND value_numeric IS NOT NULL
              AND recorded_at >= %s
        """, (home_id, entity_id, window_from))
        readings = cur.fetchall()

        # Inserează DOAR cea mai anormală citire (z maxim) din fereastra curentă.
        # Astfel, un sensor care trimite 120 citiri/oră generează cel mult 1 anomalie
        # per run, nu 120. Cooldown-ul împiedică re-detecția în run-urile următoare.
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
