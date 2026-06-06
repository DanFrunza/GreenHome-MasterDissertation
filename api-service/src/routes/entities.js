const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

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
        let query = `
            SELECT
                AVG(value_numeric)   AS avg_value,
                MIN(value_numeric)   AS min_value,
                MAX(value_numeric)   AS max_value,
                COUNT(*)             AS count,
                MIN(recorded_at)     AS first_recorded,
                MAX(recorded_at)     AS last_recorded
            FROM measurements
            WHERE home_id = $1 AND entity_id = $2 AND value_numeric IS NOT NULL
        `;
        const params = [home_id, entity_id];
        let idx = 3;

        if (from) { query += ` AND recorded_at >= $${idx++}`; params.push(from); }
        if (to)   { query += ` AND recorded_at <= $${idx++}`; params.push(to); }

        const result = await pool.query(query, params);
        res.json(result.rows[0]);
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
            SELECT
                AVG(ABS(p.predicted_value - a.avg_value)) AS mae,
                AVG(a.avg_value)                           AS mean_actual,
                COUNT(*)                                   AS n
            FROM predictions p
            JOIN aggregations a
              ON  a.home_id      = p.home_id
              AND a.entity_id    = p.entity_id
              AND a.period       = 'hour'
              AND a.period_start = p.target_time
            WHERE p.home_id   = $1
              AND p.entity_id = $2
              AND p.target_time < NOW()
              AND p.target_time >= NOW() - INTERVAL '7 days'
        `, [home_id, entity_id]);
        const row = result.rows[0];
        if (!row || parseInt(row.n) === 0) return res.json({ available: false });
        res.json({
            available:    true,
            mae:          row.mae          != null ? parseFloat(row.mae)          : null,
            mean_actual:  row.mean_actual  != null ? parseFloat(row.mean_actual)  : null,
            n:            parseInt(row.n),
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
              AND target_time <= NOW() + INTERVAL '7 days'
            ORDER BY target_time ASC
        `, [home_id, entity_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/entities/:entity_id/command
router.post('/:entity_id/command', async (req, res) => {
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

module.exports = router;
