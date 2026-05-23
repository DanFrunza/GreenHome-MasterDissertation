import time
from database import get_connection
from jobs.aggregation import run_aggregation

INTERVAL_SECONDS = 3600

def run():
    print("Analytics Service started")
    while True:
        try:
            conn = get_connection()
            run_aggregation(conn)
            conn.close()
        except Exception as e:
            print(f"[ERROR] {e}")
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    time.sleep(10)
    run()
