const express = require('express');
const cors = require('cors');

const homesRouter = require('./src/routes/homes');
const devicesRouter = require('./src/routes/devices');
const entitiesRouter = require('./src/routes/entities');
const automationsRouter = require('./src/routes/automations');
const usersRouter = require('./src/routes/users');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => res.send('API Service running!'));

app.use('/homes', homesRouter);
app.use('/homes/:home_id/devices', devicesRouter);
app.use('/homes/:home_id/entities', entitiesRouter);
app.use('/homes/:home_id/automations', automationsRouter);
app.use('/users', usersRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API Service listening on port ${PORT}`));
