const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

// GET /homes/:home_id/devices
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                device_id,
                BOOL_AND(available) AS available,
                MAX(last_seen)      AS last_seen,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'entity_id',     entity_id,
                        'domain',        domain,
                        'friendly_name', friendly_name,
                        'unit',          unit,
                        'device_class',  device_class,
                        'state',         state,
                        'available',     available,
                        'last_seen',     last_seen
                    ) ORDER BY entity_id
                ) AS entities
            FROM entities
            WHERE home_id = $1
            GROUP BY device_id
            ORDER BY MAX(last_seen) DESC NULLS LAST
        `, [req.params.home_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/devices/refresh
router.post('/refresh', async (req, res) => {
    const { home_id } = req.params;
    const mqttServiceUrl = process.env.MQTT_SERVICE_URL || 'http://mqtt-service:5000';
    try {
        const response = await fetch(`${mqttServiceUrl}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: `${home_id}/backend/system/entity_discovery`, payload: '{}' })
        });
        if (!response.ok) throw new Error(`mqtt-service responded with ${response.status}`);
        res.json({ ok: true, message: 'Discovery triggered' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
