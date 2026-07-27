"""
Backtesting — MEDIUM VOLUME regime (336-1344 training points → Ridge Regression selected).

Cutoff: 2026-06-18.  Uses last 700 rows before cutoff → ~699 training pts (Ridge regime).
All models use full feature set (11 features: 9 calendar + lag_168h + rolling_7day_mean).

  - Training data : hourly aggregations BEFORE cutoff_date (last 90 days)
  - Test data     : hourly aggregations in [cutoff_date, cutoff_date + test_hours)
  - Runs Seasonal Naive, Ridge, and Random Forest on training data
  - Computes MAE for each model against actual test values
  - Saves comparison plot as PNG
"""

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import psycopg2
from datetime import datetime, timedelta, timezone

# ── Copy of prediction.py logic (unchanged) ───────────────────────────────────

SEASONAL_NAIVE_MAX = 336
RIDGE_MAX          = 1344

def _calendar_features(dt):
    h   = dt.hour
    dow = dt.weekday()
    m   = dt.month
    return [
        np.sin(2 * np.pi * h   / 24),
        np.cos(2 * np.pi * h   / 24),
        np.sin(4 * np.pi * h   / 24),
        np.cos(4 * np.pi * h   / 24),
        np.sin(2 * np.pi * dow / 7),
        np.cos(2 * np.pi * dow / 7),
        np.sin(2 * np.pi * m   / 12),
        np.cos(2 * np.pi * m   / 12),
        1 if dow >= 5 else 0,
    ]

def _build_value_lookup(times, values):
    lookup = {}
    for t, v in zip(times, values):
        key = t.replace(minute=0, second=0, microsecond=0)
        if v is not None:
            lookup[key] = v
    return lookup

def _lag_and_rolling(t, lookup):
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
            continue
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

def _seasonal_naive(times_hist, values_hist, times_future):
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
    return preds

def _ridge(times_hist, values_hist, times_future, lookup, fallback_mean):
    from sklearn.linear_model import Ridge
    from sklearn.preprocessing import StandardScaler
    X_train, y_train = _build_training_matrix(times_hist, values_hist, lookup)
    if len(X_train) < 20:
        return None
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    model = Ridge(alpha=1.0)
    model.fit(X_train_s, y_train)
    X_pred = scaler.transform(_build_prediction_matrix(times_future, lookup, fallback_mean))
    return [max(0.0, p) for p in model.predict(X_pred).tolist()]

def _random_forest(times_hist, values_hist, times_future, lookup, fallback_mean):
    from sklearn.ensemble import RandomForestRegressor
    X_train, y_train = _build_training_matrix(times_hist, values_hist, lookup)
    if len(X_train) < 50:
        return None
    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1,
                                  min_samples_leaf=3)
    model.fit(X_train, y_train)
    X_pred = _build_prediction_matrix(times_future, lookup, fallback_mean)
    return [max(0.0, p) for p in model.predict(X_pred).tolist()]


# ── Backtesting logic ──────────────────────────────────────────────────────────

def load_hourly_aggregations(cur, home_id, entity_id, unit, device_class,
                              start_dt, end_dt, limit=None):
    if limit is not None:
        cur.execute("""
            SELECT period_start, avg_value FROM (
                SELECT period_start, avg_value
                FROM aggregations
                WHERE home_id = %s AND entity_id = %s AND period = 'hour'
                  AND period_start < %s
                  AND avg_value IS NOT NULL
                ORDER BY period_start DESC
                LIMIT %s
            ) sub ORDER BY period_start ASC
        """, (home_id, entity_id, end_dt, limit))
    else:
        cur.execute("""
            SELECT period_start, avg_value
            FROM aggregations
            WHERE home_id = %s AND entity_id = %s AND period = 'hour'
              AND period_start >= %s AND period_start < %s
              AND avg_value IS NOT NULL
            ORDER BY period_start ASC
        """, (home_id, entity_id, start_dt, end_dt))
    rows = cur.fetchall()
    times      = [r[0].replace(tzinfo=timezone.utc) if r[0].tzinfo is None else r[0] for r in rows]
    values_raw = [float(r[1]) for r in rows]
    is_kwh = (unit == 'kWh') or (device_class == 'energy')
    if is_kwh and len(values_raw) > 1:
        values = [max(0.0, values_raw[i] - values_raw[i - 1]) for i in range(1, len(values_raw))]
        times  = times[1:]
    else:
        values = values_raw
    return times, values


def backtest_entity(conn, home_id, entity_id, cutoff_date, test_hours=168,
                    max_train_rows=None):
    cur = conn.cursor()
    cur.execute("SELECT unit, device_class FROM entities WHERE home_id = %s AND entity_id = %s",
                (home_id, entity_id))
    row = cur.fetchone()
    unit         = row[0] if row else None
    device_class = row[1] if row else None

    test_end = cutoff_date + timedelta(hours=test_hours)

    t_train, v_train = load_hourly_aggregations(cur, home_id, entity_id, unit, device_class,
                                                 None, cutoff_date, limit=max_train_rows)
    t_test,  v_test  = load_hourly_aggregations(cur, home_id, entity_id, unit, device_class,
                                                 cutoff_date, test_end)
    cur.close()

    if not t_train or not t_test:
        print(f"  [SKIP] {entity_id}: insufficient data")
        return None

    n = len(v_train)
    if   n < SEASONAL_NAIVE_MAX: model_selected = 'seasonal_naive'
    elif n < RIDGE_MAX:          model_selected = 'ridge_regression'
    else:                        model_selected = 'random_forest'
    print(f"  {entity_id}: {n} training pts → would select {model_selected}")

    lookup   = _build_value_lookup(t_train, v_train)
    fallback = float(np.mean([v for v in v_train if v is not None]))

    naive_preds = _seasonal_naive(t_train, v_train, t_test)
    ridge_preds = _ridge(t_train, v_train, t_test, lookup, fallback)
    rf_preds    = _random_forest(t_train, v_train, t_test, lookup, fallback)

    if ridge_preds is None:
        print(f"  [WARN] Ridge failed for {entity_id}")
        ridge_preds = [None] * len(t_test)
    if rf_preds is None:
        print(f"  [WARN] RF failed for {entity_id}")
        rf_preds = [None] * len(t_test)

    def mae(preds):
        pairs = [(a, p) for a, p in zip(v_test, preds) if p is not None]
        return float(np.mean([abs(a - p) for a, p in pairs])) if pairs else float('nan')

    return {
        'entity_id':      entity_id,
        'times':          t_test,
        'actual':         v_test,
        'naive':          naive_preds,
        'ridge':          ridge_preds,
        'rf':             rf_preds,
        'mae_naive':      mae(naive_preds),
        'mae_ridge':      mae(ridge_preds),
        'mae_rf':         mae(rf_preds),
        'model_selected': model_selected,
        'n_train':        n,
        'unit':           unit or '',
    }


def plot_backtest(results, entity_label, output_path):
    times = results['times']
    unit  = results['unit']
    mae_n, mae_r, mae_rf = results['mae_naive'], results['mae_ridge'], results['mae_rf']

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(times, results['actual'], color='#2563eb', linewidth=2.5, label='Actual', zorder=3)
    ax.plot(times, results['naive'],  color='#f59e0b', linewidth=2.0, linestyle='--',
            label=f'Seasonal Naive (MAE={mae_n:.4f})', zorder=2)
    if any(v is not None for v in results['ridge']):
        ax.plot(times, results['ridge'], color='#16a34a', linewidth=2.0, linestyle='-.',
                label=f'Ridge Regression (MAE={mae_r:.4f})', zorder=2)
    if any(v is not None for v in results['rf']):
        ax.plot(times, results['rf'], color='#9333ea', linewidth=2.0,
                linestyle=(0, (3, 1, 1, 1)),
                label=f'Random Forest (MAE={mae_rf:.4f})', zorder=2)

    ax.xaxis.set_major_formatter(mdates.DateFormatter('%b %d'))
    ax.xaxis.set_major_locator(mdates.DayLocator())
    plt.xticks(rotation=30, ha='right', fontsize=8)
    ax.set_ylabel(unit or 'Value', fontsize=9)
    ax.set_title(entity_label, fontsize=10, fontweight='bold')
    ax.legend(fontsize=8, loc='upper right')
    ax.grid(axis='y', linestyle=':', alpha=0.5)
    ax.spines[['top', 'right']].set_visible(False)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Saved: {output_path}")


def plot_combined(all_results, output_path):
    n = len(all_results)
    fig, axes = plt.subplots(n, 1, figsize=(12, 5 * n))
    if n == 1:
        axes = [axes]

    for ax, res in zip(axes, all_results):
        times = res['times']
        unit  = res['unit']
        mae_n, mae_r, mae_rf = res['mae_naive'], res['mae_ridge'], res['mae_rf']

        ax.plot(times, res['actual'], color='#2563eb', linewidth=2.5, label='Actual', zorder=3)
        ax.plot(times, res['naive'],  color='#f59e0b', linewidth=2.0, linestyle='--',
                label=f'Seasonal Naive  MAE = {mae_n:.4f} {unit}', zorder=2)
        if any(v is not None for v in res['ridge']):
            ax.plot(times, res['ridge'], color='#16a34a', linewidth=2.0, linestyle='-.',
                    label=f'Ridge Regression  MAE = {mae_r:.4f} {unit}', zorder=2)
        if any(v is not None for v in res['rf']):
            ax.plot(times, res['rf'], color='#9333ea', linewidth=2.0,
                    linestyle=(0, (3, 1, 1, 1)),
                    label=f'Random Forest  MAE = {mae_rf:.4f} {unit}', zorder=2)

        ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b'))
        ax.xaxis.set_major_locator(mdates.DayLocator())
        plt.setp(ax.get_xticklabels(), rotation=30, ha='right', fontsize=8)
        ax.set_ylabel(unit or 'Value', fontsize=9)
        ax.set_title(res['entity_id'].replace('sensor.', '').replace('_', ' ').title(),
                     fontsize=10, fontweight='bold')
        ax.legend(fontsize=8, loc='upper right')
        ax.grid(axis='y', linestyle=':', alpha=0.5)
        ax.spines[['top', 'right']].set_visible(False)

    plt.tight_layout(h_pad=2.5)
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Saved combined: {output_path}")


# ── Configuration ──────────────────────────────────────────────────────────────

DB_CONFIG = dict(host='localhost', port=55432, user='user', password='password',
                 dbname='greennest_prod')
HOME_ID = 'home1'

# last 700 rows → ~699 training pts → Ridge Regression selected in production
CUTOFF_DATE    = datetime(2026, 6, 18, 0, 0, 0, tzinfo=timezone.utc)
MAX_TRAIN_ROWS = 700
TEST_HOURS  = 168

ENTITIES = [
    'sensor.kitchen_fridge_fridge_energy_total',
    'sensor.kitchen_fridge_fridge_power',
]

OUTPUT_DIR = '/home/dan/Documents/Dizertatie/New/Demo/test/medium_volume'


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    conn = psycopg2.connect(**DB_CONFIG)
    all_results = []

    for entity_id in ENTITIES:
        print(f"\nBacktesting: {entity_id}")
        res = backtest_entity(conn, HOME_ID, entity_id, CUTOFF_DATE, TEST_HOURS,
                              max_train_rows=MAX_TRAIN_ROWS)
        if res is None:
            continue
        all_results.append(res)
        print(f"  MAE Naive : {res['mae_naive']:.4f} {res['unit']}")
        print(f"  MAE Ridge : {res['mae_ridge']:.4f} {res['unit']}")
        print(f"  MAE RF    : {res['mae_rf']:.4f} {res['unit']}")

    if all_results:
        plot_combined(all_results, f'{OUTPUT_DIR}/combined_backtest_medium.png')
        print("\n── Summary ───────────────────────────────────────")
        print(f"{'Entity':<45} {'N train':>8} {'Model':>18} {'MAE Naive':>12} {'MAE Ridge':>12} {'MAE RF':>12}")
        print('-' * 110)
        for r in all_results:
            print(f"{r['entity_id']:<45} {r['n_train']:>8} {r['model_selected']:>18} "
                  f"{r['mae_naive']:>12.4f} {r['mae_ridge']:>12.4f} {r['mae_rf']:>12.4f}")

    conn.close()
