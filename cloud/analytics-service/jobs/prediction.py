import numpy as np
from datetime import datetime, timedelta, timezone
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

# Data volume thresholds (hourly aggregation points)
SEASONAL_NAIVE_MAX = 336   # < 2 weeks  -> Seasonal Naive
RIDGE_MAX          = 1344  # < 8 weeks  -> Ridge Regression with Fourier features
                           # >= 8 weeks -> Random Forest

PREDICTION_HOURS = 168  # 7 days


# ── Feature helpers ───────────────────────────────────────────────────────────

def _calendar_features(dt):
    """9 Fourier + calendar features from a datetime. All calendar-based so
    they are always available for future timestamps without any lag chain."""
    h   = dt.hour
    dow = dt.weekday()
    m   = dt.month
    return [
        np.sin(2 * np.pi * h   / 24),
        np.cos(2 * np.pi * h   / 24),
        np.sin(4 * np.pi * h   / 24),   # 2nd harmonic captures asymmetric daily shape
        np.cos(4 * np.pi * h   / 24),
        np.sin(2 * np.pi * dow / 7),
        np.cos(2 * np.pi * dow / 7),
        np.sin(2 * np.pi * m   / 12),
        np.cos(2 * np.pi * m   / 12),
        1 if dow >= 5 else 0,            # is_weekend
    ]


def _build_value_lookup(times, values):
    """Dict keyed by hour-rounded datetime for O(1) lag lookups."""
    lookup = {}
    for t, v in zip(times, values):
        key = t.replace(minute=0, second=0, microsecond=0)
        if v is not None:
            lookup[key] = v
    return lookup


def _lag_and_rolling(t, lookup):
    """Returns (lag_168h, rolling_7day_mean) using only historical data."""
    lag_key = (t - timedelta(hours=168)).replace(minute=0, second=0, microsecond=0)
    lag_168 = lookup.get(lag_key)

    rolling_vals = [lookup.get((t - timedelta(hours=k)).replace(minute=0, second=0, microsecond=0))
                    for k in range(1, 169)]
    rolling_vals = [v for v in rolling_vals if v is not None]
    rolling_mean = float(np.mean(rolling_vals)) if rolling_vals else None

    return lag_168, rolling_mean


def _build_training_matrix(times, values, lookup):
    X, y = [], []
    for t, v in zip(times, values):
        if v is None:
            continue
        lag_168, rolling_mean = _lag_and_rolling(t, lookup)
        if lag_168 is None or rolling_mean is None:
            continue  # skip points without full lag context
        X.append(_calendar_features(t) + [lag_168, rolling_mean])
        y.append(v)
    return np.array(X, dtype=float), np.array(y, dtype=float)


def _build_prediction_matrix(times_future, lookup, fallback_mean):
    X = []
    for t in times_future:
        lag_168, rolling_mean = _lag_and_rolling(t, lookup)
        lag_168      = lag_168      if lag_168      is not None else fallback_mean
        rolling_mean = rolling_mean if rolling_mean is not None else fallback_mean
        X.append(_calendar_features(t) + [lag_168, rolling_mean])
    return np.array(X, dtype=float)


# ── Model implementations ─────────────────────────────────────────────────────

def _seasonal_naive(times_hist, values_hist, times_future):
    """Predict each future (hour, dow) as historical mean of that combination."""
    lookup_group = {}
    for t, v in zip(times_hist, values_hist):
        if v is None:
            continue
        key = (t.hour, t.weekday())
        lookup_group.setdefault(key, []).append(v)

    hour_fallback = {}
    for (h, _), vals in lookup_group.items():
        hour_fallback.setdefault(h, []).extend(vals)

    all_vals = [v for v in values_hist if v is not None]
    global_mean = float(np.mean(all_vals)) if all_vals else 0.0

    preds = []
    for t in times_future:
        key = (t.hour, t.weekday())
        if key in lookup_group:
            preds.append(float(np.mean(lookup_group[key])))
        elif t.hour in hour_fallback:
            preds.append(float(np.mean(hour_fallback[t.hour])))
        else:
            preds.append(global_mean)
    return preds, 'seasonal_naive'


def _ridge(times_hist, values_hist, times_future, lookup, fallback_mean):
    X_train, y_train = _build_training_matrix(times_hist, values_hist, lookup)
    if len(X_train) < 20:
        return None, None

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)

    model = Ridge(alpha=1.0)
    model.fit(X_train_s, y_train)

    X_pred = scaler.transform(_build_prediction_matrix(times_future, lookup, fallback_mean))
    return model.predict(X_pred).tolist(), 'ridge_regression'


def _random_forest(times_hist, values_hist, times_future, lookup, fallback_mean):
    X_train, y_train = _build_training_matrix(times_hist, values_hist, lookup)
    if len(X_train) < 50:
        return None, None

    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1,
                                   min_samples_leaf=3)
    model.fit(X_train, y_train)

    X_pred = _build_prediction_matrix(times_future, lookup, fallback_mean)
    return model.predict(X_pred).tolist(), 'random_forest'


# ── Main job ──────────────────────────────────────────────────────────────────

def run_prediction(conn):
    cur = conn.cursor()
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    # Entities active in the last 7 days, excluding switches and binary sensors
    cur.execute("""
        SELECT DISTINCT a.home_id, a.entity_id, e.unit, e.device_class
        FROM aggregations a
        JOIN entities e ON e.home_id = a.home_id AND e.entity_id = a.entity_id
        WHERE a.period = 'hour'
          AND a.period_start >= %s
          AND a.avg_value IS NOT NULL
          AND e.domain NOT IN ('switch', 'binary_sensor')
    """, (now - timedelta(days=7),))
    active_entities = cur.fetchall()

    generated = skipped = 0

    for home_id, entity_id, unit, device_class in active_entities:
        # Fetch up to 90 days of hourly aggregations
        cur.execute("""
            SELECT period_start, avg_value
            FROM aggregations
            WHERE home_id = %s AND entity_id = %s AND period = 'hour'
              AND period_start >= %s AND avg_value IS NOT NULL
            ORDER BY period_start ASC
        """, (home_id, entity_id, now - timedelta(days=90)))
        rows = cur.fetchall()
        if not rows:
            skipped += 1
            continue

        # Normalise timestamps to UTC
        times_hist = [
            r[0].replace(tzinfo=timezone.utc) if r[0].tzinfo is None else r[0]
            for r in rows
        ]
        values_raw = [float(r[1]) for r in rows]

        # kWh cumulative → convert to per-hour deltas so we predict consumption rate
        is_kwh = (unit == 'kWh') or (device_class == 'energy')
        if is_kwh and len(values_raw) > 1:
            values_hist = [max(0.0, values_raw[i] - values_raw[i - 1])
                           for i in range(1, len(values_raw))]
            times_hist = times_hist[1:]
        else:
            values_hist = values_raw

        n = len(values_hist)
        if n == 0:
            skipped += 1
            continue

        lookup       = _build_value_lookup(times_hist, values_hist)
        fallback     = float(np.mean([v for v in values_hist if v is not None]))
        times_future = [now + timedelta(hours=k + 1) for k in range(PREDICTION_HOURS)]

        try:
            if n < SEASONAL_NAIVE_MAX:
                preds, mtype = _seasonal_naive(times_hist, values_hist, times_future)
            elif n < RIDGE_MAX:
                preds, mtype = _ridge(times_hist, values_hist, times_future, lookup, fallback)
                if preds is None:
                    preds, mtype = _seasonal_naive(times_hist, values_hist, times_future)
            else:
                preds, mtype = _random_forest(times_hist, values_hist, times_future, lookup, fallback)
                if preds is None:
                    preds, mtype = _seasonal_naive(times_hist, values_hist, times_future)
        except Exception as e:
            print(f"[PREDICTION] Error {entity_id}: {e}")
            skipped += 1
            continue

        # Clamp negatives (physically impossible for power/consumption/CO2/etc.)
        preds = [max(0.0, p) for p in preds]

        # Upsert — always overwrite with latest run
        for target_time, pred_value in zip(times_future, preds):
            cur.execute("""
                INSERT INTO predictions
                    (home_id, entity_id, predicted_at, target_time, predicted_value, model_type)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (home_id, entity_id, target_time) DO UPDATE SET
                    predicted_value = EXCLUDED.predicted_value,
                    model_type      = EXCLUDED.model_type,
                    predicted_at    = EXCLUDED.predicted_at
            """, (home_id, entity_id, now, target_time, pred_value, mtype))

        generated += 1

    conn.commit()
    cur.close()
    print(
        f"[{datetime.now().strftime('%H:%M:%S')}] Prediction done — "
        f"{generated} entities updated, {skipped} skipped"
    )
