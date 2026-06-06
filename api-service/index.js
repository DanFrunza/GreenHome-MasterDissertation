const express = require('express')
const cors = require('cors')

const { jwtMiddleware } = require('./src/middleware/auth')
const { ownershipMiddleware } = require('./src/middleware/ownership')

const authRouter        = require('./src/routes/auth')
const homesRouter       = require('./src/routes/homes')
const devicesRouter     = require('./src/routes/devices')
const entitiesRouter    = require('./src/routes/entities')
const automationsRouter = require('./src/routes/automations')
const usersRouter       = require('./src/routes/users')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (_req, res) => res.send('API Service running!'))

// Public routes — no token required
app.use('/auth', authRouter)

// All routes below require a valid JWT
app.use(jwtMiddleware)

// User routes
app.use('/users', usersRouter)

// Home routes — ownership check applied on all /homes/:home_id/* sub-routes
app.use('/homes', homesRouter)
app.use('/homes/:home_id/devices',     ownershipMiddleware, devicesRouter)
app.use('/homes/:home_id/entities',    ownershipMiddleware, entitiesRouter)
app.use('/homes/:home_id/automations', ownershipMiddleware, automationsRouter)

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API Service listening on port ${PORT}`))
