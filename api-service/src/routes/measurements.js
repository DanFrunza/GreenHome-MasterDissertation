const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

router.get('/', async (req, res) => {
    const { attribute, limit = 100, from, to } = req.query;
    const { home_id, device_id } = req.params;
    const limitNum = Math.min(parseInt(limit) || 100, 1000);

    try {
        let query = `
            SELECT attribute, value, value_numeric, recorded_at
            FROM measurements
            WHERE home_id = $1 AND device_id = $2
        `;
        const params = [home_id, device_id];
        let idx = 3;

        if (attribute) {
            query += ` AND attribute = $${idx++}`;
            params.push(attribute);
        }
        if (from) {
            query += ` AND recorded_at >= $${idx++}`;
            params.push(from);
        }
        if (to) {
            query += ` AND recorded_at <= $${idx++}`;
            params.push(to);
        }

        query += ` ORDER BY recorded_at DESC LIMIT ${limitNum}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/latest', async (req, res) => {
    const { home_id, device_id } = req.params;

    try {
        const result = await pool.query(`
            SELECT DISTINCT ON (attribute)
                attribute, value, value_numeric, recorded_at
            FROM measurements
            WHERE home_id = $1 AND device_id = $2
            ORDER BY attribute, recorded_at DESC
        `, [home_id, device_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;