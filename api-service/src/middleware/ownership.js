const pool = require('../db')

async function ownershipMiddleware(req, res, next) {
    const { home_id } = req.params
    if (!home_id) return next()
    try {
        const result = await pool.query(
            'SELECT role FROM user_homes WHERE user_id = $1 AND home_id = $2',
            [req.user.id, home_id]
        )
        if (!result.rows.length) {
            return res.status(403).json({ error: 'Access denied' })
        }
        req.userRole = result.rows[0].role
        next()
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
}

function requireOwner(req, res, next) {
    if (req.userRole !== 'owner') {
        return res.status(403).json({ error: 'Owner access required' })
    }
    next()
}

module.exports = { ownershipMiddleware, requireOwner }
