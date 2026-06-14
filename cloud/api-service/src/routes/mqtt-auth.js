const express = require('express')
const argon2  = require('argon2')
const pool    = require('../db')

const router = express.Router()

const SERVICE_USER = process.env.MQTT_SERVICE_USER || 'mqtt-service'
const SERVICE_PASS = process.env.MQTT_SERVICE_PASSWORD

// POST /mqtt/auth — called by go-auth for every connecting client
router.post('/auth', async (req, res) => {
    const { username, password } = req.body
    if (!username || !password) return res.sendStatus(400)

    if (username === SERVICE_USER) {
        return res.sendStatus(SERVICE_PASS && password === SERVICE_PASS ? 200 : 403)
    }

    try {
        const result = await pool.query(
            'SELECT mqtt_password_hash FROM home_credentials WHERE home_id = $1',
            [username]
        )
        if (!result.rows.length) return res.sendStatus(403)
        const valid = await argon2.verify(result.rows[0].mqtt_password_hash, password)
        return res.sendStatus(valid ? 200 : 403)
    } catch {
        return res.sendStatus(500)
    }
})

// POST /mqtt/superuser — mqtt-service gets superuser (unrestricted topic access)
router.post('/superuser', (req, res) => {
    const { username } = req.body
    return res.sendStatus(username === SERVICE_USER ? 200 : 403)
})

// POST /mqtt/acl — each home can only access its own home_id prefix
router.post('/acl', (req, res) => {
    const { username, topic } = req.body
    if (!username || !topic) return res.sendStatus(400)
    return res.sendStatus(topic.startsWith(`${username}/`) ? 200 : 403)
})

module.exports = router
