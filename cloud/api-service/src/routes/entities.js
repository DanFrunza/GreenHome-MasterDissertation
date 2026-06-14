const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');
const { requireOwner } = require('../middleware/ownership');

// GET /homes/:home_id/entities/:entity_id/fault-events?from=&to=&limit=
// Returns timestamps when a binary sensor had value='on' within the period
router.get('/:entity_id/fault-events', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, limit = 5 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 5, 20);
    try {
        let query = `
            SELECT recorded_at
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value = 'on'
        `;
        const params = [home_id, entity_id];
        let idx = 3;
        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }
        query += ` ORDER BY recorded_at DESC LIMIT ${limitNum}`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/measurements
router.get('/:entity_id/measurements', async (req, res) => {
    const { limit = 100, from, to } = req.query;
    const { home_id, entity_id } = req.params;
    const limitNum = Math.min(parseInt(limit) || 100, 50000);

    try {
        let query = `
            SELECT value, value_numeric, recorded_at
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2
        `;
        const params = [home_id, entity_id];
        let idx = 3;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        query += ` ORDER BY recorded_at DESC LIMIT ${limitNum}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/aggregations?period=hour|day|week|month&from=&to=
router.get('/:entity_id/aggregations', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { period = 'hour', from, to } = req.query;

    try {
        let query = `
            SELECT period_start, avg_value, min_value, max_value, count
            FROM aggregations
            WHERE home_id = $1 AND entity_id = $2 AND period = $3
        `;
        const params = [home_id, entity_id, period];
        let idx = 4;

        if (from) { query += ` AND period_start >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND period_start <= $${idx++}`; params.push(to); }

        query += ' ORDER BY period_start ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/overview?from=&to=
router.get('/:entity_id/overview', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to } = req.query;

    try {
        const params = [home_id, entity_id];
        let idx = 3;
        let filters = '';

        if (from) { filters += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { filters += ` AND recorded_at <= $${idx++}`; params.push(to); }

        const query = `
            WITH filtered AS (
                SELECT value_numeric, recorded_at
                FROM measurements
                WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
                ${filters}
            )
            SELECT
                AVG(value_numeric)         AS avg_value,
                MIN(value_numeric)         AS min_value,
                MAX(value_numeric)         AS max_value,
                COUNT(*)                   AS count,
                MIN(recorded_at)           AS first_recorded,
                MAX(recorded_at)           AS last_recorded,
                STDDEV_SAMP(value_numeric) AS std_dev,
                (SELECT value_numeric FROM measurements m2
                 WHERE m2.home_id = $1 AND m2.entity_id = $2 AND m2.value_numeric IS NOT NULL
                 ORDER BY m2.recorded_at DESC LIMIT 1) AS last_value,
                (SELECT recorded_at FROM filtered
                 ORDER BY value_numeric ASC,  recorded_at ASC  LIMIT 1) AS min_recorded_at,
                (SELECT recorded_at FROM filtered
                 ORDER BY value_numeric DESC, recorded_at ASC  LIMIT 1) AS max_recorded_at,
                (SELECT value_numeric FROM filtered ORDER BY recorded_at ASC  LIMIT 1) AS first_value,
                (SELECT value_numeric FROM filtered ORDER BY recorded_at DESC LIMIT 1) AS period_last_value
            FROM filtered
        `;

        const result = await pool.query(query, params);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/meter-resets?from=&to=
router.get('/:entity_id/meter-resets', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to } = req.query;

    try {
        let query = `
            SELECT id, reset_at, value_before, value_after
            FROM meter_resets
            WHERE home_id = $1 AND entity_id = $2
        `;
        const params = [home_id, entity_id];
        let idx = 3;

        if (from) { query += ` AND reset_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND reset_at <= $${idx++}`; params.push(to); }
        query += ' ORDER BY reset_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/hourly-profile?from=&to=&tz=
router.get('/:entity_id/hourly-profile', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, tz = 'UTC' } = req.query;

    try {
        let query = `
            SELECT
                EXTRACT(HOUR FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) AS hour,
                AVG(value_numeric) AS avg_value,
                MIN(value_numeric) AS min_value,
                MAX(value_numeric) AS max_value,
                COUNT(*)           AS count
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
        `;
        const params = [home_id, entity_id, tz];
        let idx = 4;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        query += ' GROUP BY hour ORDER BY hour';

        const result = await pool.query(query, params);
        const byHour = {};
        result.rows.forEach(r => { byHour[parseInt(r.hour)] = r; });
        const hours = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            avg_value: byHour[h] ? parseFloat(byHour[h].avg_value) : null,
            min_value: byHour[h] ? parseFloat(byHour[h].min_value) : null,
            max_value: byHour[h] ? parseFloat(byHour[h].max_value) : null,
            count:     byHour[h] ? parseInt(byHour[h].count) : 0,
        }));
        res.json(hours);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/hourly-profile-split?from=&to=&tz=
router.get('/:entity_id/hourly-profile-split', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, tz = 'UTC' } = req.query;

    try {
        let query = `
            SELECT
                EXTRACT(HOUR FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) AS hour,
                CASE WHEN EXTRACT(DOW FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) IN (0, 6)
                     THEN 'weekend' ELSE 'weekday' END AS day_type,
                AVG(value_numeric) AS avg_value,
                COUNT(*)           AS count
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
        `;
        const params = [home_id, entity_id, tz];
        let idx = 4;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        query += ' GROUP BY hour, day_type ORDER BY hour, day_type';

        const result = await pool.query(query, params);
        const grid = {};
        result.rows.forEach(r => {
            const h = parseInt(r.hour);
            if (!grid[h]) grid[h] = {};
            grid[h][r.day_type] = { avg_value: parseFloat(r.avg_value), count: parseInt(r.count) };
        });

        const hours = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            weekday_avg:   grid[h]?.weekday?.avg_value ?? null,
            weekday_count: grid[h]?.weekday?.count     ?? 0,
            weekend_avg:   grid[h]?.weekend?.avg_value ?? null,
            weekend_count: grid[h]?.weekend?.count     ?? 0,
        }));
        res.json(hours);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/heatmap?from=&to=&tz=
router.get('/:entity_id/heatmap', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, tz = 'UTC' } = req.query;

    try {
        let query = `
            SELECT
                EXTRACT(DOW  FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) AS dow,
                EXTRACT(HOUR FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) AS hour,
                AVG(value_numeric) AS avg_value,
                COUNT(*)           AS count
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
        `;
        const params = [home_id, entity_id, tz];
        let idx = 4;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        query += ' GROUP BY dow, hour ORDER BY dow, hour';

        const result = await pool.query(query, params);
        const grid = {};
        result.rows.forEach(r => {
            grid[`${parseInt(r.dow)}_${parseInt(r.hour)}`] = {
                avg_value: parseFloat(r.avg_value),
                count:     parseInt(r.count),
            };
        });

        const cells = [];
        for (let dow = 0; dow < 7; dow++) {
            for (let hour = 0; hour < 24; hour++) {
                const cell = grid[`${dow}_${hour}`];
                cells.push({ dow, hour, avg_value: cell?.avg_value ?? null, count: cell?.count ?? 0 });
            }
        }
        res.json(cells);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/seasonal-profile?from=&tz=
router.get('/:entity_id/seasonal-profile', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, tz = 'UTC' } = req.query;

    try {
        let query = `
            SELECT
                CASE
                    WHEN EXTRACT(MONTH FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) IN (3,4,5)   THEN 'Spring'
                    WHEN EXTRACT(MONTH FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) IN (6,7,8)   THEN 'Summer'
                    WHEN EXTRACT(MONTH FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) IN (9,10,11) THEN 'Autumn'
                    ELSE 'Winter'
                END AS season,
                EXTRACT(HOUR FROM (recorded_at AT TIME ZONE 'UTC') AT TIME ZONE $3) AS hour,
                AVG(value_numeric) AS avg_value,
                COUNT(*) AS count
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
        `;
        const params = [home_id, entity_id, tz];
        let idx = 4;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        query += ' GROUP BY season, hour ORDER BY season, hour';

        const result = await pool.query(query, params);

        const seasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const grid = {};
        result.rows.forEach(r => {
            if (!grid[r.season]) grid[r.season] = {};
            grid[r.season][parseInt(r.hour)] = {
                avg_value: parseFloat(r.avg_value),
                count: parseInt(r.count),
            };
        });

        const out = {};
        seasons.forEach(s => {
            if (!grid[s]) return;
            out[s] = Array.from({ length: 24 }, (_, h) => ({
                hour: h,
                avg_value: grid[s][h]?.avg_value ?? null,
                count: grid[s][h]?.count ?? 0,
            }));
        });

        res.json(out);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/hourly-agg-split?from=&to=&tz=
// Like hourly-profile-split but uses aggregation deltas (max-min) — correct for kWh cumulative sensors
router.get('/:entity_id/hourly-agg-split', async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { from, to, tz = 'UTC' } = req.query;

    try {
        let query = `
            SELECT
                EXTRACT(HOUR FROM (period_start AT TIME ZONE 'UTC') AT TIME ZONE $3) AS hour,
                CASE WHEN EXTRACT(DOW FROM (period_start AT TIME ZONE 'UTC') AT TIME ZONE $3) IN (0, 6)
                     THEN 'weekend' ELSE 'weekday' END AS day_type,
                AVG(GREATEST(0, max_value - min_value)) AS avg_delta,
                COUNT(*) AS count
            FROM aggregations
            WHERE home_id = $1 AND entity_id = $2 AND period = 'hour'
              AND max_value IS NOT NULL AND min_value IS NOT NULL
        `;
        const params = [home_id, entity_id, tz];
        let idx = 4;

        if (from) { query += ` AND period_start >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND period_start <= $${idx++}`; params.push(to); }

        query += ' GROUP BY hour, day_type ORDER BY hour, day_type';

        const result = await pool.query(query, params);
        const grid = {};
        result.rows.forEach(r => {
            const h = parseInt(r.hour);
            if (!grid[h]) grid[h] = {};
            grid[h][r.day_type] = { avg_delta: parseFloat(r.avg_delta), count: parseInt(r.count) };
        });
        const hours = Array.from({ length: 24 }, (_, h) => ({
            hour:          h,
            weekday_avg:   grid[h]?.weekday?.avg_delta ?? null,
            weekday_count: grid[h]?.weekday?.count     ?? 0,
            weekend_avg:   grid[h]?.weekend?.avg_delta ?? null,
            weekend_count: grid[h]?.weekend?.count     ?? 0,
        }));
        res.json(hours);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/prediction-accuracy
router.get('/:entity_id/prediction-accuracy', async (req, res) => {
    const { home_id, entity_id } = req.params;
    try {
        const result = await pool.query(`
            WITH entity_info AS (
                SELECT unit, device_class FROM entities WHERE home_id = $1 AND entity_id = $2
            ),
            hourly_actual AS (
                SELECT
                    a.period_start,
                    CASE
                        WHEN ei.device_class = 'energy' OR ei.unit = 'kWh'
                        THEN GREATEST(0, a.avg_value - LAG(a.avg_value) OVER (ORDER BY a.period_start))
                        ELSE a.avg_value
                    END AS actual_value
                FROM aggregations a
                CROSS JOIN entity_info ei
                WHERE a.home_id = $1 AND a.entity_id = $2 AND a.period = 'hour'
                  AND a.period_start >= NOW() - INTERVAL '8 days'
            )
            SELECT
                AVG(ABS(p.predicted_value - ha.actual_value)) AS mae,
                AVG(ha.actual_value)                           AS mean_actual,
                COUNT(*)                                       AS n,
                (SELECT COUNT(*) FROM aggregations
                 WHERE home_id = $1 AND entity_id = $2 AND period = 'hour'
                   AND period_start >= NOW() - INTERVAL '90 days') AS training_count
            FROM predictions p
            JOIN hourly_actual ha ON ha.period_start = p.target_time
            WHERE p.home_id   = $1
              AND p.entity_id = $2
              AND p.target_time < NOW()
              AND p.target_time >= NOW() - INTERVAL '7 days'
              AND ha.actual_value IS NOT NULL
        `, [home_id, entity_id]);
        const row = result.rows[0];
        if (!row || parseInt(row.n) === 0) return res.json({ available: false });
        res.json({
            available:       true,
            mae:             row.mae            != null ? parseFloat(row.mae)            : null,
            mean_actual:     row.mean_actual    != null ? parseFloat(row.mean_actual)    : null,
            n:               parseInt(row.n),
            training_count:  row.training_count != null ? parseInt(row.training_count)  : null,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id/entities/:entity_id/predictions
router.get('/:entity_id/predictions', async (req, res) => {
    const { home_id, entity_id } = req.params;
    try {
        const result = await pool.query(`
            SELECT target_time, predicted_value, model_type, predicted_at
            FROM predictions
            WHERE home_id = $1 AND entity_id = $2
              AND target_time > NOW() - INTERVAL '1 hour'
              AND target_time <= NOW() + INTERVAL '30 days'
            ORDER BY target_time ASC
        `, [home_id, entity_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/entities/:entity_id/command
router.post('/:entity_id/command', requireOwner, async (req, res) => {
    const { home_id, entity_id } = req.params;
    const { action } = req.body;

    if (!['on', 'off'].includes(action)) {
        return res.status(400).json({ error: 'action must be "on" or "off"' });
    }

    const topic = `${home_id}/backend/command/${entity_id}`;
    const mqttServiceUrl = process.env.MQTT_SERVICE_URL || 'http://mqtt-service:5000';

    try {
        const response = await fetch(`${mqttServiceUrl}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, payload: action })
        });
        if (!response.ok) throw new Error(`mqtt-service responded with ${response.status}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[COMMAND]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /homes/:home_id/entities/:entity_id/anomaly-settings
router.patch('/:entity_id/anomaly-settings', async (req, res) => {
    const { home_id, entity_id } = req.params
    const { muted, suppressed } = req.body
    if (typeof muted !== 'boolean' && typeof suppressed !== 'boolean') {
        return res.status(400).json({ error: 'Provide at least one of: muted, suppressed (boolean)' })
    }
    const updates = []
    const params  = []
    let idx = 1
    if (typeof muted      === 'boolean') { updates.push(`anomaly_muted = $${idx++}`);      params.push(muted) }
    if (typeof suppressed === 'boolean') { updates.push(`anomaly_suppressed = $${idx++}`); params.push(suppressed) }
    params.push(home_id, entity_id)
    try {
        const result = await pool.query(
            `UPDATE entities SET ${updates.join(', ')}
             WHERE home_id = $${idx++} AND entity_id = $${idx++}
             RETURNING entity_id, anomaly_muted, anomaly_suppressed`,
            params
        )
        if (!result.rows.length) return res.status(404).json({ error: 'Entity not found' })
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router;
