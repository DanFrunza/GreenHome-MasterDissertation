const express = require('express')
const router = express.Router()
const pool = require('../db')

// GET /users/me/homes — homes the authenticated user has access to
router.get('/me/homes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.id, h.name, h.status, h.agent_status, h.last_seen, h.created_at, uh.role
            FROM homes h
            JOIN user_homes uh ON h.id = uh.home_id
            WHERE uh.user_id = $1
            ORDER BY uh.joined_at ASC
        `, [req.user.id])
        res.json(result.rows)
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router
