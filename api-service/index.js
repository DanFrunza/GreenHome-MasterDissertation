const express = require('express');
const cors = require('cors');

const homesRouter = require('./src/routes/homes');
const devicesRouter = require('./src/routes/devices');
const measurementsRouter = require('./src/routes/measurements');
const usersRouter = require('./src/routes/users');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API Service running!'));

app.use('/homes', homesRouter);
app.use('/homes/:home_id/devices', devicesRouter);
app.use('/homes/:home_id/devices/:device_id/measurements', measurementsRouter);
app.use('/users', usersRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API Service listening on port ${PORT}`));