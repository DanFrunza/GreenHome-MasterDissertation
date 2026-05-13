const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres-db',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'mydb',
    user: process.env.DB_USER || 'user',
    password: process.env.DB_PASSWORD || 'password',
});

pool.on('error', (err) => {
    console.error('Unexpected DB error:', err);
});

module.exports = pool;