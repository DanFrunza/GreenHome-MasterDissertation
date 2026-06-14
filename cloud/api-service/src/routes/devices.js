const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');

// GET /homes/:home_id/devices
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                e.device_id,
                BOOL_OR(e.available)   AS available,
                MAX(e.last_seen)       AS last_seen,
                dm.appliance_type,
                dm.energy_class,
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'entity_id',          e.entity_id,
                        'domain',             e.domain,
                        'friendly_name',      e.friendly_name,
                        'unit',               e.unit,
                        'device_class',       e.device_class,
                        'state',              e.state,
                        'available',          e.available,
                        'last_seen',          e.last_seen,
                        'anomaly_muted',      COALESCE(e.anomaly_muted, false),
                        'anomaly_suppressed', COALESCE(e.anomaly_suppressed, false)
                    ) ORDER BY e.entity_id
                ) AS entities
            FROM entities e
            LEFT JOIN device_metadata dm
                   ON dm.home_id = e.home_id AND dm.device_id = e.device_id
            WHERE e.home_id = $1
            GROUP BY e.device_id, dm.appliance_type, dm.energy_class
        `, [req.params.home_id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH /homes/:home_id/devices/:device_id/metadata
router.patch('/:device_id/metadata', async (req, res) => {
    const { home_id, device_id } = req.params;
    const { appliance_type, energy_class } = req.body;
    try {
        await pool.query(`
            INSERT INTO device_metadata (home_id, device_id, appliance_type, energy_class)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (home_id, device_id)
            DO UPDATE SET appliance_type = $3, energy_class = $4, updated_at = NOW()
        `, [home_id, device_id, appliance_type ?? null, energy_class ?? null]);
        res.json({ ok: true });
    } catch (err) {
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
