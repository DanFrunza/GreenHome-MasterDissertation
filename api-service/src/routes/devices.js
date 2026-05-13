const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

// GET /homes/:home_id/devices
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM devices WHERE home_id = $1 ORDER BY created_at',
            [req.params.home_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /homes/:home_id/devices/:device_id
router.get('/:device_id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM devices WHERE home_id = $1 AND device_id = $2',
            [req.params.home_id, req.params.device_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// PATCH /homes/:home_id/devices/:device_id
router.patch('/:device_id', async (req, res) => {
    const { attribute, unit, ha_entity_id } = req.body;

    if (!attribute) {
        return res.status(400).json({ error: 'attribute is required' });
    }

    try {
        const result = await pool.query(`
            INSERT INTO device_attributes (home_id, device_id, attribute, unit, ha_entity_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (home_id, device_id, attribute) DO UPDATE
            SET unit = EXCLUDED.unit,
                ha_entity_id = EXCLUDED.ha_entity_id
            RETURNING *
        `, [req.params.home_id, req.params.device_id, attribute, unit || null, ha_entity_id || null]);

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

module.exports = router;