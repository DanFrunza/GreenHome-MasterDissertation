const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /homes
router.get('/', async (_req, res) => {
    try {
        const result = await pool.query('SELECT * FROM homes ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /homes/:home_id
router.get('/:home_id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM homes WHERE id = $1', [req.params.home_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Home not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
