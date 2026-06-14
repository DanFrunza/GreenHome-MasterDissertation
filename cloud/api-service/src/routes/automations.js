const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db');
const { requireOwner } = require('../middleware/ownership');

// GET /homes/:home_id/automations
router.get('/', async (req, res) => {
    const { home_id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                a.automation_id,
                a.alias,
                a.description,
                a.enabled,
                a.mode,
                a.last_triggered,
                a.raw_config,
                a.ha_entity_id,
                COALESCE((
                    SELECT JSON_AGG(JSONB_BUILD_OBJECT(
                        'trigger_type', t.trigger_type,
                        'entity_id',    t.entity_id,
                        'above',        t.above,
                        'below',        t.below,
                        'from_state',   t.from_state,
                        'to_state',     t.to_state,
                        'at_time',      t.at_time,
                        'event_type',   t.event_type
                    ) ORDER BY t.id)
                    FROM automation_triggers t
                    WHERE t.home_id = a.home_id AND t.automation_id = a.automation_id
                ), '[]') AS triggers,
                COALESCE((
                    SELECT JSON_AGG(JSONB_BUILD_OBJECT(
                        'condition_type', c.condition_type,
                        'entity_id',      c.entity_id,
                        'above',          c.above,
                        'below',          c.below,
                        'state_value',    c.state_value,
                        'template_text',  c.template_text
                    ) ORDER BY c.id)
                    FROM automation_conditions c
                    WHERE c.home_id = a.home_id AND c.automation_id = a.automation_id
                ), '[]') AS conditions,
                COALESCE((
                    SELECT JSON_AGG(JSONB_BUILD_OBJECT(
                        'action_type', ac.action_type,
                        'service',     ac.service,
                        'entity_id',   ac.entity_id,
                        'delay',       ac.delay
                    ) ORDER BY ac.action_order)
                    FROM automation_actions ac
                    WHERE ac.home_id = a.home_id AND ac.automation_id = a.automation_id
                ), '[]') AS actions
            FROM automations a
            WHERE a.home_id = $1
            ORDER BY a.alias
        `, [home_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/automations/refresh  — trigger re-discovery
router.post('/refresh', async (req, res) => {
    const { home_id } = req.params;
    const mqttServiceUrl = process.env.MQTT_SERVICE_URL || 'http://mqtt-service:5000';
    try {
        const topic = `${home_id}/backend/system/automation_discovery`;
        const response = await fetch(`${mqttServiceUrl}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, payload: '{}' })
        });
        if (!response.ok) throw new Error(`mqtt-service responded with ${response.status}`);
        res.json({ ok: true, message: 'Discovery triggered' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/automations/:automation_id/enable
router.post('/:automation_id/enable', requireOwner, async (req, res) => {
    const { home_id, automation_id } = req.params;
    const mqttServiceUrl = process.env.MQTT_SERVICE_URL || 'http://mqtt-service:5000';
    try {
        const { rows } = await pool.query(
            'SELECT ha_entity_id FROM automations WHERE home_id = $1 AND automation_id = $2',
            [home_id, automation_id]
        );
        if (!rows.length || !rows[0].ha_entity_id) return res.status(404).json({ error: 'Automation not found' });
        const topic = `${home_id}/backend/command/${rows[0].ha_entity_id}`;
        const response = await fetch(`${mqttServiceUrl}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, payload: 'on' })
        });
        if (!response.ok) throw new Error(`mqtt-service responded with ${response.status}`);
        await pool.query(
            'UPDATE automations SET enabled = true WHERE home_id = $1 AND automation_id = $2',
            [home_id, automation_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /homes/:home_id/automations/:automation_id/disable
router.post('/:automation_id/disable', requireOwner, async (req, res) => {
    const { home_id, automation_id } = req.params;
    const mqttServiceUrl = process.env.MQTT_SERVICE_URL || 'http://mqtt-service:5000';
    try {
        const { rows } = await pool.query(
            'SELECT ha_entity_id FROM automations WHERE home_id = $1 AND automation_id = $2',
            [home_id, automation_id]
        );
        if (!rows.length || !rows[0].ha_entity_id) return res.status(404).json({ error: 'Automation not found' });
        const topic = `${home_id}/backend/command/${rows[0].ha_entity_id}`;
        const response = await fetch(`${mqttServiceUrl}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, payload: 'off' })
        });
        if (!response.ok) throw new Error(`mqtt-service responded with ${response.status}`);
        await pool.query(
            'UPDATE automations SET enabled = false WHERE home_id = $1 AND automation_id = $2',
            [home_id, automation_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
