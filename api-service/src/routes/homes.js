const express = require('express')
const router = express.Router()
const argon2 = require('argon2')
const pool = require('../db')
const { ownershipMiddleware, requireOwner } = require('../middleware/ownership')

function generateId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let id = 'gh-'
    for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
    return id
}

function generateSecret(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let s = ''
    for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
}

// POST /homes — create a new home, caller becomes owner
router.post('/', async (req, res) => {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' })

    const home_id  = generateId()
    const password = generateSecret()
    const hash     = await argon2.hash(password)

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        await client.query('INSERT INTO homes (id, name) VALUES ($1, $2)', [home_id, name.trim()])
        await client.query(
            'INSERT INTO user_homes (user_id, home_id, role) VALUES ($1, $2, $3)',
            [req.user.id, home_id, 'owner']
        )
        await client.query(
            'INSERT INTO home_credentials (home_id, mqtt_password_hash) VALUES ($1, $2)',
            [home_id, hash]
        )
        await client.query('COMMIT')
        res.status(201).json({
            id:            home_id,
            name:          name.trim(),
            mqtt_username: home_id,
            mqtt_password: password,
            mqtt_host:     process.env.MQTT_HOST || 'localhost',
            mqtt_port:     parseInt(process.env.MQTT_PORT) || 1883,
            note:          'Save the mqtt_password now — it will not be shown again.',
        })
    } catch (err) {
        await client.query('ROLLBACK')
        res.status(500).json({ error: err.message })
    } finally {
        client.release()
    }
})

// POST /homes/:home_id/join — join an existing home as member (no prior membership needed)
router.post('/:home_id/join', async (req, res) => {
    const { home_id } = req.params
    try {
        const home = await pool.query('SELECT id FROM homes WHERE id = $1', [home_id])
        if (!home.rows.length) return res.status(404).json({ error: 'Home not found' })

        const existing = await pool.query(
            'SELECT role FROM user_homes WHERE user_id = $1 AND home_id = $2',
            [req.user.id, home_id]
        )
        if (existing.rows.length) {
            return res.status(409).json({ error: 'You are already a member of this home' })
        }
        await pool.query(
            'INSERT INTO user_homes (user_id, home_id, role) VALUES ($1, $2, $3)',
            [req.user.id, home_id, 'member']
        )
        res.json({ ok: true, role: 'member' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /homes/:home_id — home details (any member)
router.get('/:home_id', ownershipMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM homes WHERE id = $1', [req.params.home_id])
        if (!result.rows.length) return res.status(404).json({ error: 'Home not found' })
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /homes/:home_id/config (any member)
router.get('/:home_id/config', ownershipMiddleware, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM home_config WHERE home_id = $1', [req.params.home_id])
        res.json(result.rows[0] ?? null)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /homes/:home_id/anomalies?entity_id=&from=&limit= (any member)
router.get('/:home_id/anomalies', ownershipMiddleware, async (req, res) => {
    const { home_id } = req.params
    const { entity_id, from, limit = 50 } = req.query
    const limitNum = Math.min(parseInt(limit) || 50, 500)
    try {
        let query = `
            SELECT a.id, a.entity_id, a.detected_at, a.value, a.mean, a.std_dev, a.z_score, a.severity,
                   e.friendly_name, e.unit, e.device_id
            FROM anomalies a
            LEFT JOIN entities e ON e.home_id = a.home_id AND e.entity_id = a.entity_id
            WHERE a.home_id = $1
        `
        const params = [home_id]
        let idx = 2
        if (entity_id) { query += ` AND a.entity_id = $${idx++}`; params.push(entity_id) }
        if (from)      { query += ` AND a.detected_at >= $${idx++}`; params.push(from) }
        query += ` ORDER BY a.detected_at DESC LIMIT ${limitNum}`
        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /homes/:home_id/mqtt-config — regenerate MQTT password (owner only)
router.get('/:home_id/mqtt-config', ownershipMiddleware, requireOwner, async (req, res) => {
    const { home_id } = req.params
    const password = generateSecret()
    const hash     = await argon2.hash(password)
    try {
        await pool.query(
            `INSERT INTO home_credentials (home_id, mqtt_password_hash) VALUES ($1, $2)
             ON CONFLICT (home_id) DO UPDATE SET mqtt_password_hash = $2, created_at = NOW()`,
            [home_id, hash]
        )
        res.json({
            mqtt_username: home_id,
            mqtt_password: password,
            mqtt_host:     process.env.MQTT_HOST || 'localhost',
            mqtt_port:     parseInt(process.env.MQTT_PORT) || 1883,
            note:          'This is a freshly generated password. Update your broker config.',
        })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /homes/:home_id/members (any member)
router.get('/:home_id/members', ownershipMiddleware, async (req, res) => {
    const { home_id } = req.params
    try {
        const result = await pool.query(`
            SELECT u.id, u.username, u.display_name, u.email, uh.role, uh.joined_at
            FROM user_homes uh
            JOIN users u ON u.id = uh.user_id
            WHERE uh.home_id = $1
            ORDER BY
                CASE uh.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                uh.joined_at ASC
        `, [home_id])
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PATCH /homes/:home_id/members/:user_id/role (owner only)
router.patch('/:home_id/members/:user_id/role', ownershipMiddleware, requireOwner, async (req, res) => {
    const { home_id, user_id } = req.params
    const { role } = req.body
    if (!['owner', 'admin', 'member'].includes(role)) {
        return res.status(400).json({ error: 'role must be "owner", "admin" or "member"' })
    }
    // Prevent demoting the last owner
    if (parseInt(user_id) === req.user.id && role !== 'owner') {
        const owners = await pool.query(
            "SELECT COUNT(*) FROM user_homes WHERE home_id = $1 AND role = 'owner'",
            [home_id]
        )
        if (parseInt(owners.rows[0].count) <= 1) {
            return res.status(400).json({ error: 'Cannot demote the only owner' })
        }
    }
    try {
        const result = await pool.query(
            'UPDATE user_homes SET role = $1 WHERE home_id = $2 AND user_id = $3 RETURNING *',
            [role, home_id, user_id]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'Member not found' })
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// DELETE /homes/:home_id/members/:user_id
// owner: can remove anyone (with last-owner protection)
// admin: can remove members only
// member: 403
router.delete('/:home_id/members/:user_id', ownershipMiddleware, async (req, res) => {
    const { home_id, user_id } = req.params
    const callerRole = req.userRole

    if (callerRole === 'member') {
        return res.status(403).json({ error: 'Only admins and owners can remove members' })
    }

    const target = await pool.query(
        'SELECT role FROM user_homes WHERE home_id = $1 AND user_id = $2',
        [home_id, user_id]
    )
    if (!target.rows.length) return res.status(404).json({ error: 'Member not found' })

    const targetRole = target.rows[0].role

    // Admin can only remove members, not other admins or owners
    if (callerRole === 'admin' && targetRole !== 'member') {
        return res.status(403).json({ error: 'Admins can only remove members' })
    }

    // Protect last owner
    if (targetRole === 'owner') {
        const owners = await pool.query(
            "SELECT COUNT(*) FROM user_homes WHERE home_id = $1 AND role = 'owner'",
            [home_id]
        )
        if (parseInt(owners.rows[0].count) <= 1) {
            return res.status(400).json({ error: 'Cannot remove the only owner' })
        }
    }
    try {
        await pool.query(
            'DELETE FROM user_homes WHERE home_id = $1 AND user_id = $2',
            [home_id, user_id]
        )
        res.json({ ok: true })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router
