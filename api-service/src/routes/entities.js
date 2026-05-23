const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

// GET /homes/:home_id/entities/:entity_id/measurements
router.get('/:entity_id/measurements', async (req, res) => {
    const { limit = 100, from, to } = req.query;
    const { home_id, entity_id } = req.params;
    const limitNum = Math.min(parseInt(limit) || 100, 1000);

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
                EXTRACT(HOUR FROM recorded_at AT TIME ZONE $3) AS hour,
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
                EXTRACT(HOUR FROM recorded_at AT TIME ZONE $3) AS hour,
                CASE WHEN EXTRACT(DOW FROM recorded_at AT TIME ZONE $3) IN (0, 6)
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
                EXTRACT(DOW  FROM recorded_at AT TIME ZONE $3) AS dow,
                EXTRACT(HOUR FROM recorded_at AT TIME ZONE $3) AS hour,
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
