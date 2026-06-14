import time
from datetime import datetime, timezone
from database import get_connection
from jobs.aggregation import run_aggregation
from jobs.anomaly import run_anomaly_detection
from jobs.prediction import run_prediction

INTERVAL_SECONDS = 3600

JOBS = [
    ('aggregation', run_aggregation),
    ('anomaly',     run_anomaly_detection),
    ('prediction',  run_prediction),
]

def ensure_job_runs_table():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS job_runs (
                id           SERIAL PRIMARY KEY,
                job_name     VARCHAR(50)  NOT NULL,
                started_at   TIMESTAMP    NOT NULL,
                finished_at  TIMESTAMP,
                status       VARCHAR(20),
                error_msg    TEXT
            )
        """)
        cur.execute("""
            UPDATE job_runs
            SET status = 'error', error_msg = 'interrupted: service restarted',
                finished_at = NOW()
            WHERE status = 'running'
        """)
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[WARN] Could not create job_runs table: {e}")

def run_job(name, fn):
    conn = None
    run_id = None
    started = datetime.now(timezone.utc)
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO job_runs (job_name, started_at, status) VALUES (%s, %s, 'running') RETURNING id",
            (name, started)
        )
        run_id = cur.fetchone()[0]
        conn.commit()
        cur.close()

        fn(conn)

        cur = conn.cursor()
        cur.execute(
            "UPDATE job_runs SET finished_at = %s, status = 'success' WHERE id = %s",
            (datetime.now(timezone.utc), run_id)
        )
        conn.commit()
        cur.close()
        print(f"[OK] {name} completed")
    except Exception as e:
        print(f"[ERROR] {name}: {e}")
        if conn and run_id:
            try:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE job_runs SET finished_at = %s, status = 'error', error_msg = %s WHERE id = %s",
                    (datetime.now(timezone.utc), str(e), run_id)
                )
                conn.commit()
                cur.close()
            except Exception:
                pass
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def run():
    print("Analytics Service started")
    ensure_job_runs_table()
    while True:
        for name, fn in JOBS:
            run_job(name, fn)
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    time.sleep(10)
    run()
