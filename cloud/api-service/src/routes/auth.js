const express = require('express')
const router = express.Router()
const argon2 = require('argon2')
const jwt = require('jsonwebtoken')
const pool = require('../db')
const { jwtMiddleware, JWT_SECRET } = require('../middleware/auth')

const TOKEN_TTL = '7d'

function makeToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, username: user.username },
        JWT_SECRET,
        { expiresIn: TOKEN_TTL }
    )
}

// POST /auth/register
router.post('/register', async (req, res) => {
    const { username, email, password, display_name } = req.body
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email and password are required' })
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    try {
        const hash = await argon2.hash(password)
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name',
            [username.trim(), email.trim().toLowerCase(), hash, display_name?.trim() || null]
        )
        const user = result.rows[0]
        res.status(201).json({ token: makeToken(user), user })
    } catch (err) {
        if (err.code === '23505') {
            const field = err.constraint?.includes('email') ? 'email' : 'username'
            return res.status(409).json({ error: `This ${field} is already registered` })
        }
        res.status(500).json({ error: err.message })
    }
})

// POST /auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' })
    }
    try {
        const result = await pool.query(
            'SELECT id, username, email, display_name, password_hash FROM users WHERE email = $1',
            [email.trim().toLowerCase()]
        )
        const user = result.rows[0]
        if (!user) return res.status(401).json({ error: 'Invalid email or password' })

        const valid = await argon2.verify(user.password_hash, password)
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' })

        const { password_hash: _, ...safeUser } = user
        res.json({ token: makeToken(safeUser), user: safeUser })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// GET /auth/me — always fetches fresh from DB so display_name changes are reflected
router.get('/me', jwtMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, display_name FROM users WHERE id = $1',
            [req.user.id]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PATCH /auth/me — update display_name
router.patch('/me', jwtMiddleware, async (req, res) => {
    const { display_name } = req.body
    try {
        const result = await pool.query(
            'UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, username, email, display_name',
            [display_name?.trim() || null, req.user.id]
        )
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router
