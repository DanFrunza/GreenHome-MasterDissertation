const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /users/:user_id/homes
router.get('/:user_id/homes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.*, uh.role
            FROM homes h
            JOIN user_homes uh ON h.id = uh.home_id
            WHERE uh.user_id = $1
        `, [req.params.user_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;