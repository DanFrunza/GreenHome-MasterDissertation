const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /homes
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM homes ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// GET /homes/:home_id
router.get('/:home_id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM homes WHERE id = $1',
            [req.params.home_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Home not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/:home_id/structure', async (req, res) => {
    try {
        const devicesResult = await pool.query(
            'SELECT device_id, source, available, last_seen FROM devices WHERE home_id = $1',
            [req.params.home_id]
        );

        const structure = await Promise.all(
            devicesResult.rows.map(async (device) => {
                const attrResult = await pool.query(`
                    SELECT 
                        m.attribute,
                        da.unit,
                        da.ha_entity_id
                    FROM (
                        SELECT DISTINCT attribute FROM measurements
                        WHERE home_id = $1 AND device_id = $2
                    ) m
                    LEFT JOIN device_attributes da
                        ON da.home_id = $1
                        AND da.device_id = $2
                        AND da.attribute = m.attribute
                    ORDER BY m.attribute
                `, [req.params.home_id, device.device_id]);

                return {
                    ...device,
                    attributes: attrResult.rows
                };
            })
        );

        res.json(structure);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;