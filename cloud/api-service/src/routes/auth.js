const express = require('express')
const router = express.Router()
const argon2 = require('argon2')
const jwt = require('jsonwebtoken')
const pool = require('../db')
const { jwtMiddleware, JWT_SECRET } = require('../middleware/auth')

const TOKEN_TTL = '7d'

const USER_FIELDS = 'id, username, email, display_name, phone, timezone, language, notifications_enabled, theme, created_at, updated_at'

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
            `INSERT INTO users (username, email, password_hash, display_name)
             VALUES ($1, $2, $3, $4)
             RETURNING ${USER_FIELDS}`,
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
            `SELECT ${USER_FIELDS}, password_hash FROM users WHERE email = $1`,
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

// GET /auth/me
router.get('/me', jwtMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
            [req.user.id]
        )
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' })
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PATCH /auth/me — update profile fields
router.patch('/me', jwtMiddleware, async (req, res) => {
    const { display_name, phone, timezone, language, notifications_enabled, theme } = req.body
    try {
        const result = await pool.query(
            `UPDATE users SET
               display_name          = COALESCE($1, display_name),
               phone                 = $2,
               timezone              = COALESCE($3, timezone),
               language              = COALESCE($4, language),
               notifications_enabled = COALESCE($5, notifications_enabled),
               theme                 = COALESCE($6, theme),
               updated_at            = NOW()
             WHERE id = $7
             RETURNING ${USER_FIELDS}`,
            [
                display_name?.trim() || null,
                phone?.trim() || null,
                timezone || null,
                language || null,
                notifications_enabled ?? null,
                theme || null,
                req.user.id
            ]
        )
        res.json(result.rows[0])
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// PATCH /auth/me/password — change password
router.patch('/me/password', jwtMiddleware, async (req, res) => {
    const { current_password, new_password } = req.body
    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'current_password and new_password are required' })
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' })
    }
    try {
        const result = await pool.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.user.id]
        )
        const user = result.rows[0]
        if (!user) return res.status(404).json({ error: 'User not found' })

        const valid = await argon2.verify(user.password_hash, current_password)
        if (!valid) return res.status(403).json({ error: 'Current password is incorrect' })

        const newHash = await argon2.hash(new_password)
        await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [newHash, req.user.id]
        )
        res.json({ message: 'Password updated successfully' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

module.exports = router
